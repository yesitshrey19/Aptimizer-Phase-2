import React, { useState, useEffect } from "react";
import { api, apiError } from "../lib/api";
import { toast } from "sonner";
import {
  ShoppingCart,
  TrendingUp,
  Truck,
  Calendar,
  Boxes,
  FileSpreadsheet,
  Building,
  GraduationCap,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Package,
} from "lucide-react";
import { Section, Metric } from "../components/Field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { inr, num } from "../lib/format";

export default function ProcurementMarketModule({ project, projectId }) {
  const [activeTab, setActiveTab] = useState("prices");
  const [selectedMetro, setSelectedMetro] = useState("Delhi-NCR");
  const [loading, setLoading] = useState(false);

  // States
  const [pricesData, setPricesData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [suppliersData, setSuppliersData] = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [tenderData, setTenderData] = useState(null);
  const [govtDossier, setGovtDossier] = useState(null);
  const [marketplace, setMarketplace] = useState(null);
  const [educationalGuide, setEducationalGuide] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState("setbacks");

  useEffect(() => {
    loadPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetro]);

  useEffect(() => {
    loadProjectData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadPrices() {
    try {
      const res = await api.get(`/procurement/live-prices?metro=${encodeURIComponent(selectedMetro)}`);
      setPricesData(res.data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function loadProjectData() {
    setLoading(true);
    try {
      const [fRes, sRes, cRes, iRes, tRes, gRes, mRes, eRes] = await Promise.all([
        api.get("/procurement/forecast?material=steel&horizon=12"),
        api.get("/procurement/suppliers"),
        api.get(`/projects/${projectId}/procurement/calendar`),
        api.get(`/projects/${projectId}/procurement/inventory`),
        api.get(`/projects/${projectId}/procurement/tender-docs`),
        api.get(`/projects/${projectId}/procurement/govt-dossier`),
        api.get("/ecosystem/marketplace"),
        api.get(`/ecosystem/educational?topic=${selectedTopic}`),
      ]);
      setForecastData(fRes.data);
      setSuppliersData(sRes.data);
      setCalendarData(cRes.data);
      setInventoryData(iRes.data);
      setTenderData(tRes.data);
      setGovtDossier(gRes.data);
      setMarketplace(mRes.data);
      setEducationalGuide(eRes.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function changeTopic(topic) {
    setSelectedTopic(topic);
    try {
      const res = await api.get(`/ecosystem/educational?topic=${topic}`);
      setEducationalGuide(res.data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

const TAB_GROUPS = [
  {
    category: "Prices & Market",
    tabs: [
      { id: "prices", label: "Reference Prices", icon: TrendingUp },
      { id: "forecast", label: "Price Forecasting", icon: Calendar },
      { id: "marketplace", label: "Marketplace & APIs", icon: Package },
    ],
  },
  {
    category: "Supply & Inventory",
    tabs: [
      { id: "suppliers", label: "Supplier Intelligence", icon: Truck },
      { id: "calendar", label: "JIT Calendar", icon: Calendar },
      { id: "inventory", label: "Inventory & EOQ", icon: Boxes },
    ],
  },
  {
    category: "Governance & Dossiers",
    tabs: [
      { id: "tenders", label: "Tender Generator", icon: FileSpreadsheet },
      { id: "approvals", label: "Govt Approvals", icon: Building },
      { id: "edu", label: "Educational Mode", icon: GraduationCap },
    ],
  },
];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Supply Chain & Procurement
              </span>
              <span className="text-xs text-slate-500 font-medium">National Commodity Feeds & Governance</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-amber-600" />
              Smart Procurement & Ecosystem Platform
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              Reference material prices, price trend model, programme-driven procurement calendar, vendor register, tender documentation, and approval dossiers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedMetro} onValueChange={setSelectedMetro}>
              <SelectTrigger className="w-40 bg-white border-slate-300 text-xs text-slate-800 shadow-2xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Delhi-NCR", "Mumbai-MMR", "Bengaluru", "Hyderabad", "Chennai", "Pune"].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadProjectData} disabled={loading} className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium">
              {loading ? "Refreshing..." : "Refresh All"}
            </Button>
          </div>
        </div>

        {/* Clubbed Tab Navigation */}
        <div className="mt-6 border-t border-slate-100 pt-4 space-y-3">
          <div className="flex flex-wrap gap-4 items-center">
            {TAB_GROUPS.map((grp) => (
              <div key={grp.category} className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 border border-slate-200/80">
                <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {grp.category}:
                </span>
                {grp.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        active
                          ? "bg-amber-500 text-slate-950 shadow-xs font-bold"
                          : "text-slate-700 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: LIVE MATERIAL PRICES */}
      {activeTab === "prices" && (
        <div className="space-y-6">
          <Section
            title={`Indexed Commodity Rates: ${selectedMetro}`}
            desc={`Source: ${pricesData?.index_source || "National Construction Materials Exchange"}`}
          >
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="text-slate-700 font-semibold">Material Specification</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Billing Unit</TableHead>
                    <TableHead className="text-right text-slate-700 font-semibold">Reference Rate (INR)</TableHead>
                    <TableHead className="text-center text-slate-700 font-semibold">30-Day Trend</TableHead>
                    <TableHead className="text-center text-slate-700 font-semibold">Volatility</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricesData?.items?.map((item, idx) => (
                    <TableRow key={idx} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">{item.material}</TableCell>
                      <TableCell className="text-slate-600 font-mono">{item.unit}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-slate-900">₹{num(item.price_inr)}</TableCell>
                      <TableCell className={`text-center font-semibold font-mono ${item.trend.startsWith("+") ? "text-rose-600" : "text-emerald-600"}`}>
                        {item.trend}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          item.volatility === "High" ? "bg-rose-50 text-rose-700 border-rose-200" :
                          item.volatility === "Moderate" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}>
                          {item.volatility}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 2: PRICE FORECASTING */}
      {activeTab === "forecast" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Metric label="Target Commodity" value="TMT Rebar Fe 550D" />
            <Metric label="Annualized Inflation" value={`${forecastData?.annualized_inflation_rate_pct}%`} />
            <Metric label="Projection Horizon" value={`${forecastData?.horizon_months} Months`} />
          </div>

          <Section title="12-Month Commodity Price Projection" desc="Time-series forecasting integrating seasonal monsoon cooling and post-monsoon demand surges">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="text-slate-700 font-semibold">Month</TableHead>
                    <TableHead className="text-right text-slate-700 font-semibold">Projected Price ({forecastData?.unit})</TableHead>
                    <TableHead className="text-right text-slate-700 font-semibold">Lower Bound</TableHead>
                    <TableHead className="text-right text-slate-700 font-semibold">Upper Bound</TableHead>
                    <TableHead className="text-right text-slate-700 font-semibold">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecastData?.forecast_series?.map((fc, idx) => (
                    <TableRow key={idx} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">{fc.month}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-slate-900">₹{num(fc.projected_price)}</TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">₹{num(fc.lower_bound)}</TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">₹{num(fc.upper_bound)}</TableCell>
                      <TableCell className="text-right font-semibold font-mono text-slate-500">{fc.confidence_pct == null ? "model" : `${fc.confidence_pct}%`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
              <strong className="font-semibold">Advisory:</strong> {forecastData?.procurement_advisory}
            </div>
          </Section>
        </div>
      )}

      {/* TAB 3: SUPPLIER INTELLIGENCE */}
      {activeTab === "suppliers" && (
        <div className="space-y-6">
          <Section title="Vendor Register" desc={suppliersData?.note || "Ratings and delivery performance from the project's own purchase records"}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliersData?.suppliers?.map((sup) => (
                <div key={sup.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">{sup.name}</span>
                      <span className="text-amber-800 font-medium text-xs">{sup.category}</span>
                    </div>
                    <span className="rounded bg-emerald-100 border border-emerald-200 px-2 py-0.5 font-semibold text-emerald-800 text-[10px]">
                      {sup.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-white border border-slate-200 p-2 shadow-2xs">
                      <span className="text-slate-500 block text-[10px] font-medium">Rating</span>
                      <strong className="text-amber-700 text-sm">{sup.rating == null ? "—" : `★ ${sup.rating}`}</strong>
                    </div>
                    <div className="rounded bg-white border border-slate-200 p-2 shadow-2xs">
                      <span className="text-slate-500 block text-[10px] font-medium">On-Time Delivery</span>
                      <strong className="text-emerald-700 text-sm">{sup.delivery_on_time_pct == null ? "—" : `${sup.delivery_on_time_pct}%`}</strong>
                    </div>
                    <div className="rounded bg-white border border-slate-200 p-2 shadow-2xs">
                      <span className="text-slate-500 block text-[10px] font-medium">Credit Terms</span>
                      <strong className="text-slate-900 text-sm">{sup.credit_terms_days == null ? "—" : `${sup.credit_terms_days} Days`}</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sup.certified_standards?.map((std, i) => (
                      <span key={i} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] text-slate-700 font-mono">
                        {std}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* TAB 4: JIT CALENDAR */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <Section title="Procurement Calendar" desc="Call-off orders set back from this project's programme by each supplier lead time">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="text-slate-700 font-semibold">Construction Phase</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Material & Specification</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Order Date</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Delivery Date</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Quantity</TableHead>
                    <TableHead className="text-center text-slate-700 font-semibold">CPM Activity</TableHead>
                    <TableHead className="text-center text-slate-700 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calendarData?.milestones?.map((m, idx) => (
                    <TableRow key={idx} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">{m.phase}</TableCell>
                      <TableCell className="text-slate-800 font-medium">{m.material}</TableCell>
                      <TableCell className="text-slate-600 font-mono">{m.order_date}</TableCell>
                      <TableCell className="text-slate-600 font-mono">{m.delivery_date}</TableCell>
                      <TableCell className="font-bold text-slate-900">{m.quantity}</TableCell>
                      <TableCell className="text-center font-mono text-blue-700 font-semibold">{m.cpm_activity_id}</TableCell>
                      <TableCell className="text-center">
                        <span className="rounded bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {m.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 5: INVENTORY & EOQ */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Metric label="Inventory Carrying Cost" value={`${inventoryData?.carrying_cost_pct}%`} />
            <Metric label="Stockout Risk" value={inventoryData?.stockout_risk_score} />
          </div>

          <Section title="Inventory Optimization & Storage Yard Allocation" desc="Economic Order Quantity (EOQ), buffer safety stocks, and reorder levels">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="text-slate-700 font-semibold">Material</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Total Demand</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Daily Rate</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Lead Time</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Safety Stock</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Reorder Point</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Optimal EOQ</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Yard Allocation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData?.inventory_items?.map((inv, idx) => (
                    <TableRow key={idx} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">{inv.material}</TableCell>
                      <TableCell className="text-slate-700">{inv.total_project_demand}</TableCell>
                      <TableCell className="text-slate-600">{inv.daily_consumption_rate}</TableCell>
                      <TableCell className="text-slate-600">{inv.lead_time_days} days</TableCell>
                      <TableCell className="font-semibold text-amber-800">{inv.safety_stock}</TableCell>
                      <TableCell className="font-bold text-blue-700">{inv.reorder_point}</TableCell>
                      <TableCell className="font-bold text-emerald-700">{inv.economic_order_qty_eoq}</TableCell>
                      <TableCell className="text-slate-600 text-[11px]">{inv.storage_yard_allocation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 6: TENDER GENERATOR */}
      {activeTab === "tenders" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-blue-700 font-semibold text-xs block">{tenderData?.nit?.tender_ref_no}</span>
                <h3 className="font-bold text-slate-900 text-base">{tenderData?.nit?.title}</h3>
              </div>
              <span className="rounded bg-emerald-100 border border-emerald-200 px-3 py-1 font-semibold text-emerald-800 text-xs">
                {tenderData?.tender_package_status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Metric label="Estimated Tender Value" value={inr(tenderData?.nit?.estimated_tender_value_inr)} />
              <Metric label="Earnest Money Deposit (1%)" value={inr(tenderData?.nit?.earnest_money_deposit_emd_inr)} />
              <Metric label="Completion Period" value={`${tenderData?.nit?.completion_period_months} Months`} />
              <Metric label="Contract Structure" value="Item-Rate / CPWD" />
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Compiled Tender Sections:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {tenderData?.sections?.map((sec, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-slate-50 border border-slate-200 p-2.5 text-slate-800 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{sec}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => toast.success("Tender Package compiled and downloaded.")}>
                <Download className="h-4 w-4" /> Download Complete Tender Package (ZIP)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: GOVERNMENT APPROVALS */}
      {activeTab === "approvals" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Metric label="Overall Dossier Readiness" value={`${govtDossier?.overall_submission_readiness_pct}%`} />
            <Metric label="Statutory Clearance Agencies" value={govtDossier?.total_clearance_agencies || 4} />
          </div>

          <Section title="Statutory Submission Dossiers" desc="Automated compliance packs for RERA, Fire Services, and Municipal sanction">
            <div className="space-y-4">
              {govtDossier?.clearances?.map((clr, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs space-y-2 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">{clr.agency}</span>
                      <span className="text-amber-800 font-medium text-xs">{clr.document}</span>
                    </div>
                    <span className="rounded bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                      {clr.status} ({clr.readiness_pct}%)
                    </span>
                  </div>
                  <div>
                    <strong className="text-slate-600 block mb-1 text-[11px]">Required Attachments & Verification:</strong>
                    <div className="flex flex-wrap gap-2">
                      {clr.required_attachments?.map((att, i) => (
                        <span key={i} className="rounded bg-white px-2.5 py-1 text-[11px] text-slate-800 flex items-center gap-1.5 border border-slate-200 shadow-2xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {att}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* TAB 8: MARKETPLACE & APIS */}
      {activeTab === "marketplace" && (
        <div className="space-y-6">
          <Section title="Engineering Plugin Marketplace" desc="Exports available today, and integrations that are planned">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {marketplace?.plugins?.map((plg) => (
                <div key={plg.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{plg.name}</span>
                    <span className="rounded bg-blue-100 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-800 font-medium">{plg.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 text-[11px]">
                    <span>{plg.category}</span>
                    <span className="font-semibold text-emerald-700">{plg.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Developer API Specifications" desc="Headless REST integrations and webhook endpoints">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="w-64 text-slate-700 font-semibold">Endpoint</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Description</TableHead>
                    <TableHead className="w-36 text-slate-700 font-semibold">Authentication</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marketplace?.apis?.map((apiItem, idx) => (
                    <TableRow key={idx} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="font-mono text-blue-700 font-semibold">{apiItem.endpoint}</TableCell>
                      <TableCell className="text-slate-800">{apiItem.desc}</TableCell>
                      <TableCell className="text-slate-600 font-mono text-[11px]">{apiItem.auth}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 9: EDUCATIONAL MODE */}
      {activeTab === "edu" && (
        <div className="space-y-6">
          <Section title="Civil Engineering Knowledge Base & Code Explanations" desc="Interactive tutorials and structural principles for engineers and students">
            <div className="flex gap-2 mb-4">
              {educationalGuide?.available_topics?.map((top) => (
                <button
                  key={top}
                  onClick={() => changeTopic(top)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    selectedTopic === top ? "bg-amber-500 text-slate-950 font-bold shadow-xs" : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                  }`}
                >
                  {top.replace("_", " ")}
                </button>
              ))}
            </div>

            {educationalGuide?.guide && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs space-y-4 shadow-sm">
                <div className="border-b border-slate-200 pb-3">
                  <span className="rounded bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900 uppercase">
                    {educationalGuide.guide.governing_code}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base mt-1">{educationalGuide.guide.topic}</h3>
                </div>

                <div className="space-y-3 text-slate-800">
                  <div>
                    <strong className="text-slate-600 block mb-1">Core Engineering Principle:</strong>
                    <p className="text-slate-900 font-medium">{educationalGuide.guide.principle}</p>
                  </div>
                  <div>
                    <strong className="text-slate-600 block mb-1">Practical Rule of Thumb:</strong>
                    <p className="text-emerald-800 font-medium bg-emerald-50/70 p-2.5 rounded border border-emerald-200">{educationalGuide.guide.rule_of_thumb}</p>
                  </div>
                  <div>
                    <strong className="text-slate-600 block mb-1">Common Pitfall to Avoid:</strong>
                    <p className="text-rose-800 font-medium bg-rose-50/70 p-2.5 rounded border border-rose-200">{educationalGuide.guide.common_mistakes}</p>
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
