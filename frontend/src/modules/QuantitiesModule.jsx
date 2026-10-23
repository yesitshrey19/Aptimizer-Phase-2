import { Metric, Section } from "../components/Field";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { int, num } from "../lib/format";
import OptimiserPanel from "../components/OptimiserPanel";

export default function QuantitiesModule({ project, analysis, update, readOnly, projectId }) {
  const q = analysis?.quantities;
  const setRatio = (key, v) => update((p) => { p.quantity_ratios = { ...(p.quantity_ratios || {}), [key]: v }; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metric label="Basis: built-up area" value={num(q?.basis_area_sqm, 0)} unit="m²" testid="qty-basis-area" />
        <Metric label="Basis: total units" value={int(q?.basis_units)} testid="qty-basis-units" />
        <Metric label="Line items" value={int(q?.items?.length)} testid="qty-item-count" />
      </div>

      <Section
        title="Estimated quantities"
        description="Thumb-rule ratios are editable per project; quantities recompute instantly."
        testid="quantities-section"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right w-40">Ratio</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q?.items || []).map((i) => (
              <TableRow key={i.key} data-testid={`qty-row-${i.key}`}>
                <TableCell className="py-1.5 font-medium">{i.label}</TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{i.unit}</TableCell>
                <TableCell className="py-1.5 text-xs text-slate-500">
                  {i.basis === "area" ? "per m² built-up" : "per unit"}
                </TableCell>
                <TableCell className="py-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    disabled={readOnly}
                    className="h-8 font-mono text-xs text-right rounded-sm"
                    data-testid={`qty-ratio-${i.key}`}
                    value={i.ratio}
                    onChange={(e) => setRatio(i.ratio_key, Number(e.target.value))}
                  />
                </TableCell>
                <TableCell className="py-1.5 text-right font-mono" data-testid={`qty-value-${i.key}`}>
                  {num(i.quantity, 2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
      <OptimiserPanel projectId={projectId} only="quantities" readOnly={readOnly} />

    </div>
  );
}
