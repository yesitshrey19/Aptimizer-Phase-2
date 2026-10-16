import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, TreePine, Car, Palette } from "lucide-react";
import { api, apiError } from "../lib/api";
import { Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { num } from "../lib/format";
import PlanningModule from "./PlanningModule";

/**
 * Generative Studio — apartment planning plus facade, landscape and parking tools
 * under the single Design navigation entry.
 *
 * Apartment planning and these generation tools share one workspace so the
 * project has a single design entry point. The planning module keeps the saved
 * tower floor layouts that Reports and the 3D views also use.
 *
 * Facade, landscape and parking generation work before a boundary is drawn.
 */
export default function GenerativeStudioModule(props) {
  const { projectId, readOnly } = props;
  const [facades, setFacades] = useState([]);
  const [landscapeOpenSpace, setLandscapeOpenSpace] = useState(3500);
  const [landscapePlan, setLandscapePlan] = useState(null);
  const [parkingFootprint, setParkingFootprint] = useState(3000);
  const [parkingLayoutType, setParkingLayoutType] = useState("orthogonal");
  const [parkingPlan, setParkingPlan] = useState(null);
  const [generatingLandscape, setGeneratingLandscape] = useState(false);
  const [generatingParking, setGeneratingParking] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/generative-design/facade-options`)
      .then(({ data }) => setFacades(data || []))
      .catch(() => {});
  }, [projectId]);

  const generateLandscape = async () => {
    setGeneratingLandscape(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/generative-design/landscape`, {
        open_space_sqm: Number(landscapeOpenSpace) || 3500,
      });
      setLandscapePlan(data);
      toast.success("Generative landscape zoning computed!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setGeneratingLandscape(false);
    }
  };

  const generateParking = async () => {
    setGeneratingParking(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/generative-design/parking`, {
        footprint_sqm: Number(parkingFootprint) || 3000,
        layout_type: parkingLayoutType,
      });
      setParkingPlan(data);
      toast.success(`Generated ${data.total_capacity_bays} parking bays!`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setGeneratingParking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-blue-200 bg-blue-50/60 rounded-sm px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Generative Studio</h2>
        <p className="text-xs text-slate-600 mt-1">
          Apartment planning, shared AI floor plans, facade concepts, landscape zoning, and parking layouts in one workspace.
        </p>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Apartment planning & AI floor plans</h3>
        <p className="text-[11px] text-slate-500 mt-1">Configure towers and unit mix, generate layouts, and review the same saved drawing shown in Reports.</p>
      </div>
      <PlanningModule {...props} />

      <Section
        title="Facade, landscape & parking generation"
        description="Create architectural facade options, central park zoning, and automated parking bay layouts"
        testid="generative-design-studio-section"
      >
        {/* 1. FACADES */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Palette className="h-4 w-4 text-purple-600" /> Generative Facade Synthesis (5 Architectural Archetypes)
            </div>
            <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-semibold">
              Nano Banana & SDXL Ready
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {facades.map((fac) => (
              <div
                key={fac.style_id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-sm flex flex-col justify-between space-y-2 hover:border-purple-300 transition-colors"
                data-testid={`facade-card-${fac.style_id}`}
              >
                <div>
                  <div className="font-semibold text-xs text-slate-900">{fac.name}</div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-snug">{fac.description}</div>

                  <div className="mt-2 space-y-1 text-[10px] bg-white p-2 rounded border border-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-500">WWR (Glazing):</span>
                      <span className="font-mono font-bold text-slate-800">{fac.wwr_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Shading Coeff:</span>
                      <span className="font-mono text-slate-800">{fac.shading_coeff}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SHGC:</span>
                      <span className="font-mono text-slate-800">{fac.shgc}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Energy saving:</span>
                      <span className="font-mono text-emerald-700">{fac.annual_energy_savings_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cost premium:</span>
                      <span className="font-mono text-amber-700">+{fac.cost_premium_pct}%</span>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1.5 italic">{fac.recommended_for}</div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] w-full rounded-sm flex items-center justify-center gap-1 text-slate-600"
                    onClick={() => {
                      navigator.clipboard.writeText(fac.nano_banana_prompt || "");
                      toast.success(`Prompt copied for ${fac.name}!`);
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy Banana Prompt
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. LANDSCAPE & CENTRAL PARK ZONING */}
        <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-sm space-y-3 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
              <TreePine className="h-4 w-4 text-emerald-600" /> Landscape & Central Park Zoning
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-800">Open Space (m²):</span>
              <Input
                type="number"
                value={landscapeOpenSpace}
                onChange={(e) => setLandscapeOpenSpace(e.target.value)}
                className="w-24 h-7 text-xs rounded-sm bg-white"
                disabled={readOnly}
              />
              <Button
                size="sm"
                className="h-7 text-xs rounded-sm bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={generatingLandscape || readOnly}
                onClick={generateLandscape}
              >
                {generatingLandscape ? "Synthesizing…" : "Generate Park Zones"}
              </Button>
            </div>
          </div>

          {landscapePlan?.zones?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
              {landscapePlan.zones.map((zone, i) => (
                <div key={i} className="p-2.5 bg-white border border-emerald-200 rounded-sm text-xs space-y-1">
                  <div className="font-semibold text-slate-900">{zone.name}</div>
                  <div className="font-mono text-[11px] text-emerald-700 font-bold">{zone.area_sqm} m² ({zone.pct_of_open_space}%)</div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">{zone.type}</div>
                  <div className="text-[10px] text-slate-500 leading-tight">Canopy: {zone.canopy_cover_pct}%</div>
                  <div className="text-[10px] text-slate-600 truncate" title={zone.vegetation?.join(", ")}>
                    {zone.vegetation?.join(", ")}
                  </div>
                </div>
              ))}
              <div className="sm:col-span-5 text-[10px] font-mono text-emerald-800">
                Softscape {num(landscapePlan.softscape_pct, 0)}% · permeability index {landscapePlan.permeability_index}
              </div>
            </div>
          )}
        </div>

        {/* 3. AUTOMATED PARKING BAY GENERATOR */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Car className="h-4 w-4 text-blue-600" /> Automated Parking Bay Generator
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">Footprint (m²):</span>
              <Input
                type="number"
                value={parkingFootprint}
                onChange={(e) => setParkingFootprint(e.target.value)}
                className="w-24 h-7 text-xs rounded-sm bg-white"
                disabled={readOnly}
              />
              <Select value={parkingLayoutType} onValueChange={setParkingLayoutType} disabled={readOnly}>
                <SelectTrigger className="w-36 h-7 text-xs rounded-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orthogonal">Orthogonal 90°</SelectItem>
                  <SelectItem value="herringbone">Herringbone 45°/60°</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs rounded-sm bg-blue-600 hover:bg-blue-700 text-white"
                disabled={generatingParking || readOnly}
                onClick={generateParking}
              >
                {generatingParking ? "Generating…" : "Generate Bay Grid"}
              </Button>
            </div>
          </div>

          {parkingPlan && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 bg-white p-3 rounded border border-slate-200">
              <div>
                <span className="text-[11px] text-slate-500">Total Bays (ECS):</span>
                <div className="font-mono text-base font-bold text-slate-900">{parkingPlan.total_capacity_bays}</div>
                <div className="text-[10px] text-slate-500">
                  {parkingPlan.accessible_bays} accessible · {parkingPlan.ev_charging_bays} EV
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-500">Driveway Aisle Width:</span>
                <div className="font-mono text-sm font-semibold text-slate-800">{parkingPlan.driveway_width_m} m</div>
              </div>
              <div>
                <span className="text-[11px] text-slate-500">ECS Efficiency:</span>
                <div className="font-mono text-sm font-semibold text-emerald-700">{parkingPlan.ecs_efficiency_sqm_per_bay} m²/ECS</div>
              </div>
              <div>
                <span className="text-[11px] text-slate-500">Layout Geometry:</span>
                <div className="font-mono text-xs text-slate-700 uppercase">{parkingPlan.bay_angle_deg}° {parkingPlan.layout_type_plain || parkingPlan.layout_type}</div>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
