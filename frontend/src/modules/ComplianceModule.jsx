import { Check, X, Plus, Trash2 } from "lucide-react";
import { Metric, Section } from "../components/Field";
import { AiPanel } from "../components/AiPanel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { num } from "../lib/format";

const PARAMS = [
  "far", "fsi", "ground_coverage_pct", "open_space_pct", "min_stair_width", "min_corridor_width",
  "lift_shortfall", "min_exits_per_floor", "max_travel_distance_m", "ramp_slope_pct",
  "accessible_parking_pct", "parking_deficit",
];

export default function ComplianceModule({ project, analysis, update, readOnly, projectId, setProject }) {
  const c = analysis?.compliance;
  const rules = project.compliance_rules || [];
  const resultOf = (id) => (c?.results || []).find((r) => r.id === id);
  const setRule = (i, patch) => update((p) => { p.compliance_rules[i] = { ...p.compliance_rules[i], ...patch }; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Rules evaluated" value={c?.total ?? "—"} testid="compliance-total" />
        <Metric label="Passed" value={c?.passed ?? "—"} tone="success" testid="compliance-passed" />
        <Metric label="Failed" value={c?.failed ?? "—"} tone={c?.failed ? "danger" : "success"} testid="compliance-failed" />
        <Metric label="Compliance score" value={`${c?.score ?? 0}%`} tone={c?.overall === "pass" ? "success" : "danger"} testid="compliance-score" />
      </div>

      {c?.failed > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-sm p-4" data-testid="compliance-violations">
          <h3 className="text-sm font-semibold text-red-800">Violations ({c.failed})</h3>
          <ul className="mt-2 space-y-1">
            {c.results.filter((r) => r.status === "fail").map((r) => (
              <li key={r.id} className="text-sm text-red-800 flex gap-2" data-testid={`violation-${r.id}`}>
                <X className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <span className="font-mono text-xs mr-1">[{r.code}]</span>
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section
        title="Rule set"
        description="Editable thresholds — configure per city/state bye-laws. Toggle rules off if not applicable."
        testid="compliance-rules-section"
        actions={
          !readOnly && (
            <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs" data-testid="add-rule-button"
              onClick={() => update((p) => {
                p.compliance_rules = [...(p.compliance_rules || []), {
                  id: `custom_${Math.random().toString(36).slice(2, 7)}`, code: "CUSTOM",
                  label: "New rule", param: "far", operator: "max", threshold: 1, unit: "", enabled: true,
                }];
              })}>
              <Plus className="h-3 w-3 mr-1" /> Add rule
            </Button>
          )
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead className="w-44">Parameter</TableHead>
              <TableHead className="w-24">Operator</TableHead>
              <TableHead className="w-28 text-right">Threshold</TableHead>
              <TableHead className="w-24 text-right">Actual</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-20">On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r, i) => {
              const res = resultOf(r.id);
              return (
                <TableRow key={r.id} data-testid={`rule-row-${r.id}`}>
                  <TableCell className="py-1.5 font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="py-1.5">
                    <Input disabled={readOnly} className="h-8 text-xs rounded-sm" data-testid={`rule-label-${r.id}`}
                      value={r.label} onChange={(e) => setRule(i, { label: e.target.value })} />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Select value={r.param} disabled={readOnly} onValueChange={(v) => setRule(i, { param: v })}>
                      <SelectTrigger className="h-8 text-xs rounded-sm" data-testid={`rule-param-${r.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{PARAMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Select value={r.operator} disabled={readOnly} onValueChange={(v) => setRule(i, { operator: v })}>
                      <SelectTrigger className="h-8 text-xs rounded-sm" data-testid={`rule-operator-${r.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="max">max</SelectItem>
                        <SelectItem value="min">min</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input type="number" step="0.1" disabled={readOnly} className="h-8 text-xs text-right font-mono rounded-sm"
                      data-testid={`rule-threshold-${r.id}`} value={r.threshold}
                      onChange={(e) => setRule(i, { threshold: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-xs" data-testid={`rule-actual-${r.id}`}>
                    {res ? num(res.actual, 2) : "—"}
                  </TableCell>
                  <TableCell className="py-1.5">
                    {res ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase px-1.5 py-0.5 rounded-sm ${
                        res.status === "pass" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`} data-testid={`rule-status-${r.id}`}>
                        {res.status === "pass" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {res.status}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">off</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-1">
                      <Switch checked={r.enabled !== false} disabled={readOnly} data-testid={`rule-enabled-${r.id}`}
                        onCheckedChange={(v) => setRule(i, { enabled: v })} />
                      {!readOnly && (
                        <Button size="sm" variant="ghost" className="h-7 px-1 text-red-600" data-testid={`rule-delete-${r.id}`}
                          onClick={() => update((p) => { p.compliance_rules.splice(i, 1); })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <AiPanel
        title="AI compliance review"
        description="Explains each failing rule, why it exists and the design change that would close the gap"
        endpoint={`/projects/${projectId}/ai/compliance`}
        initial={project.ai?.compliance}
        onGenerated={(d) => setProject?.((p) => ({ ...p, ai: { ...(p.ai || {}), compliance: d } }))}
        readOnly={readOnly}
        testid="ai-compliance"
        emptyHint="Turn the pass/fail table above into a plain-language review with specific fixes for each violation."
      />
    </div>
  );
}
