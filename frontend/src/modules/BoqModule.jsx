import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { downloadFile } from "../lib/api";
import { Metric, Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { money, num } from "../lib/format";
import QuantitiesModule from "./QuantitiesModule";

// Materials carry a site-wastage allowance (engine.DEFAULT_WASTAGE_PCT): amount =
// quantity x (1 + wastage) x rate. It is shown as its own column, or a reader multiplying
// quantity by rate finds a dozen lines that do not add up.
const RateTable = ({ rows, testidPrefix, onRate, readOnly, qtyLabel, total, cur }) => {
  const showWastage = rows.some((r) => r.wastage_pct != null);
  return (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Item</TableHead>
        <TableHead>Unit</TableHead>
        <TableHead className="text-right">{qtyLabel}</TableHead>
        {showWastage && <TableHead className="text-right">Wastage</TableHead>}
        <TableHead className="text-right w-36">Rate ({cur})</TableHead>
        <TableHead className="text-right">Amount</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.key} data-testid={`${testidPrefix}-row-${r.key}`}>
          <TableCell className="py-1.5 font-medium">{r.label}</TableCell>
          <TableCell className="py-1.5 font-mono text-xs">{r.unit}</TableCell>
          <TableCell className="py-1.5 text-right font-mono">{num(r.quantity, 2)}</TableCell>
          {showWastage && (
            <TableCell className="py-1.5 text-right font-mono" data-testid={`${testidPrefix}-wastage-${r.key}`}>
              {num(r.wastage_pct ?? 0, 0)}%
            </TableCell>
          )}
          <TableCell className="py-1.5">
            <Input
              type="number"
              disabled={readOnly}
              className="h-8 font-mono text-xs text-right rounded-sm"
              data-testid={`${testidPrefix}-rate-${r.key}`}
              value={r.rate}
              onChange={(e) => onRate(r.key, Number(e.target.value))}
            />
          </TableCell>
          <TableCell className="py-1.5 text-right font-mono" data-testid={`${testidPrefix}-amount-${r.key}`}>
            {num(r.amount, 0)}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="bg-slate-50">
        <TableCell className="py-2 font-semibold" colSpan={showWastage ? 5 : 4}>
          Sub-total
        </TableCell>
        <TableCell className="py-2 text-right font-mono font-semibold" data-testid={`${testidPrefix}-total`}>
          {num(total, 0)}
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
  );
};

export default function BoqModule({ project, analysis, update, readOnly, projectId }) {
  const b = analysis?.boq;
  if (!b) return <p className="text-sm text-slate-500">Calculating BOQ…</p>;
  const cur = b.currency;

  const setRate = (bucket) => (key, v) => update((p) => { p[bucket] = { ...(p[bucket] || {}), [key]: v }; });
  // Services lines are priced from project["services_rates"], keyed by rate name.
  const SERVICE_RATE_KEY = {
    lifts: "lift_each", electrical_services: "electrical_per_sqm", plumbing_services: "plumbing_per_sqm",
    fire_fighting: "fire_per_sqm", basement: "basement_per_sqm", external_works: "external_per_sqm",
    amenities: "amenity_per_sqm",
  };
  const setServiceRate = (key, v) => setRate("services_rates")(SERVICE_RATE_KEY[key] || key, v);

  const dl = async (path, name) => {
    try {
      await downloadFile(path, name);
      toast.success(`${name} downloaded`);
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <div className="space-y-4">
      {/* Quantities is the unpriced half of this same bill, so it lives here rather than
          as a separate destination in the sidebar. */}
      <QuantitiesModule project={project} analysis={analysis} update={update} readOnly={readOnly} projectId={projectId} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Material" value={money(b.material_total, cur)} testid="boq-material-total" />
        <Metric label="Labour" value={money(b.labour_total, cur)} testid="boq-labour-total" />
        <Metric label="Equipment" value={money(b.equipment_total, cur)} testid="boq-equipment-total" />
        <Metric label="Services & external" value={money(b.services_total || 0, cur)} testid="boq-services-total" />
        <Metric label="BOQ grand total" value={money(b.grand_total, cur)} testid="boq-grand-total" />
      </div>

      <div className="flex gap-2">
        <Button className="rounded-sm" data-testid="boq-export-pdf"
          onClick={() => dl(`/projects/${projectId}/reports/boq`, "BOQ_Report.pdf")}>
          <Download className="h-4 w-4 mr-1.5" /> Export BOQ PDF
        </Button>
        <Button variant="outline" className="rounded-sm" data-testid="boq-export-excel"
          onClick={() => dl(`/projects/${projectId}/boq.xlsx`, "BOQ.xlsx")}>
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export BOQ Excel
        </Button>
      </div>

      <Section title="Material summary" testid="boq-materials-section">
        <RateTable rows={b.materials} testidPrefix="boq-material" onRate={setRate("rates")} readOnly={readOnly}
          qtyLabel="Quantity" total={b.material_total} cur={cur} />
      </Section>

      <Section title="Labour summary" description="Man-days derived from material quantities and trade productivity" testid="boq-labour-section">
        <RateTable rows={b.labour} testidPrefix="boq-labour" onRate={setRate("labour_rates")} readOnly={readOnly}
          qtyLabel="Man-days" total={b.labour_total} cur={cur} />
      </Section>

      <Section title="Equipment summary" testid="boq-equipment-section">
        <RateTable rows={b.equipment} testidPrefix="boq-equipment" onRate={setRate("equipment_rates")} readOnly={readOnly}
          qtyLabel="Days" total={b.equipment_total} cur={cur} />
      </Section>

      {(b.services || []).length > 0 && (
        <Section title="Services & external works"
          description="Allowances (editable rates): lifts, building services, basements, external development and built amenities. Replace with CPWD plinth-area percentages or quotations."
          testid="boq-services-section">
          <RateTable rows={b.services} testidPrefix="boq-services" onRate={setServiceRate} readOnly={readOnly}
            qtyLabel="Quantity" total={b.services_total} cur={cur} />
        </Section>
      )}
    </div>
  );
}
