import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { num } from "../lib/format";

/**
 * How the displayed FAR was arrived at, step by step.
 *
 * Written against what `engine.far_derivation()` actually reports, which is the whole
 * point: a panel showing a plausible-looking derivation that does not reconcile to the
 * number above it is worse than no panel, because the reader now trusts it.
 *
 * Two things here regularly surprise people, and both are stated rather than smoothed over:
 * this engine applies no FSI deductions at all, and FAR and FSI are the same number unless
 * the project's `fsi_factor` has been changed from 1.
 */
export default function FarPanel({ derivation, testid = "far-panel" }) {
  const [open, setOpen] = useState(false);
  const d = derivation;
  if (!d) return null;
  const Chevron = open ? ChevronDown : ChevronRight;
  const p = d.permissible || {};

  return (
    <div className="border border-slate-200 rounded-sm bg-white" data-testid={testid}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
        data-testid={`${testid}-toggle`}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
          <Chevron className="h-3.5 w-3.5 text-slate-400" />
          How this FAR was calculated
        </span>
        <span className="font-mono text-xs text-slate-500">{d.substitution}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-3 space-y-4">
          {/* 1. Formula */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Formula</div>
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded-sm inline-block">
              {d.formula}
            </code>
          </div>

          {/* 2. Inputs */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Inputs</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Input</TableHead>
                  <TableHead className="text-right">Value (m²)</TableHead>
                  <TableHead>Where it comes from</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.inputs.map((i) => (
                  <TableRow key={i.label}>
                    <TableCell className="py-1 text-xs">{i.label}</TableCell>
                    <TableCell className="py-1 text-xs text-right font-mono">{num(i.value, 2)}</TableCell>
                    <TableCell className="py-1 text-[11px] text-slate-500">{i.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">{d.builtup_rule}</p>
          </div>

          {/* 3. Per-tower contribution */}
          {d.towers?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Built-up by tower
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tower</TableHead>
                    <TableHead className="text-right">Floors</TableHead>
                    <TableHead className="text-right">Per floor (m²)</TableHead>
                    <TableHead className="text-right">Built-up (m²)</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.towers.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="py-1 text-xs">{t.name}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-mono">{t.floors}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-mono">{num(t.builtup_per_floor_sqm, 1)}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-mono">{num(t.builtup_sqm, 1)}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-mono text-slate-500">{t.share_pct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* 4. What is NOT counted -- deliberately not called "deductions" */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Not counted in FAR
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead className="text-right">Value (m²)</TableHead>
                  <TableHead>Why it is outside the ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.excluded.map((e) => (
                  <TableRow key={e.item}>
                    <TableCell className="py-1 text-xs">{e.item}</TableCell>
                    <TableCell className="py-1 text-xs text-right font-mono">{num(e.area_sqm, 1)}</TableCell>
                    <TableCell className="py-1 text-[11px] text-slate-500">{e.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1 mt-2 leading-snug"
              data-testid={`${testid}-no-deductions`}>
              {d.no_deductions_note}
            </p>
          </div>

          {/* 5. Substitution */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Arithmetic</div>
            <code className="font-mono text-xs bg-slate-900 text-slate-100 px-2 py-1.5 rounded-sm inline-block">
              {d.substitution}
            </code>
          </div>

          {/* 6. Permissible vs achieved */}
          {p.far_cap > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Against the limit
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">Achieved</div>
                  <div className="font-mono text-slate-900">{d.far}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Permissible</div>
                  <div className="font-mono text-slate-900">{p.far_cap}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Headroom</div>
                  <div className="font-mono text-emerald-700">
                    {p.headroom_ratio} ({num(p.headroom_sqm, 0)} m²)
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Used</div>
                  <div className="font-mono text-slate-900">{p.used_pct}%</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Governing control: {p.governing_control}. Headroom in m² is the extra floor
                area the cap still allows on this plot — whether another rule lets you build
                it is a separate question.
              </p>
            </div>
          )}

          {/* 7. FAR vs FSI, stated plainly */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              FAR and FSI
            </div>
            <p className={`text-[11px] leading-snug rounded-sm px-2 py-1.5 ${
              d.identical
                ? "text-slate-700 bg-slate-50 border border-slate-200"
                : "text-blue-900 bg-blue-50 border border-blue-200"}`}
              data-testid={`${testid}-far-vs-fsi`}>
              {d.far_vs_fsi}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
