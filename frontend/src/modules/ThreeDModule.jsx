import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Box, Compass, Eye, Layers, Move3d, Scissors, SunMedium } from "lucide-react";
import { Section } from "../components/Field";
import { FloorPlate } from "../components/FloorPlate";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Slider } from "../components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  ROOM_COLORS, UNIT_COLORS, engineSiteShapes, engineTowerLayout, featureShapes, isLayoutCurrent,
  localBounds, originOf, polyToLocal, polygonSignature, sunAtHour, sunVector, terrainHeights,
  constrainedTowerLayout, spineTowerLayout, rectInsidePolygon,
} from "../lib/scene";
import { money, num } from "../lib/format";
import { api, apiError, syncTowersFromLayout } from "../lib/api";

const TOWER_RULE_PARAMS = {
  min_stair_width: (tm) => tm.stair_min_width,
  min_corridor_width: (tm) => tm.corridor_width,
  min_exits_per_floor: (tm) => tm.exits_per_floor,
  max_travel_distance_m: (tm) => tm.max_travel_distance_m,
  lift_shortfall: (tm) => Math.max(Math.ceil(tm.floors / 8) - tm.lift_count, 0),
};

const towerViolations = (rules, tm) =>
  (rules || [])
    .filter((r) => r.enabled !== false && TOWER_RULE_PARAMS[r.param])
    .map((r) => {
      const actual = Number(TOWER_RULE_PARAMS[r.param](tm) || 0);
      const ok = r.operator === "max" ? actual <= Number(r.threshold) : actual >= Number(r.threshold);
      return ok ? null : { code: r.code, label: r.label, actual, threshold: r.threshold, unit: r.unit };
    })
    .filter(Boolean);

// ------------------------------------------------------------------ scene parts
const Terrain = ({ bounds, terrain }) => {
  const geom = useMemo(() => {
    const seg = terrain.seg || 24;
    const g = new THREE.PlaneGeometry(bounds.width * 2.2, bounds.depth * 2.2, seg, seg);
    if (terrain.heights) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i += 1) pos.setZ(i, terrain.heights[i] ?? 0);
      g.computeVertexNormals();
    }
    return g;
  }, [bounds, terrain]);

  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.05, bounds.cz]} receiveShadow>
      <meshStandardMaterial color={terrain.heights ? "#D6D3C4" : "#E7E5E4"} roughness={0.95} />
    </mesh>
  );
};

/** The plot boundary, drawn so it survives being built on.
 *
 *  A line lying on the ground is legible only while nothing stands in front of it. On a
 *  massing model the boundary is the one reference every other object is judged against —
 *  "is this inside the site" is the question the view exists to answer — so it gets three
 *  parts: a translucent skirt standing up off the ground, which reads at any camera angle;
 *  the surveyed line itself, drawn with depth testing off so a tower can never hide it; and
 *  the road-frontage edges in amber on top of that.
 */
const PlotOutline = ({ pts, roadEdges }) => {
  const closed = [...pts, pts[0]];
  const SKIRT_H = 2.6;
  return (
    <group>
      {/* Vertical skirt: one quad per boundary segment. */}
      {pts.map((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.01) return null;
        return (
          <mesh
            key={`skirt-${i}`}
            position={[(a[0] + b[0]) / 2, SKIRT_H / 2, (a[1] + b[1]) / 2]}
            rotation={[0, Math.atan2(-dz, dx), 0]}
          >
            <planeGeometry args={[len, SKIRT_H]} />
            <meshBasicMaterial
              color="#2563EB"
              transparent
              opacity={0.16}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      <Line points={closed.map(([x, z]) => [x, SKIRT_H, z])} color="#1D4ED8" lineWidth={2}
            transparent opacity={0.75} depthTest={false} />
      <Line points={closed.map(([x, z]) => [x, 0.35, z])} color="#2563EB" lineWidth={3}
            depthTest={false} />
      {(roadEdges || []).map((r, i) => {
        const a = pts[r.edge_index % pts.length];
        const b = pts[(r.edge_index + 1) % pts.length];
        if (!a || !b) return null;
        return (
          <Line key={i} points={[[a[0], 0.5, a[1]], [b[0], 0.5, b[1]]]} color="#F59E0B"
                lineWidth={7} depthTest={false} />
        );
      })}
    </group>
  );
};

const CompassRose = ({ bounds, orientation }) => {
  const r = Math.max(bounds.width, bounds.depth) * 0.62;
  const rad = (orientation * Math.PI) / 180;
  return (
    <group position={[bounds.cx, 0.4, bounds.cz]}>
      <Line points={[[0, 0, 0], [0, 0, -r]]} color="#DC2626" lineWidth={2} />
      <Html position={[0, 1, -r - 3]} center>
        <div className="text-[10px] font-mono bg-white/95 border border-slate-200 px-1 rounded-sm">N</div>
      </Html>
      <Line points={[[0, 0, 0], [Math.sin(rad) * r * 0.8, 0, -Math.cos(rad) * r * 0.8]]} color="#2563EB" lineWidth={3} />
      <Html position={[Math.sin(rad) * r * 0.85, 1, -Math.cos(rad) * r * 0.85]} center>
        <div className="text-[10px] font-mono bg-white/95 border border-slate-200 px-1 rounded-sm">
          front {orientation}°
        </div>
      </Html>
    </group>
  );
};

const InstancedBuildings = ({ items }) => {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    items.forEach((b, i) => {
      const h = 6 + ((i * 7) % 5) * 3;
      m.compose(
        new THREE.Vector3(b.cx, h / 2, b.cz),
        new THREE.Quaternion(),
        new THREE.Vector3(Math.max(b.width, 4), h, Math.max(b.depth, 4))
      );
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, items.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#94A3B8" transparent opacity={0.75} />
    </instancedMesh>
  );
};

const FlatFeatures = ({ items, color, y = 0.06 }) =>
  items.map((f) => {
    const shape = new THREE.Shape(f.pts.map(([x, z]) => new THREE.Vector2(x, z)));
    return (
      <mesh key={f.id} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
    );
  });

/** Plot interior rendered in lush green lawn */
const PlotLushGreen = ({ pts }) => {
  const shape = useMemo(() => {
    if (!pts || pts.length < 3) return null;
    return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  }, [pts]);

  if (!shape) return null;
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#22C55E" roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
};

/** A THREE.Shape from a scene POLYGON — outer ring first, every later ring a hole.
 *
 *  Holes are the whole point here: the perimeter access road is an annulus, and a shape
 *  built from its outer ring alone is a slab covering the site rather than a road round
 *  the edge of it.
 */
const shapeFromPolygon = (rings) => {
  const outer = rings?.[0];
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, z)));
  for (let i = 1; i < rings.length; i += 1) {
    const hole = rings[i];
    if (hole && hole.length >= 3) {
      shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
    }
  }
  return shape;
};

/** The shared community green / play area reserved by the site planner. */
const ParkGround = ({ rings }) =>
  (rings || []).map((pts, i) =>
    pts.length < 3 ? null : (
      <group key={`park-${i}`}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} receiveShadow>
          <shapeGeometry args={[new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)))]} />
          <meshStandardMaterial color="#86EFAC" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <Line points={[...pts, pts[0]].map(([x, z]) => [x, 0.07, z])} color="#15803D" lineWidth={2} />
      </group>
    )
  );

/** Asphalt Black Roads with White Dotted/Dashed Centerlines and Concrete Kerbs */
const AsphaltRoadLayer = ({ rings, centrelines = [], y = 0.14 }) => {
  return (
    <group>
      {/* 1. Deep Asphalt Charcoal Black Surface */}
      {(rings || []).map((poly, i) => {
        const shape = shapeFromPolygon(poly);
        return shape === null ? null : (
          <mesh key={`asphalt-${i}`} rotation={[Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial color="#2A2A2E" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        );
      })}

      {/* 2. Concrete Road Curb Edges */}
      {(rings || []).map((pts, i) =>
        pts.length < 3 ? null : (
          <Line key={`curb-${i}`} points={[...pts, pts[0]].map(([x, z]) => [x, y + 0.02, z])} color="#64748B" lineWidth={1.5} />
        )
      )}

      {/* 3. White Dotted/Dashed Centerline */}
      {centrelines.map((points, i) => (
        <Line
          key={`centerline-${i}`}
          points={points.map(([x, z]) => [x, y + 0.04, z])}
          color="#FFFFFF"
          lineWidth={2.5}
          dashed
          dashScale={1.5}
          dashSize={1.5}
          gapSize={1.2}
        />
      ))}
    </group>
  );
};

/** Multi-storey Integrated Community Clubhouse housing Lounge, Gymnasium & Rooftop Swimming Pool */
const AmenityMesh = ({ block }) => {
  const isClubhouse = block.key === "clubhouse" || block.key === "mega";
  const h = isClubhouse ? Math.max(block.height || 10.5, 9.0) : (block.height || 4.5);
  const w = block.w || 25.0;
  const d = block.d || 15.0;

  if (!isClubhouse) {
    return (
      <group position={[block.x, 0, block.z]} rotation={[0, block.rotationY || 0, 0]}>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={block.key === "pool" ? "#0284C7" : "#A78BFA"}
            transparent
            opacity={block.key === "pool" ? 0.85 : 0.95}
            roughness={0.5}
          />
        </mesh>
        <Html position={[0, h + 2.5, 0]} center distanceFactor={140} occlude>
          <div
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border bg-violet-50 border-violet-300 text-violet-800 shadow-xs whitespace-nowrap"
            data-testid={`amenity-label-${block.key}`}
          >
            {block.name}
          </div>
        </Html>
      </group>
    );
  }

  const poolW = w * 0.65;
  const poolD = d * 0.55;

  return (
    <group position={[block.x, 0, block.z]} rotation={[0, block.rotationY || 0, 0]}>
      {/* 3-Storey Building Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.35} />
      </mesh>

      {/* Ground Floor Entrance & Community Lounge Glass Facade */}
      <mesh position={[0, 1.8, d / 2 + 0.05]}>
        <boxGeometry args={[w * 0.8, 3.2, 0.1]} />
        <meshStandardMaterial color="#93C5FD" transparent opacity={0.65} roughness={0.2} />
      </mesh>

      {/* 1st Floor Fitness Center & Gym Floor-to-ceiling Windows */}
      <mesh position={[0, 5.2, d / 2 + 0.05]}>
        <boxGeometry args={[w * 0.85, 3.0, 0.1]} />
        <meshStandardMaterial color="#60A5FA" transparent opacity={0.6} roughness={0.2} />
      </mesh>

      {/* Rooftop Wooden Sun Deck Terrace */}
      <mesh position={[0, h + 0.04, 0]} receiveShadow>
        <boxGeometry args={[w, 0.08, d]} />
        <meshStandardMaterial color="#D97706" roughness={0.6} />
      </mesh>

      {/* Rooftop Swimming Pool (Crystal Turquoise Water) */}
      <mesh position={[0, h + 0.09, 0]}>
        <boxGeometry args={[poolW, 0.06, poolD]} />
        <meshStandardMaterial color="#0284C7" transparent opacity={0.88} roughness={0.1} metalness={0.2} />
      </mesh>

      {/* White Pool Coping Border */}
      <mesh position={[0, h + 0.08, 0]}>
        <boxGeometry args={[poolW + 0.6, 0.04, poolD + 0.6]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
      </mesh>

      {/* Rooftop Glass Safety Parapet */}
      <mesh position={[0, h + 0.5, d / 2]}>
        <boxGeometry args={[w, 0.9, 0.05]} />
        <meshStandardMaterial color="#BFDBFE" transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, h + 0.5, -d / 2]}>
        <boxGeometry args={[w, 0.9, 0.05]} />
        <meshStandardMaterial color="#BFDBFE" transparent opacity={0.4} />
      </mesh>
      <mesh position={[w / 2, h + 0.5, 0]}>
        <boxGeometry args={[0.05, 0.9, d]} />
        <meshStandardMaterial color="#BFDBFE" transparent opacity={0.4} />
      </mesh>
      <mesh position={[-w / 2, h + 0.5, 0]}>
        <boxGeometry args={[0.05, 0.9, d]} />
        <meshStandardMaterial color="#BFDBFE" transparent opacity={0.4} />
      </mesh>

      <Html position={[0, h + 3.2, 0]} center distanceFactor={140} occlude>
        {/* Short enough to stay on one line at model scale. The full description of what
            the block contains belongs in the selection panel, not floating over the site —
            a tag long enough to wrap becomes a column of text standing in front of the
            towers it is meant to annotate. */}
        <div
          className="whitespace-nowrap text-[10px] font-mono font-medium px-2 py-0.5 rounded-sm border bg-blue-50/95 border-blue-300 text-blue-900 shadow-sm"
          data-testid={`amenity-label-${block.key}`}
        >
          Clubhouse · Gym · Pool
        </div>
      </Html>
    </group>
  );
};

const createBuildingGeometry = (shapeType = "curved", w = 24, h = 42, d = 16) => {
  const hw = w / 2;
  const hd = d / 2;

  if (shapeType === "cylindrical") {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, hw, hd, 0, Math.PI * 2, false, 0);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 36 });
    geom.rotateX(-Math.PI / 2);
    return geom;
  }

  if (shapeType === "chamfered") {
    const c = Math.min(w, d) * 0.2;
    const shape = new THREE.Shape();
    shape.moveTo(-hw + c, -hd);
    shape.lineTo(hw - c, -hd);
    shape.lineTo(hw, -hd + c);
    shape.lineTo(hw, hd - c);
    shape.lineTo(hw - c, hd);
    shape.lineTo(-hw + c, hd);
    shape.lineTo(-hw, hd - c);
    shape.lineTo(-hw, -hd + c);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    return geom;
  }

  if (shapeType === "stepped") {
    const h1 = h * 0.45;
    const h2 = h * 0.32;
    const h3 = Math.max(h - h1 - h2, 1);
    const g1 = new THREE.BoxGeometry(w, h1, d);
    g1.translate(0, h1 / 2, 0);
    const g2 = new THREE.BoxGeometry(w * 0.84, h2, d * 0.84);
    g2.translate(0, h1 + h2 / 2, 0);
    const g3 = new THREE.BoxGeometry(w * 0.68, h3, d * 0.68);
    g3.translate(0, h1 + h2 + h3 / 2, 0);
    try {
      const merged = mergeGeometries([g1, g2, g3], false);
      g1.dispose(); g2.dispose(); g3.dispose();
      if (merged) return merged;
    } catch {}
    const fallback = new THREE.BoxGeometry(w, h, d);
    fallback.translate(0, h / 2, 0);
    return fallback;
  }

  if (shapeType === "rectangular") {
    const geom = new THREE.BoxGeometry(w, h, d);
    geom.translate(0, h / 2, 0);
    return geom;
  }

  // Default: "curved" (streamline rounded corners)
  const radius = Math.min(w, d) * 0.22;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + radius, -hd);
  shape.lineTo(hw - radius, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + radius);
  shape.lineTo(hw, hd - radius);
  shape.quadraticCurveTo(hw, hd, hw - radius, hd);
  shape.lineTo(-hw + radius, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - radius);
  shape.lineTo(-hw, -hd + radius);
  shape.quadraticCurveTo(-hw, -hd, -hw + radius, -hd);
  const geom = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24 });
  geom.rotateX(-Math.PI / 2);
  return geom;
};

const PenthouseCrown = ({ tower, visibleFloors }) => {
  const topY = visibleFloors * tower.floorHeight;
  const count = Number(tower.penthouses) || 0;
  if (count <= 0) return null;

  return (
    <group position={[0, topY, 0]}>
      {/* 1. Teak wood rooftop sky terrace deck */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[tower.w * 0.9, 0.2, tower.d * 0.9]} />
        <meshStandardMaterial color="#B45309" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* 2. Glass balustrade around terrace perimeter */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[tower.w * 0.91, 1.1, tower.d * 0.91]} />
        <meshStandardMaterial color="#BAE6FD" transparent opacity={0.35} roughness={0.1} />
      </mesh>

      {/* 3. Luxury 5BHK Sky Villa Glass Pavilions */}
      {count === 1 ? (
        <group position={[0, 1.8, 0]}>
          <mesh castShadow>
            <boxGeometry args={[tower.w * 0.74, 3.2, tower.d * 0.74]} />
            <meshStandardMaterial color="#93C5FD" transparent opacity={0.82} roughness={0.2} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[tower.w * 0.55, 2.8, tower.d * 0.55]} />
            <meshStandardMaterial color="#FEF08A" transparent opacity={0.55} />
          </mesh>
          <mesh position={[0, 1.75, 0]}>
            <boxGeometry args={[tower.w * 0.82, 0.15, tower.d * 0.82]} />
            <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      ) : (
        <group>
          {[-1, 1].map((dir, idx) => (
            <group key={idx} position={[dir * (tower.w * 0.22), 1.8, 0]}>
              <mesh castShadow>
                <boxGeometry args={[tower.w * 0.38, 3.2, tower.d * 0.72]} />
                <meshStandardMaterial color="#93C5FD" transparent opacity={0.82} roughness={0.2} metalness={0.4} />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[tower.w * 0.28, 2.8, tower.d * 0.55]} />
                <meshStandardMaterial color="#FEF08A" transparent opacity={0.55} />
              </mesh>
              <mesh position={[0, 1.75, 0]}>
                <boxGeometry args={[tower.w * 0.44, 0.15, tower.d * 0.8]} />
                <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[tower.w * 0.12, 0.25, tower.d * 0.7]} />
            <meshStandardMaterial color="#4ADE80" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* Floating Crown Badge */}
      <Html position={[0, 4.4, 0]} center distanceFactor={140} occlude zIndexRange={[25, 0]}>
        <div className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-sm border bg-amber-50/95 border-amber-400 text-amber-900 shadow-xs whitespace-nowrap">
          👑 {count}x 5BHK Sky Villa
        </div>
      </Html>
    </group>
  );
};

const TowerMesh = ({ tower, metrics, detailed, sectionFloor, selected, dimmed, violations, onSelect, layers, showLabel = true }) => {
  const slabRef = useRef();
  const visibleFloors = sectionFloor ? Math.min(sectionFloor, tower.floors) : tower.floors;
  const totalH = visibleFloors * tower.floorHeight;

  const unitColor = useMemo(() => {
    const dominant = (tower.units || []).reduce((a, b) => (Number(b.count) > Number(a?.count || 0) ? b : a), null);
    return UNIT_COLORS[dominant?.type] || "#2563EB";
  }, [tower.units]);
  const color = violations.length ? "#DC2626" : selected ? "#1D4ED8" : unitColor;

  const buildingGeom = useMemo(
    () => createBuildingGeometry(tower.shape || "curved", tower.w, totalH, tower.d),
    [tower.shape, tower.w, totalH, tower.d]
  );

  useEffect(() => {
    if (!detailed || !slabRef.current) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const types = (tower.units || []).map((u) => u.type);
    for (let i = 0; i < visibleFloors; i += 1) {
      // Local to the tower group, which already carries its position and rotation.
      m.compose(
        new THREE.Vector3(0, i * tower.floorHeight + tower.floorHeight * 0.45, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(tower.w, tower.floorHeight * 0.82, tower.d)
      );
      slabRef.current.setMatrixAt(i, m);
      const t = types[i % Math.max(types.length, 1)];
      c.set(violations.length ? "#DC2626" : UNIT_COLORS[t] || "#2563EB");
      slabRef.current.setColorAt(i, c);
    }
    slabRef.current.count = visibleFloors;
    slabRef.current.instanceMatrix.needsUpdate = true;
    if (slabRef.current.instanceColor) slabRef.current.instanceColor.needsUpdate = true;
  }, [detailed, tower, visibleFloors, violations.length]);

  return (
    // Position and rotation live on the group, so every child is expressed in the tower's
    // own frame and an engine-supplied rotation applies to slabs, balconies and labels
    // together instead of each having to re-derive it.
    <group
      position={[tower.x, 0, tower.z]}
      rotation={[0, tower.rotationY || 0, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {detailed ? (
        <instancedMesh ref={slabRef} args={[null, null, Math.max(tower.floors, 1)]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#FFFFFF" transparent opacity={dimmed ? 0.25 : 0.95} roughness={0.6} />
        </instancedMesh>
      ) : (
        <mesh geometry={buildingGeom} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color={color} transparent opacity={dimmed ? 0.2 : 0.92} roughness={0.55} />
        </mesh>
      )}

      {/* 5BHK Penthouse Crown (min 0, max 2 at top of building) */}
      {Number(tower.penthouses) > 0 && (!sectionFloor || sectionFloor >= tower.floors) && (
        <PenthouseCrown tower={tower} visibleFloors={visibleFloors} />
      )}

      {layers.balconies &&
        Array.from({ length: visibleFloors }).map((_, i) => (
          <mesh key={i} position={[tower.w / 2 + 0.8, i * tower.floorHeight + 1, 0]}>
            <boxGeometry args={[1.6, 0.25, tower.d * 0.5]} />
            <meshStandardMaterial color="#CBD5E1" />
          </mesh>
        ))}

      {/* A label is drawn in the scene, not over it.
       *
       *  Without `distanceFactor` an Html label holds the same pixel size at every zoom, so
       *  on a site the engine packed with a dozen towers the chips stay full size while the
       *  buildings shrink, and the plan disappears under its own annotation. With it the
       *  label is a fixed size in METRES and recedes with the thing it names.
       *
       *  `occlude` keeps a label behind a mass from drawing through it, which is the other
       *  half of the pile-up: every label used to render on top of every tower. */}
      {(showLabel || selected) && (
        <Html
          position={[0, visibleFloors * tower.floorHeight + 4, 0]}
          center
          distanceFactor={140}
          occlude
          zIndexRange={[20, 0]}
        >
          <div
            onClick={onSelect}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border cursor-pointer whitespace-nowrap ${
              violations.length ? "bg-red-50 border-red-300 text-red-700" : "bg-white/95 border-slate-200"
            }`}
            data-testid={`tower-label-${tower.id}`}
          >
            {tower.name} · {tower.floors}F{tower.shape && tower.shape !== "curved" ? ` · ${tower.shape}` : ""}{Number(tower.penthouses) > 0 ? ` · 👑 ${tower.penthouses}x 5BHK` : ""}{violations.length ? ` · ${violations.length} fail` : ""}
          </div>
        </Html>
      )}
      {metrics && selected && (
        <Html position={[0, visibleFloors * tower.floorHeight + 9, 0]} center distanceFactor={140}>
          <div className="text-[10px] font-mono bg-blue-600 text-white px-1.5 py-0.5 rounded-sm">isolated</div>
        </Html>
      )}
    </group>
  );
};

const ParkingLayer = ({ bounds, parking, slots }) => {
  const ref = useRef();
  const levels = Number(parking?.basement_levels) || 0;
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    const perRow = Math.max(Math.floor(bounds.width / 3), 1);
    for (let i = 0; i < slots; i += 1) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      m.compose(
        new THREE.Vector3(bounds.minX + col * 3 + 1.5, -3 - Math.floor(row / 8) * 3, bounds.minZ + (row % 8) * 5.5 + 2.5),
        new THREE.Quaternion(),
        new THREE.Vector3(2.5, 0.12, 5)
      );
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [bounds, slots]);

  return (
    <group>
      {Array.from({ length: levels }).map((_, i) => (
        <mesh key={i} position={[bounds.cx, -3 - i * 3.2, bounds.cz]}>
          <boxGeometry args={[bounds.width * 0.9, 0.2, bounds.depth * 0.9]} />
          <meshStandardMaterial color="#78716C" transparent opacity={0.4} />
        </mesh>
      ))}
      {slots > 0 && (
        <instancedMesh ref={ref} args={[null, null, slots]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#38BDF8" transparent opacity={0.8} />
        </instancedMesh>
      )}
    </group>
  );
};

const CommonAreaLayer = ({ bounds, area }) => {
  if (!area) return null;
  const side = Math.sqrt(area);
  return (
    <mesh position={[bounds.minX + side / 2 + 2, 1.6, bounds.maxZ - side / 2 - 2]}>
      <boxGeometry args={[side, 3.2, side]} />
      <meshStandardMaterial color="#A7F3D0" transparent opacity={0.85} />
    </mesh>
  );
};

const Floor3D = ({ tower, floor, onSelectRoom, selectedRoomId, violated }) => {
  const rooms = tower.rooms || [];
  if (!rooms.length) return null;
  const b = localBounds(rooms.map((r) => [Number(r.x), Number(r.y)]));
  const ox = -(b.minX + b.maxX) / 2;
  const oz = -(b.minZ + b.maxZ) / 2;
  const wallH = 2.9;
  const y = (floor - 1) * tower.floorHeight;

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[b.width + 14, b.depth + 14]} />
        <meshStandardMaterial color="#F1F5F9" />
      </mesh>
      {rooms.map((r) => {
        const w = Number(r.w);
        const d = Number(r.h);
        const cx = Number(r.x) + w / 2 + ox;
        const cz = Number(r.y) + d / 2 + oz;
        const active = r.id === selectedRoomId;
        const col = violated ? "#FCA5A5" : ROOM_COLORS[r.type] || "#E2E8F0";
        const doorGap = Math.min(1.0, w * 0.35);
        return (
          <group key={r.id} onClick={(e) => { e.stopPropagation(); onSelectRoom(r); }}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.06, cz]}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color={active ? "#93C5FD" : col} />
            </mesh>
            {/* rear + side walls */}
            <mesh position={[cx, wallH / 2, cz - d / 2]}>
              <boxGeometry args={[w, wallH, 0.2]} />
              <meshStandardMaterial color={active ? "#2563EB" : "#CBD5E1"} />
            </mesh>
            <mesh position={[cx - w / 2, wallH / 2, cz]}>
              <boxGeometry args={[0.2, wallH, d]} />
              <meshStandardMaterial color={active ? "#2563EB" : "#CBD5E1"} />
            </mesh>
            <mesh position={[cx + w / 2, wallH / 2, cz]}>
              <boxGeometry args={[0.2, wallH, d]} />
              <meshStandardMaterial color={active ? "#2563EB" : "#CBD5E1"} />
            </mesh>
            {/* front wall split to leave a door opening */}
            <mesh position={[cx - (w - doorGap) / 4 - doorGap / 4, wallH / 2, cz + d / 2]}>
              <boxGeometry args={[(w - doorGap) / 2, wallH, 0.2]} />
              <meshStandardMaterial color={active ? "#2563EB" : "#CBD5E1"} />
            </mesh>
            <mesh position={[cx + (w - doorGap) / 4 + doorGap / 4, wallH / 2, cz + d / 2]}>
              <boxGeometry args={[(w - doorGap) / 2, wallH, 0.2]} />
              <meshStandardMaterial color={active ? "#2563EB" : "#CBD5E1"} />
            </mesh>
            {/* window band on the rear wall */}
            <mesh position={[cx, 1.9, cz - d / 2 - 0.02]}>
              <boxGeometry args={[Math.max(w * 0.5, 0.6), 1.0, 0.08]} />
              <meshStandardMaterial color="#7DD3FC" transparent opacity={0.7} />
            </mesh>
            <Html position={[cx, 3.2, cz]} center distanceFactor={60}>
              <div
                onClick={() => onSelectRoom(r)}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="text-[9px] font-mono bg-white/95 border border-slate-200 px-1 rounded-sm whitespace-nowrap cursor-pointer hover:border-blue-500"
                data-testid={`room3d-${r.id}`}
              >
                {r.name} · {(w * d).toFixed(1)} m²
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
};

/** Surface parking bays as ONE mesh.
 *
 *  Bay polygons are small rectangles handed back in their hundreds; a <mesh> each meant
 *  hundreds of draw calls and a visible stall on every scene rebuild. BufferGeometryUtils
 *  merges the shapes' triangulated triangles into a single buffer geometry — one draw
 *  call, identical pixels.
 */
const ParkingBays = ({ bays, y = 0.16 }) => {
  const geom = useMemo(() => {
    const geoms = [];
    (bays || []).forEach((pts) => {
      if (!pts || pts.length < 3) return;
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ShapeGeometry(shape);
      // +π/2 about X, the same mapping the per-bay meshes used: shape (x, y) -> scene
      // (x, 0, z) with shape-y becoming scene-z, so bays land exactly where they did.
      g.rotateX(Math.PI / 2);
      g.translate(0, y, 0);
      geoms.push(g);
    });
    if (!geoms.length) return null;
    return mergeGeometries(geoms, false);
  }, [bays, y]);

  if (!geom) return null;
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#94A3B8" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
};

/** Moves the LIVE camera between view modes.
 *
 *  <Canvas key={view}> used to force a full WebGL context teardown and rebuild on every
 *  tab switch. Browsers cap live contexts (~16) and evict the oldest when over, so after
 *  a few switches the canvas went permanently blank — the module's "stopped loading"
 *  failure. The scene now stays mounted and the camera simply travels.
 */
const CameraRig = ({ view, camDist, roomSpan }) => {
  const { camera } = useThree();
  const target = useMemo(() => {
    if (view === "floorplan")
      return { position: [roomSpan * 0.9, roomSpan * 1.1, roomSpan * 1.4], fov: 50, far: 4000 };
    if (view === "massing")
      return { position: [camDist * 0.5, camDist * 0.45, camDist * 0.5], fov: 50, far: 6000 };
    return { position: [camDist * 0.8, camDist * 0.6, camDist * 0.8], fov: 50, far: 6000 };
  }, [view, camDist, roomSpan]);

  useEffect(() => {
    camera.position.set(...target.position);
    if (camera.isPerspectiveCamera) {
      camera.fov = target.fov;
      camera.far = target.far;
      camera.updateProjectionMatrix();
    }
  }, [camera, target]);
  return null;
};

const SunLight = ({ azimuth, elevation, bounds }) => {
  const [x, y, z] = sunVector(azimuth, elevation, Math.max(bounds.width, 120) * 1.6);
  return (
    <>
      <directionalLight position={[x, y, z]} intensity={1.15} castShadow
        shadow-mapSize={[1024, 1024]} />
      <mesh position={[x * 0.65, y * 0.65, z * 0.65]}>
        <sphereGeometry args={[Math.max(bounds.width, 60) * 0.05, 16, 16]} />
        <meshBasicMaterial color="#FBBF24" />
      </mesh>
    </>
  );
};

const WalkController = ({ enabled, y }) => {
  const { camera } = useThree();
  const keys = useRef({});
  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true);
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useFrame((_, dt) => {
    if (!enabled) return;
    const speed = 12 * dt;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    if (keys.current.KeyW || keys.current.ArrowUp) camera.position.addScaledVector(dir, speed);
    if (keys.current.KeyS || keys.current.ArrowDown) camera.position.addScaledVector(dir, -speed);
    if (keys.current.KeyA || keys.current.ArrowLeft) camera.position.addScaledVector(side, speed);
    if (keys.current.KeyD || keys.current.ArrowRight) camera.position.addScaledVector(side, -speed);
    camera.position.y = y + 1.65;
  });
  return null;
};

// ------------------------------------------------------------------ module
export default function ThreeDModule({ project, analysis, update, readOnly, projectId, setProject }) {
  const [view, setView] = useState("site");
  const [detailed, setDetailed] = useState(false);
  const [simpleView, setSimpleView] = useState(false);
  const [sectionCut, setSectionCut] = useState(false);
  const [walk, setWalk] = useState(false);
  const [floor, setFloor] = useState(1);
  const [hour, setHour] = useState(12);
  const [season, setSeason] = useState("equinox");
  const [towerIdx, setTowerIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [layers, setLayers] = useState({ parking: true, balconies: true, common: true, violations: true, site: true, labels: true });
  const [autoRun, setAutoRun] = useState("");   // "", "running", or an error message
  const autoRanRef = useRef(false);             // fires at most once per mount

  // Memoised so the `|| []` fallback does not hand the scene a fresh array — and so a
  // fresh rebuild of the whole scene — on every render.
  const coords = useMemo(() => project.plot?.coordinates || [], [project.plot?.coordinates]);
  const gis = project.gis;

  // A layout generated for a different boundary, or by an older engine, is not a
  // description of this site — treat it as absent so it is regenerated rather than
  // drawn against a plot it was never packed into.
  const storedLayout = project.site_layout;
  const siteLayout = useMemo(
    () => (isLayoutCurrent(storedLayout, project.plot?.coordinates || []) ? storedLayout : null),
    [storedLayout, project.plot?.coordinates]
  );
  const layoutStale = !!storedLayout && !siteLayout;

  const scene = useMemo(() => {
    if (coords.length < 3) return null;
    const origin = originOf(coords);
    const pts = polyToLocal(coords, origin);
    const bounds = localBounds(pts);
    // Prefer the site layout engine, whose footprints are guaranteed inside the setback
    // envelope.
    const engine = engineTowerLayout(siteLayout, project.towers || []);
    const projectTowers = project.towers || [];

    // The fallback, used only until the engine has run for this plot. spineTowerLayout
    // arranges towers either side of a spine, which reads well — but it places by offset
    // from the centre and never tests the plot ring, so past a handful of towers it walks
    // its own rows straight off the site. It is therefore used only when every footprint
    // it produced is verified inside the boundary; otherwise constrainedTowerLayout packs
    // them centre-out with a containment test on each, and anything that genuinely will
    // not fit is reported rather than drawn somewhere it could never be built.
    let fallback = [];
    let dropped = [];
    if (projectTowers.length) {
      const spine = spineTowerLayout(projectTowers, pts, bounds);
      const spineFits = spine.length > 0
        && spine.every((t) => rectInsidePolygon(t.x, t.z, t.w, t.d, pts));
      if (spineFits) {
        fallback = spine;
      } else {
        fallback = constrainedTowerLayout(projectTowers, pts, bounds);
        dropped = fallback.dropped || [];
      }
    }

    const usingEngine = !!(engine && engine.length > 0);
    const towers = usingEngine ? engine : fallback;
    const site = engineSiteShapes(siteLayout);

    return {
      origin, pts, bounds,
      towers,
      fromEngine: usingEngine,
      engineEmpty: !!engine && engine.length === 0,
      droppedFromFallback: usingEngine ? [] : dropped,
      site,
      terrain: terrainHeights(gis, origin, bounds),
      buildings: featureShapes(gis, origin, "buildings"),
      green: featureShapes(gis, origin, "green", 25),
      water: featureShapes(gis, origin, "water", 15),
    };
  }, [coords, project.towers, siteLayout, gis]);

  const tower = scene?.towers[towerIdx];
  const tm = analysis?.areas?.towers?.[towerIdx];
  const violations = useMemo(
    () => (tm && layers.violations ? towerViolations(project.compliance_rules, tm) : []),
    [tm, project.compliance_rules, layers.violations]
  );
  const sun = sunAtHour(gis?.sun, hour, season);

  useEffect(() => {
    if (tower && floor > tower.floors) setFloor(tower.floors);
  }, [tower, floor]);

  // Generate a layout on first view rather than making the user find the button in
  // another module — the bounding-box fallback is never what anyone wants to look at.
  // Preview mode keeps it responsive; Plot & Site runs the full search.
  //
  // The ref guard is load-bearing: on success this writes site_layout back through
  // update(), and if that write did not land (save failure, reload) a state-only guard
  // would let the effect fire again on the next render, in a loop.
  useEffect(() => {
    if (siteLayout || autoRanRef.current || readOnly || !update || coords.length < 3) return;
    autoRanRef.current = true;
    let cancelled = false;
    setAutoRun("running");
    api
      .post("/site-layout/plan", { project, config: { fast_preview: true } })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.ok) {
          const stamped = { ...data, _client_signature: polygonSignature(coords) };
          update((p) => { p.site_layout = stamped; });
          setAutoRun("");
          // Same engine numbers the model is about to draw — the tower count and the
          // floors in each — pushed onto the project so the planning module, the area
          // calculations and this view all describe one building set.
          if (projectId && setProject)
            syncTowersFromLayout(projectId, stamped)
              .then((res) => {
                if (res && !cancelled)
                  setProject((prev) => ({ ...prev, towers: res.towers,
                                          ...(res.rev !== undefined && { rev: res.rev }) }));
              })
              .catch(() => {});
        } else {
          // Let a later render try again: latching the ref on failure would strand the
          // view on the fallback for the rest of the session.
          autoRanRef.current = false;
          setAutoRun(data.error?.message || "failed");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        autoRanRef.current = false;
        setAutoRun(apiError(e.response?.data?.detail));
      });
    return () => {
      cancelled = true;
      // StrictMode runs mount → cleanup → mount, and development double-invokes every
      // effect: the first fetch is cancelled here, and a latch left closed would stop
      // the second (real) mount from ever generating a layout. The `siteLayout` guard
      // above is what actually stops a loop once a layout exists, so unwinding the
      // latch on cleanup is safe — and lets a genuine failure retry on remount too.
      autoRanRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteLayout, coords.length, readOnly]);

  if (!scene)
    return (
      <p className="text-sm text-slate-500" data-testid="three-no-plot">
        Draw a plot polygon in Plot &amp; Site to generate the 3D model.
      </p>
    );

  const roomSpan = tower?.rooms?.length
    ? Math.max(
        ...tower.rooms.map((r) => Number(r.x) + Number(r.w)),
        ...tower.rooms.map((r) => Number(r.y) + Number(r.h))
      )
    : 20;
  const camDist = Math.max(scene.bounds.width, scene.bounds.depth, 60) * 1.5;
  const sectionFloor = sectionCut ? floor : 0;

  const unitTypeOf = (i) => {
    const units = tower?.units || [];
    return units.length ? units[i % units.length].type : "custom";
  };

  return (
    <div className="space-y-4">
      {scene.engineEmpty && (
        <p
          className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1"
          data-testid="three-engine-empty"
        >
          The site layout engine could not fit a single tower inside the setback envelope,
          so none are drawn. This is the engine's answer, not a missing result — reduce the
          setbacks or the minimum footprint in{" "}
          <span className="font-semibold">Setbacks &amp; Controls</span>, or enlarge the plot
          boundary.
        </p>
      )}

      {!scene.fromEngine && (
        <p
          className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1"
          data-testid="three-bbox-fallback-hint"
        >
          {autoRun === "running" ? (
            <>Generating a site layout — towers, roads and amenity blocks will appear in a moment…</>
          ) : autoRun ? (
            <>Could not generate a site layout ({autoRun}). Towers below are placed by the
              interim layout, which keeps every footprint inside the boundary but does not
              apply setbacks, roads or spacing. Adjust the setbacks in{" "}
              <span className="font-semibold">Plot &amp; Site</span> and retry.</>
          ) : (
            layoutStale ? (
              <>The saved layout was generated for a different plot boundary (or by an older
                version of the engine), so it is not being drawn. Towers below use the interim
                layout until a new one is generated.</>
            ) : (
              <>Towers are placed by the interim layout — inside the boundary, but without
                setbacks, access roads or inter-tower spacing. Run{" "}
                <span className="font-semibold">Plot &amp; Site → 3 · Generate layout</span> for
                the engine result.</>
            )
          )}
        </p>
      )}

      {scene.droppedFromFallback?.length > 0 && (
        <p
          className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1"
          data-testid="three-dropped-towers"
        >
          Not drawn, because no position inside the boundary could hold the declared
          footprint: <span className="font-semibold">{scene.droppedFromFallback.join(", ")}</span>.
          Reduce the footprint area or enlarge the plot.
        </p>
      )}
      <Section
        title="3D visualisation"
        description="Live from the same project document — plot polygon, GIS terrain, towers, floors, parking and compliance state."
        testid="three-controls-section"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px]">
              <Switch checked={simpleView} onCheckedChange={setSimpleView} data-testid="simple-view-toggle" />
              Simple 2D view
            </label>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {[
              ["site", "Site", Compass],
              ["massing", "Massing", Box],
              ["floorplan", "Floor plan", Layers],
            ].map(([key, label, Icon]) => (
              <Button
                key={key}
                size="sm"
                variant={view === key ? "default" : "outline"}
                className="h-8 rounded-sm text-xs"
                data-testid={`view-mode-${key}`}
                onClick={() => setView(key)}
              >
                <Icon className="h-3.5 w-3.5 mr-1" />
                {label}
              </Button>
            ))}
          </div>

          <Select value={String(towerIdx)} onValueChange={(v) => setTowerIdx(Number(v))}>
            <SelectTrigger className="h-8 w-40 rounded-sm text-xs" data-testid="three-tower-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scene.towers.map((t, i) => (
                <SelectItem key={t.id} value={String(i)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-[11px]">
            <Switch checked={detailed} onCheckedChange={setDetailed} data-testid="detailed-view-toggle" />
            Detailed floors
          </label>
          <label className="flex items-center gap-1.5 text-[11px]">
            <Switch checked={sectionCut} onCheckedChange={setSectionCut} data-testid="section-cut-toggle" />
            <Scissors className="h-3 w-3" /> Section cut
          </label>
          <label className="flex items-center gap-1.5 text-[11px]">
            <Switch checked={walk} onCheckedChange={setWalk} data-testid="walk-mode-toggle" />
            <Move3d className="h-3 w-3" /> Walk mode
          </label>
          {["labels", "parking", "balconies", "common", "violations"].map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-[11px] capitalize">
              <Switch
                checked={layers[k]}
                onCheckedChange={(v) => setLayers((l) => ({ ...l, [k]: v }))}
                data-testid={`layer-${k}-toggle`}
              />
              {k}
            </label>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span className="uppercase tracking-wide">Floor</span>
              <span className="font-mono" data-testid="three-floor-label">
                {floor} / {tower?.floors ?? 0} · {num((floor - 1) * (tower?.floorHeight || 3), 1)} m
              </span>
            </div>
            <Slider
              min={1}
              max={Math.max(tower?.floors || 1, 1)}
              step={1}
              value={[Math.min(floor, tower?.floors || 1)]}
              onValueChange={([v]) => setFloor(v)}
              data-testid="three-floor-slider"
            />
            <div className="flex gap-1 mt-1.5">
              <Button size="sm" variant="outline" className="h-6 px-2 rounded-sm text-[11px]"
                data-testid="three-floor-down" onClick={() => setFloor((f) => Math.max(1, f - 1))}>
                − floor
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2 rounded-sm text-[11px]"
                data-testid="three-floor-up"
                onClick={() => setFloor((f) => Math.min(tower?.floors || 1, f + 1))}>
                + floor
              </Button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span className="uppercase tracking-wide flex items-center gap-1">
                <SunMedium className="h-3 w-3" /> Time of day
              </span>
              <span className="font-mono" data-testid="three-sun-label">
                {hour}:00 · az {Math.round(sun.azimuth)}° alt {Math.round(sun.elevation)}°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Slider min={5} max={19} step={0.5} value={[hour]} onValueChange={([v]) => setHour(v)}
                className="flex-1" data-testid="three-sun-slider" />
              <Button size="sm" variant="outline" className="h-8 px-2 rounded-sm text-[11px]"
                data-testid="three-sun-earlier" onClick={() => setHour((h) => Math.max(5, h - 1))}>
                −1h
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2 rounded-sm text-[11px]"
                data-testid="three-sun-later" onClick={() => setHour((h) => Math.min(19, h + 1))}>
                +1h
              </Button>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger className="h-8 w-36 rounded-sm text-xs" data-testid="three-season-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summer_solstice">21 Jun</SelectItem>
                  <SelectItem value="equinox">21 Mar</SelectItem>
                  <SelectItem value="winter_solstice">21 Dec</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {view === "floorplan" && (
          <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-sm px-2 py-1 mt-3" data-testid="three-floorplan-readonly-hint">
            This is a live read-only preview of the room layout. To add, move, resize or delete rooms, use the{" "}
            <span className="font-semibold">Planning</span> tab — changes there update this view automatically.
          </p>
        )}
        {!gis && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1 mt-3" data-testid="three-no-gis">
            Run the GIS site analysis to drive the terrain surface and true sun path — a flat plane and an
            approximate sun arc are used until then.
          </p>
        )}
      </Section>

      {simpleView ? (
        <Section title={`Simple 2D view — ${tower?.name} floor ${floor}`} testid="three-simple-view">
          <FloorPlate rooms={tower?.rooms || []} selectedId={selected?.room?.id} onSelect={(id) =>
            setSelected({ type: "room", room: (tower?.rooms || []).find((r) => r.id === id) })} />
        </Section>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <div className="border border-slate-200 bg-white rounded-sm overflow-hidden" data-testid="three-canvas-wrapper">
            <Canvas
              shadows
              style={{ height: 560, background: "#EEF2F7" }}
              camera={{ fov: 50, far: 6000, position: [camDist * 0.8, camDist * 0.6, camDist * 0.8] }}
              onPointerMissed={() => setSelected(null)}
            >
              <CameraRig view={view} camDist={camDist} roomSpan={roomSpan} />
              <ambientLight intensity={0.55} />
              <hemisphereLight args={["#DCEAFE", "#B8B0A2", 0.5]} />
              <SunLight azimuth={sun.azimuth} elevation={sun.elevation} bounds={scene.bounds} />

              {view !== "floorplan" && (
                <>
                  <Terrain bounds={scene.bounds} terrain={scene.terrain} />
                  {/* Lush green lawn over the entire plot interior */}
                  <PlotLushGreen pts={scene.pts} />
                  <PlotOutline pts={scene.pts} roadEdges={project.plot?.road_edges} />
                  <CompassRose bounds={scene.bounds} orientation={project.plot?.orientation_deg || 0} />
                </>
              )}

              {view === "site" && (
                <>
                  <InstancedBuildings items={scene.buildings} />
                  <FlatFeatures items={scene.green} color="#16A34A" y={0.08} />
                  <FlatFeatures items={scene.water} color="#0EA5E9" y={0.1} />
                </>
              )}

              {/* Reserved circulation, parking, community green and clubhouse from the site engine */}
              {scene.site && view !== "floorplan" && layers.site && (
                <>
                  {/* Shared community green / play area. */}
                  <ParkGround rings={scene.site.green} />
                  {/* Asphalt black access ring road with white dashed centerlines */}
                  <AsphaltRoadLayer rings={scene.site.ring} centrelines={scene.site.ringCentrelines} y={0.13} />
                  {/* Asphalt black internal spine driveways with white dashed centerlines */}
                  <AsphaltRoadLayer rings={scene.site.driveways} centrelines={scene.site.drivewayCentrelines} y={0.14} />
                  {scene.site.pedestrianLinks.map((link, i) => (
                    <Line
                      key={`pedestrian-link-${i}`}
                      points={link.points.map(([x, z]) => [x, 0.1, z])}
                      color="#0F766E"
                      lineWidth={2}
                      dashed
                      dashScale={1.2}
                      dashSize={1.5}
                      gapSize={1}
                    />
                  ))}
                  {/* Surface parking bays — one merged mesh, not one mesh per bay: the
                      engine regularly emits 200+ bays and 200+ draw calls froze the
                      scene on every rebuild. */}
                  {scene.site.bays.length > 0 && (
                    <ParkingBays bays={scene.site.bays} />
                  )}
                  {/* Multi-storey Integrated Community Clubhouse with Rooftop Pool */}
                  {scene.site.amenities.map((a) => (
                    <AmenityMesh key={a.key} block={a} />
                  ))}
                </>
              )}

      {view !== "floorplan" &&
        scene.towers.map((t, i) => (
          <TowerMesh
            key={t.id}
            tower={t}
            metrics={analysis?.areas?.towers?.[i]}
            detailed={detailed}
            sectionFloor={sectionFloor}
            selected={i === towerIdx && selected?.type === "tower"}
            dimmed={selected?.type === "tower" && i !== towerIdx}
            violations={
              layers.violations && analysis?.areas?.towers?.[i]
                ? towerViolations(project.compliance_rules, analysis.areas.towers[i])
                : []
            }
            layers={layers}
            /* A dozen floating chips stack into a pile the plan disappears under (each
               also pays a per-frame occlusion readback). On a big scheme the selected
               tower's label is enough — its data is in the side panel — while a handful
               of towers can afford naming every one. */
            showLabel={layers.labels && (scene.towers.length <= 6 || i === towerIdx)}
            onSelect={() => {
              setTowerIdx(i);
              setSelected({ type: "tower", index: i });
            }}
          />
        ))}

              {view === "floorplan" && tower && (
                <Floor3D
                  tower={tower}
                  floor={floor}
                  selectedRoomId={selected?.room?.id}
                  violated={violations.length > 0}
                  onSelectRoom={(room) => setSelected({ type: "room", room })}
                />
              )}

              {layers.parking && view !== "floorplan" && (
                <ParkingLayer bounds={scene.bounds} parking={project.parking}
                  slots={Math.min(analysis?.parking?.provided_slots || 0, 220)} />
              )}
              {layers.common && view !== "floorplan" && (
                <CommonAreaLayer bounds={scene.bounds} area={tower?.commonArea} />
              )}

              {walk ? (
                <>
                  <PointerLockControls />
                  <WalkController enabled={walk} y={view === "floorplan" ? (floor - 1) * (tower?.floorHeight || 3) : 0} />
                </>
              ) : (
                <OrbitControls makeDefault enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.05} />
              )}
            </Canvas>
            <div className="px-3 py-1.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-3">
              <Eye className="h-3 w-3" />
              {walk ? "Walk mode: click the scene to lock the pointer, WASD to move, Esc to exit" :
                "Drag to orbit · scroll to zoom · right-drag to pan · click a tower or room for details"}
            </div>
          </div>

          <aside className="border border-slate-200 bg-white rounded-sm p-4 space-y-3" data-testid="three-side-panel">
            <h3 className="text-sm font-semibold tracking-tight">Selection</h3>
            {selected?.type === "tower" && tm ? (
              <div className="space-y-2 text-sm" data-testid="selection-tower">
                <div className="font-semibold">{scene.towers[selected.index]?.name}</div>
                {[
                  ["Floors", tm.floors],
                  ["Architectural Form", (scene.towers[selected.index]?.shape || "curved").toUpperCase()],
                  ...(Number(scene.towers[selected.index]?.penthouses) > 0
                    ? [["Penthouse Crown", `👑 ${scene.towers[selected.index].penthouses}x 5BHK Sky Villa`]]
                    : []),
                  ["Height", `${num(tm.height_m, 1)} m`],
                  ["Units", tm.total_units],
                  ["Carpet", `${num(tm.carpet_sqm, 0)} m²`],
                  ["Built-up", `${num(tm.builtup_sqm, 0)} m²`],
                  ["Cost / m²", money(analysis?.cost?.per_sqm, analysis?.cost?.currency)],
                  ["Est. tower cost", money((analysis?.cost?.per_sqm || 0) * tm.builtup_sqm, analysis?.cost?.currency)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500 text-xs uppercase tracking-wide">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
                <div className={`rounded-sm px-2 py-1.5 text-xs border ${
                  violations.length ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`} data-testid="selection-compliance">
                  {violations.length
                    ? violations.map((v) => `[${v.code}] ${v.label}: ${v.actual}${v.unit} vs ${v.threshold}${v.unit}`).join(" · ")
                    : "Passes all tower-level compliance rules"}
                </div>
              </div>
            ) : selected?.type === "room" && selected.room ? (
              <div className="space-y-2 text-sm" data-testid="selection-room">
                <div className="font-semibold">{selected.room.name}</div>
                {[
                  ["Type", selected.room.type],
                  ["Carpet area", `${num(Number(selected.room.w) * Number(selected.room.h), 2)} m²`],
                  ["Dimensions", `${num(selected.room.w, 1)} × ${num(selected.room.h, 1)} m`],
                  ["Cost / m²", money(analysis?.cost?.per_sqm, analysis?.cost?.currency)],
                  [
                    "Room cost",
                    money((analysis?.cost?.per_sqm || 0) * Number(selected.room.w) * Number(selected.room.h),
                      analysis?.cost?.currency),
                  ],
                  ["Floor", `${floor} of ${tower?.floors}`],
                  ["Unit type on floor", unitTypeOf(floor - 1).toUpperCase()],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500 text-xs uppercase tracking-wide">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
                <div className={`rounded-sm px-2 py-1.5 text-xs border ${
                  violations.length ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}>
                  {violations.length
                    ? `Floor flagged: ${violations.map((v) => v.code).join(", ")}`
                    : `Compliance: ${analysis?.compliance?.passed}/${analysis?.compliance?.total} rules pass`}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Click a tower (Site / Massing view) or a room (Floor plan view) to see its live calculated data.
              </p>
            )}

            <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px] text-slate-500">
              <div className="flex justify-between">
                <span>Terrain source</span>
                <span className="font-mono">{scene.terrain.heights ? `GIS · relief ${num(scene.terrain.relief, 1)} m` : "flat"}</span>
              </div>
              {scene.site?.parkArea != null && (
                <div className="flex justify-between" data-testid="three-park-area">
                  <span>Community green</span>
                  <span className="font-mono">{num(scene.site.parkArea, 0)} m²</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Parking slots rendered</span>
                <span className="font-mono">{Math.min(analysis?.parking?.provided_slots || 0, 220)}</span>
              </div>
              <div className="flex justify-between">
                <span>Nearby buildings</span>
                <span className="font-mono">{scene.buildings.length}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
