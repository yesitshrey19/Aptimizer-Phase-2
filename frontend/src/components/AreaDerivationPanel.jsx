import { useState } from "react";
import { ChevronDown, ChevronRight, Calculator, Info, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { num } from "../lib/format";

/**
 * Step-by-step mathematical breakdown of Carpet, Built-up, and Super Built-up areas.
 *
 * Explains:
 * 1. Why Built-up = (Carpet + Balcony) * (1 + wall_factor) + Service Core
 * 2. The exact empirical formulas for Service Core (stairs width² × 2.6, lifts 4.5 m²)
 * 3. Tower Super Built-up = Tower Built-up * (1 + loading)
 * 4. Total Super Built-up = Sum(Towers) + Society Amenities (Clubhouse, Pool, etc.)
 * 5. Why the Implied Multiplier differs from the base loading factor (amenities add-on).
 */
export default function AreaDerivationPanel({ derivation, testid = "area-derivation-panel" }) {
  const [open, setOpen] = useState(false);
  const d = derivation;
  if (!d) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  const s = d.summary || {};

  return (
    <div className="border border-slate-200 rounded-sm bg-white" data-testid={testid}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
        data-testid={`${testid}-toggle`}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
          <Chevron className="h-3.5 w-3.5 text-slate-400" />
          <Calculator className="h-3.5 w-3.5 text-blue-600" />
          How Built-up & Super Built-up are calculated (Manual Verification Guide)
        </span>
        <span className="font-mono text-xs text-slate-500">
          Built-up {num(s.builtup_area_sqm, 1)} m² → Super {num(s.super_builtup_area_sqm, 1)} m² ({s.implied_multiplier}×)
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-5">
          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-sm border border-slate-100">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Wall Allowance</div>
              <div className="font-mono text-sm font-semibold text-slate-800">+{s.wall_allowance_pct}%</div>
              <div className="text-[10px] text-slate-400">added to carpet + balcony</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Base Loading Factor</div>
              <div className="font-mono text-sm font-semibold text-slate-800">+{s.common_area_loading_pct}%</div>
              <div className="text-[10px] text-slate-400">common corridors & lobbies</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Society Amenities</div>
              <div className="font-mono text-sm font-semibold text-slate-800">+{num(s.society_amenities_sqm, 0)} m²</div>
              <div className="text-[10px] text-slate-400">clubhouse, pool, gym</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-700">Effective (Implied) Multiplier</div>
              <div className="font-mono text-sm font-bold text-blue-700">{s.implied_multiplier}× ({s.implied_loading_pct}%)</div>
              <div className="text-[10px] text-slate-400">Super Built-up ÷ Built-up</div>
            </div>
          </div>

          {/* 8-Step Mathematical Progression */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-slate-500" />
              Step-by-Step Manual Arithmetic Progression
            </div>
            <div className="space-y-2">
              {(d.step_by_step_formulas || []).map((step) => (
                <div key={step.step} className="border border-slate-200 rounded-sm p-2.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                        Step {step.step}
                      </span>
                      <span className="text-xs font-semibold text-slate-900">{step.title}</span>
                    </div>
                    <code className="text-[11px] font-mono text-blue-800 bg-blue-50 px-1 py-0.5 rounded-sm mt-1 inline-block">
                      {step.formula}
                    </code>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{step.explanation}</p>
                  </div>
                  <div className="text-right sm:self-center shrink-0">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-sm">
                      {step.result}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Tower Breakdown with Exact Service Core Numbers */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-700 mb-2">
              Per-Tower Exact Service Core & Area Breakdown
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tower</TableHead>
                    <TableHead className="text-right">Floors</TableHead>
                    <TableHead className="text-right">Carpet / fl (m²)</TableHead>
                    <TableHead className="text-right">Balcony / fl (m²)</TableHead>
                    <TableHead className="text-right">Walls / fl (+10%)</TableHead>
                    <TableHead className="text-right">Service Core / fl (m²)</TableHead>
                    <TableHead className="text-right">Built-up / fl (m²)</TableHead>
                    <TableHead className="text-right">Total Built-up (m²)</TableHead>
                    <TableHead className="text-right">Super Built-up (m²)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d.towers || []).map((t) => (
                    <TableRow key={t.id} data-testid={`area-tower-row-${t.id}`}>
                      <TableCell className="py-2 text-xs font-medium">{t.name}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono">{t.floors}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono">{num(t.carpet_per_floor_sqm, 1)}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono">{num(t.balcony_per_floor_sqm, 1)}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono text-slate-600">+{num(t.wall_allowance_floor_sqm, 1)}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono text-blue-700 font-semibold" title={`Corridor: ${t.service_core?.corridor_sqm} m², Stairs: ${t.service_core?.stair_sqm} m², Lifts: ${t.service_core?.lift_sqm} m²`}>
                        +{num(t.service_core?.total_floor_sqm, 1)}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono font-medium">{num(t.builtup_per_floor_sqm, 1)}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono font-semibold">{num(t.builtup_sqm, 1)}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-mono font-bold text-slate-900">{num(t.super_builtup_sqm, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              * Service Core formula: Corridor (W × L) + Staircases [Count × Width² × 2.6] + Lifts [Count × 4.5 m²]. Hover over Service Core / fl for itemized values.
            </p>
          </div>

          {/* Manual Pocket Calculator Check Guide */}
          <div className="border border-emerald-200 bg-emerald-50/60 rounded-sm p-3 text-xs text-emerald-950 space-y-2">
            <div className="font-semibold flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              How to Reconcile on a Pocket Calculator:
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-emerald-900 leading-relaxed">
              <li>
                <strong>Built-up Area</strong>: Take (Carpet + Balcony), multiply by <strong>1.10</strong> (for 10% walls), then add <strong>Service Core</strong>. Multiply by the number of floors.
              </li>
              <li>
                <strong>Tower Super Built-up</strong>: Multiply Tower Built-up by <strong>1.25</strong> (for 25% common area loading).
              </li>
              <li>
                <strong>Total Super Built-up</strong>: Add all Tower Super Built-ups together, plus any <strong>Society Amenities</strong> (e.g. +{s.society_amenities_sqm} m² for Clubhouse & Pool).
              </li>
              <li>
                <strong>Why the Implied Multiplier is {s.implied_multiplier}× instead of 1.25×</strong>:
                Because the {num(s.society_amenities_sqm, 0)} m² clubhouse is added on top of the towers. Dividing total saleable area ({num(s.super_builtup_area_sqm, 1)} m²) by total built-up ({num(s.builtup_area_sqm, 1)} m²) equals exactly <strong>{s.implied_multiplier}</strong>!
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
