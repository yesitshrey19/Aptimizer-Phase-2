import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { api, apiError } from "../lib/api";
import { Metric, NumField, Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AiPanel } from "../components/AiPanel";
import { int, money, num } from "../lib/format";

const UNIT_LABEL = (t) => t.replace(/bhk/i, " BHK").replace(/^./, (c) => c.toUpperCase()).trim();

/** Reads the break-even against the asking rate -- the single number that says how much
 *  room the project has before it stops making money. */
function BreakEven({ fin }) {
  const be = fin?.break_even;
  const cur = fin?.currency || "INR";
  if (!be || be.sale_rate_per_sqft == null) return null;
  const asking = fin.config.sale_rate_per_sqft;
  const headroom = asking > 0 ? ((asking - be.sale_rate_per_sqft) / asking) * 100 : 0;
  const thin = headroom < 15;
  const impossible = be.pct_of_stock > 100;

  return (
    <div
      className={`text-[11px] rounded-sm border px-3 py-2 flex gap-2 ${
        impossible || thin
          ? "text-red-800 bg-red-50 border-red-200"
          : "text-emerald-900 bg-emerald-50 border-emerald-200"
      }`}
      data-testid="finance-breakeven"
    >
      {impossible || thin ? (
        <TrendingDown className="h-4 w-4 shrink-0 mt-px text-red-500" />
      ) : (
        <TrendingUp className="h-4 w-4 shrink-0 mt-px text-emerald-600" />
      )}
      <div className="space-y-0.5">
        {impossible ? (
          <p>
            <span className="font-semibold">This scheme cannot break even.</span> Covering
            its {money(fin.cost.total, cur)} cost would need{" "}
            {num(be.pct_of_stock, 0)}% of the stock — more than exists. The asking rate has
            to rise or the cost has to fall.
          </p>
        ) : (
          <p>
            Breaks even after selling{" "}
            <span className="font-semibold">{num(be.units, 0)} of {be.units_available} flats</span>{" "}
            ({num(be.pct_of_stock, 0)}% of the project). Everything sold after that is profit.
          </p>
        )}
        <p>
          The lowest rate that still covers every cost is{" "}
          <span className="font-semibold">{money(be.sale_rate_per_sqft, cur)}/sqft</span>, against
          your {money(asking, cur)}/sqft asking price —{" "}
          {headroom >= 0
            ? `${num(headroom, 0)}% of room before the project stops making money.`
            : `${num(-headroom, 0)}% below what you would need to charge.`}
        </p>
      </div>
    </div>
  );
}

export default function FinanceModule({ project, projectId, readOnly, setProject }) {
  const [fin, setFin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cfg, setCfg] = useState({
    sale_rate_per_sqft: 6500,
    other_income: 0,
    land_cost: 0,
    approval_cost: 0,
    marketing_pct: 3,
    contingency_pct: 0,   // construction contingency is already in the BOQ grand total
    debt_ratio: 60,
    interest_rate_pct: 11,
    discount_rate_pct: 12,
    construction_months: 30,
    sales_start_month: 6,
    sales_months: 30,
    presale_pct: 10,
    ...(project?.finance || {}),
  });

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const run = useCallback(async (next) => {
    setBusy(true);
    setErr("");
    try {
      const { data } = await api.post(`/projects/${projectId}/finance`,
        { config: next || cfg, save: !readOnly });
      if (isMounted.current) setFin(data);
    } catch (e) {
      if (isMounted.current) {
        setFin(null);
        setErr(apiError(e.response?.data?.detail));
      }
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }, [projectId, cfg, readOnly]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [projectId]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const cur = fin?.currency || "INR";
  const loss = Boolean(fin && fin.profit && fin.profit.net < 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Metric label="Gross revenue" value={fin?.revenue?.gross != null ? money(fin.revenue.gross, cur) : "—"}
          testid="finance-revenue" />
        <Metric label="Total project cost" value={fin?.cost?.total != null ? money(fin.cost.total, cur) : "—"}
          testid="finance-cost" />
        <Metric label="Net profit" value={fin?.profit?.net != null ? money(fin.profit.net, cur) : "—"}
          tone={loss ? "danger" : "success"} testid="finance-profit" />
        <Metric label="Margin" value={fin?.profit?.margin_pct != null ? num(fin.profit.margin_pct, 1) : "—"} unit="%"
          tone={loss ? "danger" : undefined} testid="finance-margin" />
        <Metric label="Return on cost" value={fin?.profit?.roi_pct != null ? num(fin.profit.roi_pct, 1) : "—"} unit="%"
          testid="finance-roi" />
        <Metric label="Annual IRR"
          value={fin?.profit?.irr_pct == null ? "—" : num(fin.profit.irr_pct, 1)} unit="%"
          testid="finance-irr" />
      </div>

      <p className="text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">Margin</span> is profit as a share of
        sales; <span className="font-semibold text-slate-700">return on cost</span> is profit
        against the money spent.{" "}
        <span className="font-semibold text-slate-700">IRR</span> is the yearly return on
        money while it is tied up, so timing matters as well as profit.
      </p>

      {err && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5"
          data-testid="finance-error">{err}</p>
      )}

      {fin && <BreakEven fin={fin} />}

      <Section
        title="Assumptions"
        description="Sale price, land and finance costs, and when the cash moves."
        testid="finance-config"
        actions={
          <Button onClick={() => run()} disabled={busy || readOnly} className="rounded-sm h-8"
            data-testid="finance-run">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Working…" : "Recalculate"}
          </Button>
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <NumField label="Sale rate (₹/sqft)" value={cfg.sale_rate_per_sqft} disabled={readOnly}
            onChange={(v) => set("sale_rate_per_sqft", v)} testid="finance-rate"
            hint="Price per sqft of saleable area. Amenities are not priced." />
          <NumField label="Land cost (₹)" value={cfg.land_cost} disabled={readOnly}
            onChange={(v) => set("land_cost", v)} testid="finance-land"
            hint="Paid up front, before any construction spend." />
          <NumField label="Approvals (₹)" value={cfg.approval_cost} disabled={readOnly}
            onChange={(v) => set("approval_cost", v)} testid="finance-approvals"
            hint="Sanction fees, betterment charges and consultants." />
          <NumField label="Other income (₹)" value={cfg.other_income} disabled={readOnly}
            onChange={(v) => set("other_income", v)} testid="finance-other-income"
            hint="Covered parking, club membership, transfer fees." />
          <NumField label="Marketing (% of sales)" value={cfg.marketing_pct} disabled={readOnly}
            onChange={(v) => set("marketing_pct", v)} testid="finance-marketing"
            hint="Brokerage and advertising." />
          <NumField label="Extra contingency (% of build, BOQ already has one)" value={cfg.contingency_pct} disabled={readOnly}
            onChange={(v) => set("contingency_pct", v)} testid="finance-contingency"
            hint="Reserve for unforeseen cost." />
          <NumField label="Borrowed share (%)" value={cfg.debt_ratio} disabled={readOnly}
            onChange={(v) => set("debt_ratio", v)} testid="finance-debt"
            hint="Share funded by a loan." />
          <NumField label="Interest rate (%/yr)" value={cfg.interest_rate_pct} disabled={readOnly}
            onChange={(v) => set("interest_rate_pct", v)} testid="finance-interest"
            hint="Charged on the average drawn balance over the build." />
          <NumField label="Build time (months)" value={cfg.construction_months} disabled={readOnly}
            onChange={(v) => set("construction_months", v)} testid="finance-months"
            hint="Spend follows a slow-fast-slow curve." />
          <NumField label="Launch (month)" value={cfg.sales_start_month} disabled={readOnly}
            onChange={(v) => set("sales_start_month", v)} testid="finance-launch"
            hint="When flats first go on sale." />
          <NumField label="Selling period (months)" value={cfg.sales_months} disabled={readOnly}
            onChange={(v) => set("sales_months", v)} testid="finance-sales-months"
            hint="How long the stock takes to clear from launch." />
          <NumField label="Sold at launch (%)" value={cfg.presale_pct} disabled={readOnly}
            onChange={(v) => set("presale_pct", v)} testid="finance-presale"
            hint="Pre-launch bookings, taken on day one." />
        </div>
      </Section>

      {fin && (
        <Section title="Money in and out, month by month"
          description="Cash in hand each month. The low point is what the project must be funded to."
          testid="finance-cashflow">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={fin.cash_flow} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }}
                label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000000).toFixed(0)}Cr`} />
              <Tooltip formatter={(v) => money(v, cur)} labelFormatter={(m) => `Month ${m}`} />
              <ReferenceLine y={0} stroke="#94A3B8" />
              <Area type="monotone" dataKey="cumulative" stroke="#2563EB" fill="#2563EB"
                fillOpacity={0.15} name="Cash in hand" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <Metric label="Peak funding needed" value={money(fin.timing.peak_funding_need, cur)}
              testid="finance-peak" />
            <Metric label="Cash turns positive"
              value={fin.timing.payback_month == null ? "Never" : `Month ${fin.timing.payback_month}`}
              tone={fin.timing.payback_month == null ? "danger" : undefined}
              testid="finance-payback" />
            <Metric label="Cost per saleable sqft" value={money(fin.cost.per_saleable_sqft, cur)}
              testid="finance-cost-psf" />
          </div>
        </Section>
      )}

      {fin && (
        <Section title="Revenue by flat type" testid="finance-mix">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Flats</TableHead>
                <TableHead className="text-right">Saleable area</TableHead>
                <TableHead className="text-right">Per flat</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fin?.revenue?.by_type || []).map((r) => (
                <TableRow key={r.type} data-testid={`finance-type-${r.type}`}>
                  <TableCell className="py-1.5 text-xs font-medium">{UNIT_LABEL(r.type)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-mono">{int(r.units)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-mono">{int(r.saleable_sqft)} sqft</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-mono">{int(r.sqft_per_unit)} sqft</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-mono">{money(r.rate_per_sqft, cur)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right font-mono">{money(r.revenue, cur)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[10px] text-slate-500 mt-2">
            Saleable area is the towers' super built-up area only. Society amenities are built
            and costed but not sold, so they carry no rate.
          </p>
        </Section>
      )}

      <AiPanel
        title="AI feasibility review"
        description="Reads the revenue, cost and cash flow above and says whether this is worth building"
        endpoint={`/projects/${projectId}/ai/finance`}
        body={{ config: cfg }}
        initial={project?.ai?.finance}
        onGenerated={(d) => setProject?.((p) => ({ ...p, ai: { ...(p.ai || {}), finance: d } }))}
        readOnly={readOnly}
        testid="ai-finance"
        emptyHint="Explain whether this project is worth building, what drives the return, and what would improve it."
      />
    </div>
  );
}
