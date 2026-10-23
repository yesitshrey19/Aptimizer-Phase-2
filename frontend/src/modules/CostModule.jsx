import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Metric, Section } from "../components/Field";
import { AiPanel } from "../components/AiPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { money, num } from "../lib/format";
import OptimiserPanel from "../components/OptimiserPanel";

const COLORS = ["#2563EB", "#0F172A", "#F59E0B"];

export default function CostModule({ analysis, project, projectId, readOnly, setProject }) {
  const c = analysis?.cost;
  const a = analysis?.areas;
  if (!c) return <p className="text-sm text-slate-500">Calculating cost…</p>;
  const cur = c.currency;
  const perSqmData = [
    { name: "Material", value: a.builtup_area_sqm ? c.material / a.builtup_area_sqm : 0 },
    { name: "Labour", value: a.builtup_area_sqm ? c.labour / a.builtup_area_sqm : 0 },
    { name: "Equipment", value: a.builtup_area_sqm ? c.equipment / a.builtup_area_sqm : 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Material cost" value={money(c.material, cur)} testid="cost-material" />
        <Metric label="Labour cost" value={money(c.labour, cur)} testid="cost-labour" />
        <Metric label="Equipment cost" value={money(c.equipment, cur)} testid="cost-equipment" />
        <Metric label="Total construction cost" value={money(c.total, cur)} testid="cost-total" />
        <Metric label="Cost per flat" value={money(c.per_unit, cur)} testid="cost-per-unit" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Cost breakdown" testid="cost-pie-section">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={c.breakdown} dataKey="value" nameKey="name" outerRadius={100} innerRadius={55} paddingAngle={2}>
                {c.breakdown.map((e, i) => (
                  <Cell key={e.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(v, cur)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title={`Cost per m² built-up (${cur})`} testid="cost-bar-section">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={perSqmData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Tooltip formatter={(v) => num(v, 0)} />
              <Bar dataKey="value" fill="#2563EB" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Budget summary" testid="cost-summary-section">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Head</TableHead>
              <TableHead className="text-right">Amount ({cur})</TableHead>
              <TableHead className="text-right">% of total</TableHead>
              <TableHead className="text-right">Per m²</TableHead>
              <TableHead className="text-right">Per flat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.breakdown.map((b) => (
              <TableRow key={b.name} data-testid={`cost-row-${b.name.toLowerCase()}`}>
                <TableCell className="py-2 font-medium">{b.name}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(b.value, 0)}</TableCell>
                <TableCell className="py-2 text-right font-mono">{num(c.total ? (b.value / c.total) * 100 : 0, 1)}%</TableCell>
                <TableCell className="py-2 text-right font-mono">
                  {num(a.builtup_area_sqm ? b.value / a.builtup_area_sqm : 0, 0)}
                </TableCell>
                <TableCell className="py-2 text-right font-mono">
                  {num(a.total_units ? b.value / a.total_units : 0, 0)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-slate-50">
              <TableCell className="py-2 font-semibold">Total</TableCell>
              <TableCell className="py-2 text-right font-mono font-semibold" data-testid="cost-summary-total">{num(c.total, 0)}</TableCell>
              <TableCell className="py-2 text-right font-mono">100%</TableCell>
              <TableCell className="py-2 text-right font-mono" data-testid="cost-per-sqm">{num(c.per_sqm, 0)}</TableCell>
              <TableCell className="py-2 text-right font-mono">{num(c.per_unit, 0)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <OptimiserPanel projectId={projectId} only="cost" readOnly={readOnly}
        currentCost={c.total} />

      <AiPanel
        title="AI cost review"
        description="Flags unit rates that look out of range and identifies the main cost drivers and savings"
        endpoint={`/projects/${projectId}/ai/cost`}
        initial={project?.ai?.cost}
        onGenerated={(d) => setProject?.((p) => ({ ...p, ai: { ...(p.ai || {}), cost: d } }))}
        readOnly={readOnly}
        testid="ai-cost"
        emptyHint="Review the estimate against typical Indian residential construction rates and surface savings opportunities."
      />
    </div>
  );
}
