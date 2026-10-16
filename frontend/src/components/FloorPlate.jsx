import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";

const COLORS = {
  living: "#F0F7FF",
  bedroom: "#EEF2FF",
  kitchen: "#FFFBEB",
  bathroom: "#F0FDF4",
  balcony: "#F8FAFC",
  terrace: "#F8FAFC",
  utility: "#FEF3C7",
  common: "#F1F5F9",
  closet: "#FDF2F8",
  entrance: "#FAF5FF",
  foyer: "#FAF5FF",
  study: "#EEF2FF",
  office: "#EEF2FF",
  pooja: "#FEF9C3",
  servant: "#F8FAFC",
  shaft: "#E2E8F0",
  pantry: "#FFFBEB",
  // Circulation inside a flat. Kept the same slate as the shared corridor so a plan reads
  // as one connected route from the lift lobby to a bedroom door, not two unrelated greys.
  passage: "#F1F5F9",
};

export const FloorPlate = ({ rooms = [], selectedId, onSelect, corridor }) => {
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const containerRef = useRef(null);

  // Wheel zoom with passive: false to prevent scrolling parent container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((prev) => Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.4), 3.5));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const validRooms = (Array.isArray(rooms) ? rooms : []).filter((r) => r && typeof r === "object");
  if (!validRooms.length) {
    return (
      <div className="flex items-center justify-center h-[340px] bg-slate-50 border border-slate-200 rounded-sm text-sm text-slate-500">
        No rooms defined for this floor plate. Click &ldquo;AI Generate&rdquo; or &ldquo;Algorithmic&rdquo; above.
      </div>
    );
  }

  const xs = validRooms.map((r) => (Number.isFinite(Number(r.x)) ? Number(r.x) : 0));
  const ys = validRooms.map((r) => (Number.isFinite(Number(r.y)) ? Number(r.y) : 0));
  const x2s = validRooms.map((r) => {
    const x = Number.isFinite(Number(r.x)) ? Number(r.x) : 0;
    const w = Number.isFinite(Number(r.w)) ? Number(r.w) : 3;
    return x + w;
  });
  const y2s = validRooms.map((r) => {
    const y = Number.isFinite(Number(r.y)) ? Number(r.y) : 0;
    const h = Number.isFinite(Number(r.h)) ? Number(r.h) : 3;
    return y + h;
  });

  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = x2s.length ? Math.max(...x2s) + 1 : 20;
  const maxY = y2s.length ? Math.max(...y2s) + 1 : 20;
  const scale = 36;
  const padding = 20;

  const svgW = Math.max((maxX - minX + 2) * scale + padding * 2, 400);
  const svgH = Math.max((maxY - minY + 2) * scale + padding * 2, 300);

  const units = [];
  const seenUnits = new Set();
  validRooms.forEach((r) => {
    if (r.unit_id == null || seenUnits.has(r.unit_id)) return;
    seenUnits.add(r.unit_id);
    const inUnit = validRooms.filter((x) => x.unit_id === r.unit_id);
    const uxs = inUnit.map((x) => (Number.isFinite(Number(x.x)) ? Number(x.x) : 0));
    const uys = inUnit.map((x) => (Number.isFinite(Number(x.y)) ? Number(x.y) : 0));
    const ux2s = inUnit.map((x) => (Number.isFinite(Number(x.x)) ? Number(x.x) : 0) + (Number.isFinite(Number(x.w)) ? Number(x.w) : 3));
    const uy2s = inUnit.map((x) => (Number.isFinite(Number(x.y)) ? Number(x.y) : 0) + (Number.isFinite(Number(x.h)) ? Number(x.h) : 3));
    const ux = Math.min(...uxs);
    const uy = Math.min(...uys);
    const ux2 = Math.max(...ux2s);
    const uy2 = Math.max(...uy2s);
    units.push({ id: r.unit_id, type: r.unit_type, index: r.unit_index, x: ux, y: uy, w: Math.max(ux2 - ux, 1), h: Math.max(uy2 - uy, 1) });
  });

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    movedRef.current = false;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx - pan.x, dy - pan.y) > 3) {
      movedRef.current = true;
    }
    setPan({ x: dx, y: dy });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      className="relative flex flex-col bg-slate-900/5 rounded-sm border border-slate-200 shadow-inner overflow-hidden select-none"
      data-testid="floor-plate-svg"
    >
      {/* Top Header & Zoom Controls Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/90 backdrop-blur-xs border-b border-slate-200 text-xs text-slate-600 z-10">
        <span className="flex items-center gap-2 font-medium">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" />
          Floor Plate View
          <span className="text-[11px] font-mono text-slate-400 font-normal hidden sm:inline">
            · 1m = {scale}px
          </span>
        </span>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0 rounded-xs text-slate-600 hover:text-slate-900"
            onClick={() => setZoom((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.4))}
            title="Zoom Out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="font-mono text-[11px] px-1.5 min-w-[42px] text-center text-slate-700 font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0 rounded-xs text-slate-600 hover:text-slate-900"
            onClick={() => setZoom((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 3.5))}
            title="Zoom In"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-1.5 rounded-xs text-[11px] text-slate-600 hover:text-slate-900 ml-1"
            onClick={handleReset}
            title="Fit to Screen"
          >
            <RotateCcw className="h-2.5 w-2.5 mr-1" /> Fit
          </Button>
        </div>
      </div>

      {/* Main Floor Plan Viewport — no scrollbars, cleanly auto-fitted */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative w-full h-[400px] md:h-[460px] flex items-center justify-center overflow-hidden bg-slate-100/70 ${
          isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.12s ease-out",
            width: "100%",
            height: "100%",
          }}
          className="flex items-center justify-center p-3"
        >
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: `${svgW}px`,
              maxHeight: "100%",
            }}
            preserveAspectRatio="xMidYMid meet"
            className="bg-white rounded border border-slate-300 shadow-sm"
          >
            <defs>
              <pattern id="arch-grid" width={scale} height={scale} patternUnits="userSpaceOnUse">
                <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#F1F5F9" strokeWidth="1" />
              </pattern>
              <pattern id="balcony-rail" width="6" height="6" patternUnits="userSpaceOnUse">
                <line x1="0" y1="6" x2="6" y2="0" stroke="#CBD5E1" strokeWidth="1" />
              </pattern>
              <pattern id="shaft-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke="#94A3B8" strokeWidth="1" />
              </pattern>
              <pattern id="terrace-deck" width="12" height="12" patternUnits="userSpaceOnUse">
                <rect width="12" height="12" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="0.5" />
                <line x1="0" y1="0" x2="12" y2="12" stroke="#CBD5E1" strokeWidth="0.75" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#arch-grid)" />

            {/* Vastu & Cardinal Compass */}
            <g transform="translate(42, 42)">
              <circle cx="0" cy="0" r="24" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="20" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2 2" />
              {/* Needle */}
              <path d="M 0 -17 L 4 5 L 0 2 L -4 5 Z" fill="#2563EB" />
              <path d="M 0 17 L 4 5 L 0 2 L -4 5 Z" fill="#94A3B8" />
              {/* Cardinal Labels */}
              <text x="0" y="-19" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1E40AF" fontFamily="JetBrains Mono">N</text>
              <text x="0" y="26" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#64748B" fontFamily="JetBrains Mono">S</text>
              <text x="23" y="2.5" textAnchor="start" fontSize="7" fontWeight="bold" fill="#64748B" fontFamily="JetBrains Mono">E</text>
              <text x="-23" y="2.5" textAnchor="end" fontSize="7" fontWeight="bold" fill="#64748B" fontFamily="JetBrains Mono">W</text>
              {/* Vastu Quadrant Identifiers */}
              <text x="13" y="-9" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#D97706" fontFamily="sans-serif">NE</text>
              <text x="13" y="14" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#EA580C" fontFamily="sans-serif">SE</text>
              <text x="-13" y="14" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#2563EB" fontFamily="sans-serif">SW</text>
              <text x="-13" y="-9" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#059669" fontFamily="sans-serif">NW</text>
            </g>

            {corridor > 0 && (
              <rect
                x={padding}
                y={(maxY - minY - corridor) * scale + padding}
                width={(maxX - minX) * scale}
                height={corridor * scale}
                fill="#E2E8F0"
                stroke="#94A3B8"
                strokeWidth="1.5"
              />
            )}

            {/* Unit boundaries */}
            {units.map((u) => (
              <g key={`unit-${u.id}`}>
                <rect
                  x={(u.x - minX) * scale + padding}
                  y={(u.y - minY) * scale + padding}
                  width={u.w * scale}
                  height={u.h * scale}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  rx={2}
                />
                <rect
                  x={(u.x - minX) * scale + padding + 4}
                  y={Math.max((u.y - minY) * scale + padding - 18, 4)}
                  width={Math.max(u.w * scale - 8, 90)}
                  height="16"
                  fill="#EFF6FF"
                  stroke="#BFDBFE"
                  rx={2}
                />
                <text
                  x={(u.x - minX) * scale + padding + 8}
                  y={Math.max((u.y - minY) * scale + padding - 6, 16)}
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#1E40AF"
                >
                  UNIT {Number(u.index) + 1} · {String(u.type || "").toUpperCase()}
                </text>
              </g>
            ))}

            {/* Rooms */}
            {validRooms.map((r) => {
              const active = r.id === selectedId;
              const xVal = Number.isFinite(Number(r.x)) ? Number(r.x) : 0;
              const yVal = Number.isFinite(Number(r.y)) ? Number(r.y) : 0;
              const wVal = Math.max(Number.isFinite(Number(r.w)) ? Number(r.w) : 3, 0.5);
              const hVal = Math.max(Number.isFinite(Number(r.h)) ? Number(r.h) : 3, 0.5);
              const rx = (xVal - minX) * scale + padding;
              const ry = (yVal - minY) * scale + padding;
              const rw = wVal * scale;
              const rh = hVal * scale;
              const areaSqm = wVal * hVal;
              const areaSqft = areaSqm * 10.7639;
              const isBalcony = r.type === "balcony";
              const isTerrace = r.type === "terrace";
              const isShaft = r.type === "shaft";
              const isPooja = r.type === "pooja";
              const hasWindow = r.has_window || r.type === "living" || r.type === "bedroom";
              const target = r.door_to && validRooms.find((candidate) =>
                candidate.id !== r.id && (
                  candidate.id === `${r.unit_id}-${r.door_to}` ||
                  candidate.id === r.door_to ||
                  (r.unit_id && candidate.unit_id === r.unit_id && candidate.id.endsWith(`-${r.door_to}`)) ||
                  (candidate.name && candidate.name.toLowerCase() === String(r.door_to).toLowerCase())
                )
              );
              const mainEntry = r.main_entrance === true;
              let doorEdge = null;
              if (mainEntry) {
                doorEdge = r.entry_edge || "S";
              } else if (target) {
                const tx = Number(target.x);
                const ty = Number(target.y);
                const tw = Number(target.w);
                const th = Number(target.h);
                const epsilon = 0.25;
                if (Math.abs((xVal + wVal) - tx) < epsilon) doorEdge = "E";
                else if (Math.abs(xVal - (tx + tw)) < epsilon) doorEdge = "W";
                else if (Math.abs((yVal + hVal) - ty) < epsilon) doorEdge = "S";
                else if (Math.abs(yVal - (ty + th)) < epsilon) doorEdge = "N";
              }
              const doorWidth = Math.min(32, doorEdge === "N" || doorEdge === "S" ? rw * 0.42 : rh * 0.42);
              const doorX = doorEdge === "W" ? rx : doorEdge === "E" ? rx + rw : rx + rw / 2;
              const doorY = doorEdge === "N" ? ry : doorEdge === "S" ? ry + rh : ry + rh / 2;

              return (
                <g
                  key={r.id}
                  onClick={(e) => {
                    if (movedRef.current) return;
                    e.stopPropagation();
                    if (onSelect) onSelect(r.id);
                  }}
                  className="cursor-pointer group"
                  data-testid={`floor-room-${r.id}`}
                >
                  {/* Room floor */}
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={isShaft ? "url(#shaft-hatch)" : isTerrace ? "url(#terrace-deck)" : (COLORS[r.type] || "#FFFFFF")}
                    stroke={active ? "#2563EB" : isPooja ? "#D97706" : isShaft ? "#64748B" : "#1E293B"}
                    strokeWidth={active ? 2.5 : isPooja ? 2.0 : 1.5}
                    strokeDasharray={isShaft ? "4 2" : undefined}
                  />

                  {isBalcony && (
                    <rect x={rx + 2} y={ry + 2} width={rw - 4} height={rh - 4} fill="url(#balcony-rail)" />
                  )}

                  {/* Exterior window band if applicable */}
                  {hasWindow && !isBalcony && !isTerrace && (
                    <line
                      x1={rx + 8}
                      y1={ry + 1}
                      x2={rx + Math.max(rw - 8, 15)}
                      y2={ry + 1}
                      stroke="#38BDF8"
                      strokeWidth="3.5"
                    />
                  )}

                  {/* A door is drawn only when the generator has scheduled one.  The prior
                      display put an identical doorway on every room, which made a unit look
                      as though it had several entrances and hid the intended circulation. */}
                  {doorEdge && !isBalcony && !isTerrace && !isShaft && (
                    <g aria-label={mainEntry ? "Main entrance" : `Door to ${r.door_to}`}>
                      {doorEdge === "N" || doorEdge === "S" ? (
                        <>
                          <line x1={doorX - doorWidth / 2} y1={doorY} x2={doorX + doorWidth / 2} y2={doorY} stroke="#FFFFFF" strokeWidth="4" />
                          <line x1={doorX - doorWidth / 2} y1={doorY} x2={doorX + doorWidth / 2} y2={doorY} stroke={mainEntry ? "#2563EB" : "#475569"} strokeWidth={mainEntry ? "2.5" : "1.5"} />
                          <path d={`M ${doorX - doorWidth / 2} ${doorY} A ${doorWidth} ${doorWidth} 0 0 ${doorEdge === "N" ? 0 : 1} ${doorX + doorWidth / 2} ${doorY + (doorEdge === "N" ? doorWidth * 0.55 : -doorWidth * 0.55)}`} fill="none" stroke="#94A3B8" strokeWidth="1" strokeDasharray="2 2" />
                        </>
                      ) : (
                        <>
                          <line x1={doorX} y1={doorY - doorWidth / 2} x2={doorX} y2={doorY + doorWidth / 2} stroke="#FFFFFF" strokeWidth="4" />
                          <line x1={doorX} y1={doorY - doorWidth / 2} x2={doorX} y2={doorY + doorWidth / 2} stroke={mainEntry ? "#2563EB" : "#475569"} strokeWidth={mainEntry ? "2.5" : "1.5"} />
                          <path d={`M ${doorX} ${doorY - doorWidth / 2} A ${doorWidth} ${doorWidth} 0 0 ${doorEdge === "W" ? 1 : 0} ${doorX + (doorEdge === "W" ? doorWidth * 0.55 : -doorWidth * 0.55)} ${doorY + doorWidth / 2}`} fill="none" stroke="#94A3B8" strokeWidth="1" strokeDasharray="2 2" />
                        </>
                      )}
                      {mainEntry && <text x={doorX} y={doorY - 7} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#1D4ED8">MAIN ENTRY</text>}
                    </g>
                  )}

                  {/* Vastu Sector Badge */}
                  {r.vastu && rw > 45 && (
                    <text
                      x={rx + rw - 6}
                      y={ry + 14}
                      textAnchor="end"
                      fontFamily="JetBrains Mono, monospace"
                      fontSize="8"
                      fontWeight="bold"
                      fill={isPooja ? "#B45309" : "#2563EB"}
                    >
                      {r.vastu.split(" ")[0]}
                    </text>
                  )}

                  {/* Room name */}
                  <text
                    x={rx + 8}
                    y={ry + 16}
                    fontFamily="sans-serif"
                    fontSize="10"
                    fontWeight="600"
                    fill={active ? "#1D4ED8" : isPooja ? "#92400E" : "#0F172A"}
                  >
                    {isPooja ? `🕉 ${r.name}` : r.name}
                  </text>

                  {/* Dual metric area label: m² and sq.ft */}
                  {!isShaft && (
                    <text
                      x={rx + 8}
                      y={ry + 30}
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#475569"
                    >
                      {areaSqm.toFixed(1)} m² <tspan fill="#94A3B8">({areaSqft.toFixed(0)} sqft)</tspan>
                    </text>
                  )}

                  {/* Dimensions */}
                  <text
                    x={rx + 8}
                    y={ry + (isShaft ? 30 : 42)}
                    fontSize="8"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#94A3B8"
                  >
                    {Number(r.w).toFixed(1)}m × {Number(r.h).toFixed(1)}m
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Floating Pan & Zoom Hint */}
        <div className="absolute bottom-2 right-3 pointer-events-none text-[10px] font-mono text-slate-400 bg-white/75 px-1.5 py-0.5 rounded-xs border border-slate-200/60 shadow-2xs">
          Scroll to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
};

