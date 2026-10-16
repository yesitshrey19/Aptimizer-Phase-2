import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Metric, NumField, Section } from "../components/Field";
import FarPanel from "../components/FarPanel";
import AreaDerivationPanel from "../components/AreaDerivationPanel";
import { Markdown } from "../components/AiPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { api, apiError } from "../lib/api";
import { int, num } from "../lib/format";

const EXPLAIN_FIGURES = [
  { id: "far", label: "FAR" },
  { id: "ground_coverage", label: "Ground coverage" },
  { id: "total_units", label: "Total units" },
  { id: "parking_required", label: "Parking required" },
  { id: "cost_total", label: "Total cost" },
  { id: "seismic_base_shear", label: "Seismic base shear" },
];

export default function CalculationsModule({ project, analysis, update, readOnly, projectId }) {
  const a = analysis?.areas;
  const cfg = project.config || {};
  const setCfg = (k, v) => update((p) => { p.config[k] = v; });
  const cf = analysis?.capacity_forecast;
  const [explaining, setExplaining] = useState(null);
  const [explainBusy, setExplainBusy] = useState("");

  const explain = async (figure) => {
    setExplainBusy(figure);
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/explain/${figure}`);
      setExplaining(data);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setExplainBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Area statement" description="Live from plot geometry and apartment planning" testid="area-statement-section">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Plot area" value={num(a?.plot_area_sqm, 2)} unit="m²" testid="calc-plot-area" />
          <Metric label="Plot area" value={num(a?.plot_area_acres, 4)} unit="acres" testid="calc-plot-acres" />
          <Metric label="Carpet area" value={num(a?.carpet_area_sqm, 2)} unit="m²" testid="calc-carpet" />
          <Metric label="Built-up area" value={num(a?.builtup_area_sqm, 2)} unit="m²" testid="calc-builtup" />
          <Metric label="Super built-up" value={num(a?.super_builtup_area_sqm, 2)} unit="m²" testid="calc-super-builtup" />
          <Metric label="Ground footprint" value={num(a?.ground_footprint_sqm, 2)} unit="m²" testid="calc-footprint" />
          <Metric label="Ground coverage" value={num(a?.ground_coverage_pct, 2)} unit="%" testid="calc-coverage" />
          <Metric label="Open space" value={`${num(a?.open_space_sqm, 0)} (${num(a?.open_space_pct, 1)}%)`} unit="m²" testid="calc-open-space" />
          <Metric label="FAR" value={num(a?.far, 3)} testid="calc-far" />
          <Metric label="FSI" value={num(a?.fsi, 3)} testid="calc-fsi" />
          <Metric label="Units" value={int(a?.total_units)} testid="calc-units" />
          <Metric label="Occupants" value={int(a?.occupants)} testid="calc-occupants" />
          <Metric label="Density" value={num(a?.density_units_per_acre, 2)} unit="units/acre" testid="calc-density-acre" />
          <Metric label="Density" value={num(a?.density_persons_per_hectare, 1)} unit="p/ha" testid="calc-density-ha" />
          <Metric label="Max height" value={num(a?.max_height_m, 2)} unit="m" testid="calc-height" />
          <Metric label="Balcony area" value={num(a?.towers?.reduce((s, t) => s + t.balcony_sqm, 0), 1)} unit="m²" testid="calc-balcony" />
        </div>
        <div className="mt-3 space-y-2">
          <AreaDerivationPanel derivation={analysis?.area_derivation} testid="calc-area-panel" />
          <FarPanel derivation={analysis?.far_derivation} testid="calc-far-panel" />
        </div>
      </Section>

      <Section title="Calculation assumptions" description="Configurable per project — all outputs update live" testid="calc-config-section">
        <div className="grid sm:grid-cols-3 gap-3">
          <NumField label="Wall thickness allowance" suffix="ratio" step={0.01} value={cfg.wall_thickness_factor}
            disabled={readOnly} onChange={(v) => setCfg("wall_thickness_factor", v)} testid="config-wall-factor-input" />
          <NumField label="Common area loading (super b-up)" suffix="ratio" step={0.01} value={cfg.common_area_loading}
            disabled={readOnly} onChange={(v) => setCfg("common_area_loading", v)} testid="config-loading-input" />
          <NumField label="FSI factor vs FAR" suffix="×" step={0.05} value={cfg.fsi_factor}
            disabled={readOnly} onChange={(v) => setCfg("fsi_factor", v)} testid="config-fsi-factor-input" />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Built-up = (carpet + balcony) × (1 + wall allowance) + service core.
          Super built-up = built-up × (1 + loading). FSI = FAR × FSI factor.
        </p>
      </Section>

      {cf?.available && (
        <Section
          title="Apartment capacity prediction"
          description="How far the scheme can grow inside the compliance envelope — FAR cap, ground coverage and parking demand at each step"
          testid="capacity-prediction-section"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Units now" value={int(cf.current_units)} testid="cap-current-units" />
            <Metric label="Max units (FAR cap)" value={int(cf.max_units)}
              unit={`at ${int(cf.max_units_floors)} floors`} testid="cap-max-units" />
            <Metric label="Headroom" value={`+${int(cf.headroom_units)}`}
              unit={`+${num(cf.headroom_pct, 0)}%`} tone="success" testid="cap-headroom" />
            <Metric label="Binding at max" value={cf.binding_at_max || "—"} testid="cap-binding" />
          </div>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Floors</TableHead>
                <TableHead className="text-right">Height m</TableHead>
                <TableHead className="text-right">FAR</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Δ units</TableHead>
                <TableHead className="text-right">Built-up m²</TableHead>
                <TableHead className="text-right">Parking demand</TableHead>
                <TableHead className="text-right">Parking deficit</TableHead>
                <TableHead>What binds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cf.steps.map((s, i) => (
                <TableRow key={i} data-testid={`cap-step-${i}`}>
                  <TableCell className="py-1.5 text-right font-mono">{s.floors}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{num(s.height_m, 0)}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{num(s.far, 2)}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{int(s.units)}</TableCell>
                  <TableCell className={`py-1.5 text-right font-mono ${s.units_delta > 0 ? "text-emerald-600" : ""}`}>
                    {s.units_delta > 0 ? `+${s.units_delta}` : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{int(s.builtup_sqm)}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{int(s.parking_demand)}</TableCell>
                  <TableCell className={`py-1.5 text-right font-mono ${s.parking_deficit > 0 ? "text-red-600" : ""}`}>
                    {s.parking_deficit > 0 ? int(s.parking_deficit) : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-slate-600">{s.binding_constraint}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-slate-500 mt-2">
            Steps grow all towers together at their current floor height, up to the FAR cap of {num(cf.far_cap, 2)}.
            Parking demand uses the same ECS model as the Parking module — deficits mean bays must be added (or a
            basement planned) before that step is buildable.
          </p>
        </Section>
      )}

      <Section
        title="Explainable AI — what does this figure mean?"
        description="Pick any headline figure and the engine re-derives it: formula, your actual inputs, step-by-step arithmetic and the governing clause"
        testid="explain-ai-section"
      >
        <div className="flex flex-wrap gap-2">
          {EXPLAIN_FIGURES.map((f) => (
            <Button key={f.id} variant="outline" size="sm" className="rounded-sm h-7 text-xs"
              disabled={readOnly || (explainBusy && explainBusy !== f.id)}
              onClick={() => explain(f.id)} data-testid={`explain-figure-${f.id}`}>
              <Sparkles className={`h-3 w-3 mr-1 ${explainBusy === f.id ? "animate-pulse" : ""}`} />
              {f.label}
            </Button>
          ))}
        </div>
        {explaining ? (
          <div className="mt-3 border rounded-sm px-3 py-2" data-testid="explain-result">
            <Markdown text={explaining.text} testid="explain-text" />
            <p className="text-[11px] text-slate-400 font-mono mt-2">{explaining.model} · {explaining.generated_at && new Date(explaining.generated_at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-2">
            Explanations come from the engine's own derivation data, not the model's memory — a figure the engine did
            not expose is never invented.
          </p>
        )}
      </Section>

      <Section title="Per-tower breakdown" testid="tower-breakdown-section">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tower</TableHead>
              <TableHead className="text-right">Floors</TableHead>
              <TableHead className="text-right">Height m</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Carpet m²</TableHead>
              <TableHead className="text-right">Built-up m²</TableHead>
              <TableHead className="text-right">Super b-up m²</TableHead>
              <TableHead className="text-right">Footprint m²</TableHead>
              <TableHead className="text-right">Occupants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(a?.towers || []).map((t) => (
              <TableRow key={t.id} data-testid={`tower-breakdown-${t.id}`}>
                <TableCell className="py-2 font-medium">{t.name}</TableCell>
                <TableCell className="py-2 text-right font-mono">{t.floors}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(t.height_m, 1)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{t.total_units}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(t.carpet_sqm, 0)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(t.builtup_sqm, 0)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(t.super_builtup_sqm, 0)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(t.footprint_sqm, 0)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{t.occupants}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
