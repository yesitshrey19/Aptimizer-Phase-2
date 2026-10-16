import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, RefreshCw, TrendingDown } from "lucide-react";
import { api, apiError } from "../lib/api";
import { Section } from "./Field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { money, num } from "../lib/format";

/** Renders one optimiser's current -> best -> changes. Every optimiser shares this shape,
 *  so a result that only describes the present scheme is visibly missing its right half. */
const OPTIMIZER_PLAIN_GUIDE = {
  floors: {
    headline: "Tower Height & Floor Count Optimizer",
    plainText: "Finds the most profitable tower height that complies with municipal height limits, setback rules, and FAR caps.",
    takeaway: "Adds saleable flats until a statutory height or FAR ceiling is reached.",
  },
  far: {
    headline: "FAR Utilization Optimizer",
    plainText: "Ensures you extract maximum allowable development potential on your plot without leaving saleable area unbuilt.",
    takeaway: "Builds out full allowable FAR within code limits.",
  },
  fsi: {
    headline: "FSI Utilization Optimizer",
    plainText: "Ensures you extract maximum allowable development potential on your plot without leaving saleable area unbuilt.",
    takeaway: "Builds out full allowable FSI within code limits.",
  },
  open_space: {
    headline: "Ground Open Space & Sunlight Optimizer",
    plainText: "Maintains the same number of apartments while shrinking building ground footprints into slimmer towers.",
    takeaway: "Frees up ground land for parks, central greenery, and sunlight penetration between towers.",
  },
  mix: {
    headline: "Apartment Mix Optimizer",
    plainText: "Adjusts unit distribution (1BHK / 2BHK / 3BHK) to maximize revenue and align with market buyer demand.",
    takeaway: "Prioritizes high-yielding unit types within structural and parking capacity.",
  },
  parking: {
    headline: "Parking Cost & Sizing Optimizer",
    plainText: "Calculates the most cost-effective balance between surface bays and basement parking levels.",
    takeaway: "Minimizes expensive basement excavation while meeting mandatory NBC ECS norms.",
  },
  utilities: {
    headline: "MEP Utilities Sizing Optimizer",
    plainText: "Right-sizes sewage treatment (STP), electricity transformers, and DG generators to real project demand.",
    takeaway: "Eliminates costly over-engineering while remaining 100% code compliant.",
  },
  quantity: {
    headline: "Structural Materials Optimizer",
    plainText: "Sweeps concrete grades (M25 to M40) and steel grades (Fe500) to find the cheapest structural combination.",
    takeaway: "Higher-grade concrete yields slimmer columns and reduces total material volumes.",
  },
  budget: {
    headline: "Target Budget Optimizer",
    plainText: "Identifies the highest-impact value-engineering levers to achieve your target financial budget.",
    takeaway: "Ranks actionable savings from highest financial impact to lowest design disruption.",
  },
  waste: {
    headline: "Steel Rebar Scrap Optimizer",
    plainText: "Uses algorithmic cutting-stock optimization on standard 12-meter steel bars to eliminate offcuts.",
    takeaway: "Cuts steel rebar scrap from typical 5% down to under 1.5%.",
  },
  materials: {
    headline: "Green Material & Carbon Optimizer",
    plainText: "Evaluates blended cements (PPC/GGBS) and AAC blocks against traditional OPC and red bricks.",
    takeaway: "Reduces embodied carbon emissions and procurement costs without compromising structural safety.",
  },
};

/** Renders one optimiser's current -> best -> changes with a clear, non-technical summary. */
function Result({ o, currency }) {
  if (!o) return null;
  const money_ = (v) => money(v, currency);
  const fmt = (m) => (m.unit === "INR" ? money_(m.value) : `${num(m.value, 1)}${m.unit ? ` ${m.unit}` : ""}`);
  const improves = o.delta?.improves;
  const guide = OPTIMIZER_PLAIN_GUIDE[o.id] || null;

  return (
    <div className="border border-slate-200 rounded-sm bg-white overflow-hidden shadow-xs" data-testid={`opt-${o.id}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{guide?.headline || o.title}</h4>
          {guide?.plainText && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">{guide.plainText}</p>
          )}
        </div>
        {improves ? (
          <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-2 py-0.5 shrink-0">
            <TrendingDown className="h-3.5 w-3.5 inline mr-1" />
            {num(o.delta.pct, 1)}% better
          </span>
        ) : (
          <span className="text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded-sm px-2 py-0.5 shrink-0">
            <Check className="h-3.5 w-3.5 inline mr-1 text-slate-500" />
            already optimal
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Metric comparison cards */}
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-center bg-slate-50/50 p-2.5 rounded-sm border border-slate-100">
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Current Design</div>
            <div className="font-mono text-base font-semibold text-slate-900 mt-0.5">{fmt(o.current)}</div>
            <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{o.current.label}</div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-blue-500 hidden sm:block" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Recommended Design</div>
            <div className={`font-mono text-base font-semibold mt-0.5 ${improves ? "text-emerald-700" : "text-slate-900"}`}>
              {fmt(o.best)}
            </div>
            <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{o.best.label}</div>
          </div>
        </div>

        {/* Levers to change */}
        {o.changes?.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
              Recommended Adjustments
            </div>
            {o.changes.map((c, i) => (
              <div key={i} className="text-xs text-slate-700 bg-blue-50/30 border-l-2 border-blue-500 pl-2.5 py-1.5 rounded-r-sm">
                <div className="flex items-center flex-wrap gap-1 font-medium text-slate-800">
                  <span>{c.lever}</span>
                  {c.to !== "unchanged" && (
                    <span className="font-mono text-[11px] bg-white border border-slate-200 px-1.5 py-0.2 rounded-xs ml-1">
                      {c.from} → <strong className="text-blue-700">{c.to}</strong>
                    </span>
                  )}
                </div>
                {c.effect && <div className="text-[11px] text-slate-600 mt-1 leading-snug">{c.effect}</div>}
              </div>
            ))}
          </div>
        )}

        {guide?.takeaway && (
          <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-100 rounded-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <span className="font-semibold shrink-0">Key takeaway:</span>
            <span>{guide.takeaway}</span>
          </div>
        )}

        {!o.feasible && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1">
            Could not be reached with the levers available.
          </p>
        )}

        {o.notes?.length > 0 && (
          <div className="border-t border-slate-100 pt-2 space-y-1">
            {o.notes.map((n, i) => (
              <p key={i} className="text-[10px] text-slate-500 leading-relaxed">• {n}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Which optimisers to show. The same panel is mounted in three modules, each showing the
 * ones that belong to what that module is about, so the results sit next to the numbers
 * they would change rather than in a tab of their own.
 */
const SETS = {
  quantities: { endpoint: "optimise", keys: ["waste", "quantity"] },
  boq: { endpoint: "optimise", keys: ["quantity", "materials"] },
  cost: { endpoint: "optimise", keys: ["budget", "materials"] },
  planning: { endpoint: "optimise/planning", keys: ["floors", "far", "fsi", "open_space", "mix"] },
  parking: { endpoint: "optimise/planning", keys: ["parking"] },
  utilities: { endpoint: "optimise/planning", keys: ["utilities"] },
};

export default function OptimiserPanel({ projectId, only = "cost", readOnly, currentCost }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [target, setTarget] = useState(0);

  const set = SETS[only] || SETS.cost;

  const run = useCallback(async (t) => {
    setBusy(true);
    setErr("");
    try {
      const { data: d } = await api.post(`/projects/${projectId}/${set.endpoint}`,
        set.endpoint === "optimise" ? { target_budget: t ?? target } : {});
      setData(d);
    } catch (e) {
      setData(null);
      setErr(apiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  }, [projectId, target, set.endpoint]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(0); }, [projectId, only]);

  const wanted = set.keys;
  const showBudget = wanted.includes("budget");

  return (
    <Section
      title="Optimisers"
      description="What the scheme does now, the best found, and the change needed. Nothing is applied automatically."
      testid={`optimisers-${only}`}
      actions={
        <Button onClick={() => run()} disabled={busy || readOnly} className="rounded-sm h-8"
          data-testid="optimise-run">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Searching…" : "Re-run"}
        </Button>
      }
    >
      {err && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5 mb-3"
          data-testid="optimise-error">{err}</p>
      )}

      {showBudget && (
        <div className="flex flex-wrap items-end gap-3 mb-3 pb-3 border-b border-slate-200">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">
              Target budget (₹)
            </label>
            <Input type="number" className="h-9 rounded-sm font-mono text-sm w-48"
              value={target || ""} disabled={readOnly} data-testid="optimise-target"
              placeholder={currentCost ? Math.round(currentCost * 0.9) : "leave blank for −10%"}
              onChange={(e) => setTarget(Number(e.target.value) || 0)} />
          </div>
          <Button variant="outline" className="rounded-sm h-9" disabled={busy || readOnly}
            onClick={() => run()} data-testid="optimise-target-run">
            Search for it
          </Button>
          <p className="text-[10px] text-slate-500 max-w-sm leading-snug">
            Blank searches for 10% under today's cost. Only code-compliant changes are proposed.
          </p>
        </div>
      )}

      {!data ? (
        <p className="text-sm text-slate-500">{busy ? "Searching…" : "No results yet."}</p>
      ) : (
        <div className="space-y-3">
          {wanted.map((k) => <Result key={k} o={data[k]} currency={data.currency} />)}
        </div>
      )}
    </Section>
  );
}

export { Result as OptimiserResult };
