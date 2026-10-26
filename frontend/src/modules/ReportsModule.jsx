import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Download, FileSpreadsheet, Image as ImageIcon, Archive, Maximize2, Layers,
  Sparkles, Copy, Check, ExternalLink, AlertCircle, RefreshCw, Loader2
} from "lucide-react";
import { downloadFile, API_BASE, api, apiError } from "../lib/api";
import { Section } from "../components/Field";
import { AiPanel } from "../components/AiPanel";
import { Button } from "../components/ui/button";
import { int, money, num } from "../lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

// The reports page mirrors the workspace menu: same group order, same group labels, one
// report per module, so a reader looking for "the parking numbers" goes to the group they
// already navigate by and finds a document named after the page they navigate by.
//
// Every report opens with its own Report Summary — the finding, before the workings — so
// a reader who only wants the outcome does not have to reconstruct it from six tables.
//
// Two menu entries have no document of their own on purpose. Versions & Team is the audit
// trail of the project rather than a result of it, and Reports is this page. Everything
// else is here.
const REPORT_GROUPS = [
  ["site", "Site", [
    ["plot", "Plot & Setbacks", "Boundary, area, road edges and statutory setback envelope against NBC minimums"],
    ["gis", "GIS & Terrain Intelligence", "Satellite imagery, elevation profile, slope analysis, sun path and rooftop solar yield"],
    ["township", "Township & Master Plan", "Macro-parcel zoning, mixed-use commercial planning, tower placement and circulation network"],
  ], ""],

  ["design", "Design", [
    ["studio", "Generative Studio & Apartment Planning", "Tower and unit mix, saved AI floor layouts, Vastu checks, facade synthesis, and design alternatives"],
    ["parking", "Parking Layout & Demand", "NBC Part 4 norms, basement ramp geometry, vehicular circulation, and bay demand/supply"],
    ["3d", "3D Visualisation & Spatial Model", "Volumetric tower stacking, structural bay layout, and 3D massing documentation"],
  ], ""],

  ["eng", "Engineering & BIM", [
    ["calculations", "Area & FAR Calculations", "Carpet to built-up to saleable step by step, and the FAR and FSI that fall out of it"],
    ["engineering", "IS / NBC Engineering Dossier", "Member sizing and design checks across IS 456, IS 1893, IS 875, and NBC clauses"],
    ["structural", "Structural Design Basis", "IS 875 gravity/wind loads, IS 1893 seismic base shear, foundation sizing, and concrete mix design"],
    ["water", "Water & Sanitation Infrastructure", "IS 1172 demand build-up, sump & OHT sizing, STP treatment, storm drainage, and RWH"],
    ["fire", "Fire & Life Safety", "NBC Part 4 clause-by-clause fire checks, staircase widths, travel distances, and evacuation routes"],
    ["bim", "BIM & CAD Interchange", "AutoCAD DWG, CAD DXF and Revit IFC4 interoperability drawings and spatial models"],
    ["digital-twin", "Digital Twin & Smart Site", "IoT sensor feeds, 4D construction milestone schedule, and facility telemetry"],
  ], ""],

  ["commercial", "Cost & Procurement", [
    ["boq", "BOQ & Quantities Schedule", "Comprehensive material, labour, and equipment schedules with derived quantities"],
    ["cost", "Cost Estimation", "Itemised DSR/CPWD cost breakdown, wastage allowances, and square-metre costing"],
    ["procurement", "Smart Procurement & Market", "Live wholesale metro commodity prices (steel, cement, RMC), price forecasts, and order schedule"],
    ["programme", "Construction Programme & CPM", "Critical Path Method schedule, task durations, float analysis, and IS 456 floor cycle"],
    ["finance", "Financial Feasibility & ROI", "Revenue projections, developer margin, IRR, payback period, and monthly cash flow"],
  ], ""],

  ["deliver", "Deliver & ESG", [
    ["compliance", "Statutory Compliance Validation", "Rule-by-rule pass/fail against municipal bye-laws, NBC, and development controls"],
    ["urban-sustainability", "Green Building & ESG Audit", "Automated IGBC / GRIHA point scorecard, embodied carbon by material, and disaster risk"],
    ["datahealth", "Data Reliability & Audit Certificate", "Verification that every input, calculation dependency, and engineering assumption holds up"],
    ["executive", "Executive Summary", "The complete executive dossier covering scale, cost, structural safety, compliance, and ROI"],
  ], ""],
];

const REPORTS = REPORT_GROUPS.flatMap(([, , items]) => items);

function TowerDeliverableCard({ tower, idx, project, projectId, token, dl, onExpand }) {
  const tname = tower.name || `Tower ${idx + 1}`;
  const floors = int(tower.floors || 1);
  const unitsCount = (tower.units || []).reduce((acc, u) => acc + (int(u.count) || 0), 0);
  const footprint = num(tower.footprint_area, 0);

  const [activeTab, setActiveTab] = useState("2d"); // "2d" | "ai3d"
  const [viewType, setViewType] = useState("floorplan_3d"); // "floorplan_3d" | "exterior_3d" | "interior_living"
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const img2dUrl = `${API_BASE}/projects/${projectId}/towers/${tower.id}/floorplan-image?token=${token}`;

  useEffect(() => {
    let unmounted = false;
    api.get(`/projects/${projectId}/towers/${tower.id}/ai-render?view_type=${viewType}`)
      .then((res) => {
        if (!unmounted && res.data) {
          if (res.data.has_image) {
            setAiResult({
              status: "success",
              has_image: true,
              image_url: `${API_BASE}/projects/${projectId}/towers/${tower.id}/ai-render-image?view_type=${viewType}&token=${token}`,
              prompt: res.data.prompt,
              meta: res.data.meta,
            });
          } else {
            setAiResult((prev) => (prev?.status === "quota_exceeded" ? prev : { prompt: res.data.prompt, has_image: false }));
          }
        }
      })
      .catch(() => {});
    return () => { unmounted = true; };
  }, [projectId, tower.id, viewType, token]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/projects/${projectId}/towers/${tower.id}/ai-render`, {
        view_type: viewType,
        model: "nano-banana-pro-preview",
      });
      setAiResult(res.data);
      if (res.data.status === "success") {
        toast.success("AI 3D Render generated using Google Nano Banana!");
      } else if (res.data.status === "quota_exceeded") {
        toast.info("Google AI Studio quota notice: Pay-as-you-go billing required for image models.");
      } else {
        toast.error(res.data.message || "Failed to generate AI render.");
      }
    } catch (err) {
      toast.error(apiError(err?.response?.data?.detail, "AI render request failed."));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    if (aiResult?.prompt) {
      navigator.clipboard.writeText(aiResult.prompt);
      setCopied(true);
      toast.success("Prompt copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const viewTypeLabels = {
    floorplan_3d: "3D Isometric Floor Plan",
    exterior_3d: "3D Tower Exterior",
    interior_living: "Luxury Interior Suite",
  };

  const currentAiImgUrl = aiResult?.image_data_uri || (aiResult?.has_image ? `${API_BASE}/projects/${projectId}/towers/${tower.id}/ai-render-image?view_type=${viewType}&token=${token}` : null);

  return (
    <div
      className="bg-white border border-slate-200 rounded-sm overflow-hidden flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors"
      data-testid={`tower-plan-card-${tower.id}`}
    >
      {/* Card Header with Tab Switcher */}
      <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
        <div>
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            {tname}
          </div>
          <div className="text-[11px] text-slate-500">
            {floors} Floors · {unitsCount} Flats/Floor · {footprint} m² Footprint
          </div>
        </div>

        {/* Tab switcher: 2D vs AI 3D */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <div className="inline-flex rounded bg-slate-200/80 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors ${
                activeTab === "2d" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("2d")}
            >
              2D Plan
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === "ai3d" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("ai3d")}
            >
              <Sparkles className="h-3 w-3 text-amber-500" /> AI 3D Render
            </button>
          </div>

          {activeTab === "2d" ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="rounded-sm text-xs h-7 px-2"
                title="Download high-res 2D PNG"
                data-testid={`download-png-${tower.id}`}
                onClick={() => dl(`/projects/${projectId}/towers/${tower.id}/floorplan-image`, `${project.name}_${tname.replace(/\s+/g, "_")}_floorplan.png`)}
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1 text-slate-600" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-sm text-xs h-7 px-2"
                title="Expand floor plan preview"
                onClick={() => onExpand({ name: `${tname} — 2D Architectural Floor Plan`, url: img2dUrl })}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            currentAiImgUrl && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm text-xs h-7 px-2"
                  title="Download 3D Render PNG"
                  onClick={() => dl(`/projects/${projectId}/towers/${tower.id}/ai-render-image?view_type=${viewType}`, `${project.name}_${tname.replace(/\s+/g, "_")}_${viewType}.png`)}
                >
                  <Download className="h-3.5 w-3.5 mr-1 text-slate-600" /> PNG
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm text-xs h-7 px-2"
                  title="Expand 3D Render preview"
                  onClick={() => onExpand({ name: `${tname} — ${viewTypeLabels[viewType]}`, url: currentAiImgUrl })}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Card Body */}
      {activeTab === "2d" ? (
        /* 2D Architectural Drawing */
        <div
          className="relative bg-slate-50 aspect-16/10 flex items-center justify-center cursor-pointer group overflow-hidden border-b border-slate-100"
          onClick={() => onExpand({ name: `${tname} — 2D Architectural Floor Plan`, url: img2dUrl })}
        >
          <img
            src={img2dUrl}
            alt={`${tname} Floor Plan`}
            className="w-full h-full object-contain p-2 group-hover:scale-102 transition-transform duration-200"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 flex items-center justify-center transition-colors">
            <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-slate-800 text-[11px] font-medium px-2.5 py-1 rounded shadow-sm flex items-center gap-1.5 transition-opacity">
              <Maximize2 className="h-3 w-3" /> Click to enlarge 2D Blueprint
            </span>
          </div>
        </div>
      ) : (
        /* AI 3D Render (Nano Banana) */
        <div className="flex flex-col flex-1">
          {/* Sub-bar: View Style selection */}
          <div className="px-3 py-2 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex gap-1">
              {[
                ["floorplan_3d", "3D Isometric"],
                ["exterior_3d", "3D Exterior"],
                ["interior_living", "Luxury Interior"],
              ].map(([vt, lbl]) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => setViewType(vt)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                    viewType === vt
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1 rounded-sm shadow-xs"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> Rendering...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  {currentAiImgUrl ? "Regenerate" : "Generate Render"}
                </>
              )}
            </Button>
          </div>

          {/* AI Render View Area */}
          <div className="relative bg-slate-900/5 aspect-16/10 flex flex-col items-center justify-center overflow-hidden border-b border-slate-100 p-4">
            {loading ? (
              <div className="text-center space-y-2.5 p-6 max-w-sm">
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-blue-50 text-blue-600 shadow-sm animate-pulse">
                  <Sparkles className="h-6 w-6 text-amber-500 animate-spin" />
                </div>
                <div className="text-xs font-semibold text-slate-800">
                  Google Nano Banana (<code className="font-mono text-[10px] text-blue-600">nano-banana-pro-preview</code>)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Synthesizing architectural geometry, lighting, and materials into an 8K photorealistic render...
                </p>
              </div>
            ) : currentAiImgUrl ? (
              <div
                className="relative w-full h-full flex items-center justify-center cursor-pointer group"
                onClick={() => onExpand({ name: `${tname} — ${viewTypeLabels[viewType]}`, url: currentAiImgUrl })}
              >
                <img
                  src={currentAiImgUrl}
                  alt={`${tname} AI Render`}
                  className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-200 rounded"
                />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 flex items-center justify-center transition-colors">
                  <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-slate-800 text-[11px] font-medium px-2.5 py-1 rounded shadow-sm flex items-center gap-1.5 transition-opacity">
                    <Maximize2 className="h-3 w-3" /> Click to enlarge
                  </span>
                </div>
                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded font-mono">
                  Nano Banana Preview
                </div>
              </div>
            ) : aiResult?.status === "quota_exceeded" ? (
              <div className="w-full h-full overflow-y-auto bg-amber-50/70 border border-amber-200/80 rounded p-3.5 text-left space-y-2.5">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold">Google AI Studio Quota Notice (Free Tier Limit: 0)</div>
                    <div className="text-[11px] text-amber-800/90 mt-0.5 leading-normal">
                      Google sets free-tier image model quota to 0 for <code className="font-mono bg-amber-100/80 px-1 py-0.2 rounded text-[10px]">nano-banana-pro-preview</code>. Attach a Pay-as-you-go billing account in Google AI Studio to unlock instant cloud renders with your key.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-white border border-blue-200 px-2.5 py-1 rounded shadow-xs"
                  >
                    Enable Billing in Google AI Studio <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6.5 text-[11px] bg-white gap-1 px-2"
                    onClick={handleCopyPrompt}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-500" />}
                    {copied ? "Copied!" : "Copy Tower Prompt"}
                  </Button>
                </div>

                {aiResult?.prompt && (
                  <div className="bg-white/90 border border-amber-200 rounded p-2 text-[10.5px] font-mono text-slate-700 max-h-24 overflow-y-auto leading-tight">
                    {aiResult.prompt}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-3 p-4 max-w-sm">
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-blue-50 text-blue-600 shadow-xs">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {viewTypeLabels[viewType]}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                    Generate cinematic 3D renders using Google Nano Banana (<code className="font-mono text-[10px]">models/nano-banana-pro-preview</code>) based on the computed floor plate geometry.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-sm text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
                  onClick={handleGenerate}
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Generate {viewTypeLabels[viewType]}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsModule({ project, analysis, projectId, readOnly, setProject }) {
  const [activePreview, setActivePreview] = useState(null);
  const a = analysis;
  const token = typeof window !== "undefined" ? (localStorage.getItem("aptimizer_token") || "") : "";
  const towers = project?.towers || [];
  const dl = async (path, name) => {
    try {
      await downloadFile(path, name);
      toast.success(`${name} downloaded`);
    } catch (e) {
      toast.error(apiError(e?.message || e?.response?.data?.detail, `Failed to download ${name}`));
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Executive snapshot" description="Values embedded in every generated report" testid="report-snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
          {[
            ["Plot area", `${num(a?.areas.plot_area_sqm, 0)} m²`],
            ["Built-up area", `${num(a?.areas.builtup_area_sqm, 0)} m²`],
            ["Units", int(a?.areas.total_units)],
            ["FAR / FSI", `${num(a?.areas.far, 2)} / ${num(a?.areas.fsi, 2)}`],
            ["Parking req/prov", `${int(a?.parking.required_slots)} / ${int(a?.parking.provided_slots)}`],
            ["Total cost", money(a?.cost.total, a?.cost.currency)],
            ["Cost / flat", money(a?.cost.per_unit, a?.cost.currency)],
            ["Compliance", `${a?.compliance.passed}/${a?.compliance.total}`],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
              <div className="font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-slate-500 max-w-xl">
          {REPORTS.length} reports, one per module, grouped and ordered as in the menu.
          Each opens with a Report Summary — its own finding, before its workings.
        </p>
        <Button
          className="rounded-sm"
          data-testid="download-all-reports"
          onClick={() => dl(`/projects/${projectId}/reports/all`,
            `${project.name.replace(/\s+/g, "_")}_all_reports.pdf`)}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download all as one PDF
        </Button>
      </div>

      {/* Tower Proposed Floor Plans Section */}
      {towers.length > 0 && (
        <Section
          title="Tower Proposed Floor Plans"
          description="2D architectural presentation drawings generated from each tower's proposed layout"
          testid="report-floorplans-section"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 p-3 border border-slate-200 rounded-sm">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {towers.length} {towers.length === 1 ? "Tower Layout" : "Tower Layouts"} Ready for Export
                </div>
                <div className="text-[11px] text-slate-500">
                  High-resolution 2D architectural presentation drawings with room schedules and dimensions
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm text-xs bg-white"
                  data-testid="download-floorplans-pdf"
                  onClick={() => dl(`/projects/${projectId}/reports/floorplans`, `${project.name.replace(/\s+/g, "_")}_floorplans.pdf`)}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> All Drawings PDF
                </Button>
                <Button
                  size="sm"
                  className="rounded-sm text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="download-floorplans-zip"
                  onClick={() => dl(`/projects/${projectId}/floorplans/zip`, `${project.name.replace(/\s+/g, "_")}_floorplans.zip`)}
                >
                  <Archive className="h-3.5 w-3.5 mr-1.5" /> All Plans (ZIP)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {towers.map((tower, idx) => (
                <TowerDeliverableCard
                  key={tower.id || idx}
                  tower={tower}
                  idx={idx}
                  project={project}
                  projectId={projectId}
                  token={token}
                  dl={dl}
                  onExpand={setActivePreview}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {REPORT_GROUPS.map(([gid, label, items, note]) => {
        // The workbook is an extra card in the commercial group, so it counts towards
        // whether the last row is short. A group with an odd number of cards would
        // otherwise leave a grey half-row under the final one; letting that card span
        // both columns fills it instead.
        const cards = items.length + (gid === "commercial" ? 1 : 0);
        const wide = cards % 2 === 1 ? "md:col-span-2" : "";
        return (
        <div key={gid} className="space-y-2" data-testid={`report-group-${gid}`}>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500">{label}</h3>
          {note && <p className="text-[11px] text-slate-500">{note}</p>}
          {items.length > 0 && (
            <div className="grid gap-px bg-slate-200 border border-slate-200 md:grid-cols-2">
              {items.map(([key, title, desc], i) => (
                <div key={key}
                  className={`bg-white p-4 flex items-start justify-between gap-4 ${
                    gid !== "commercial" && i === items.length - 1 ? wide : ""}`}
                  data-testid={`report-card-${key}`}>
                  <div>
                    <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                  {key === "bim" ? (
                    <div className="flex flex-wrap gap-1.5 shrink-0 justify-end max-w-[210px]">
                      <Button size="sm" variant="outline" className="rounded-sm text-xs h-7 px-2 font-medium bg-white hover:bg-slate-50"
                        title="Download AutoCAD DWG"
                        data-testid="download-bim-dwg"
                        onClick={() => dl(`/projects/${projectId}/bim/export/dwg`,
                          `${project.name.replace(/\s+/g, "_")}_siteplan.dwg`)}>
                        <Download className="h-3 w-3 mr-1 text-slate-700" /> DWG
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-sm text-xs h-7 px-2 font-medium bg-white hover:bg-slate-50"
                        title="Download CAD DXF"
                        data-testid="download-bim-dxf"
                        onClick={() => dl(`/projects/${projectId}/bim/export/dxf`,
                          `${project.name.replace(/\s+/g, "_")}_siteplan.dxf`)}>
                        <Download className="h-3 w-3 mr-1 text-slate-700" /> DXF
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-sm text-xs h-7 px-2 font-medium bg-white hover:bg-slate-50"
                        title="Download Revit IFC4"
                        data-testid="download-bim-ifc"
                        onClick={() => dl(`/projects/${projectId}/bim/export/ifc`,
                          `${project.name.replace(/\s+/g, "_")}_scheme.ifc`)}>
                        <Download className="h-3 w-3 mr-1 text-slate-700" /> IFC
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-sm text-xs shrink-0"
                      data-testid={`download-${key}-report`}
                      onClick={() => dl(`/projects/${projectId}/reports/${key}`,
                        `${project.name.replace(/\s+/g, "_")}_${key}.pdf`)}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                    </Button>
                  )}
                </div>
              ))}
              {/* The workbook belongs beside the BOQ report it duplicates in Excel form. */}
              {gid === "commercial" && (
                <div className={`bg-white p-4 flex items-start justify-between gap-4 ${wide}`}
                  data-testid="report-card-boq-excel">
                  <div>
                    <h4 className="text-sm font-semibold tracking-tight">BOQ Workbook</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Excel with Materials, Labour, Equipment and Summary sheets
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-sm text-xs shrink-0"
                    data-testid="download-boq-excel"
                    onClick={() => dl(`/projects/${projectId}/boq.xlsx`,
                      `${project.name.replace(/\s+/g, "_")}_BOQ.xlsx`)}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      <AiPanel
        title="AI executive summary"
        description="A client-facing narrative of scale, cost, compliance and the open decisions, written from the figures above"
        endpoint={`/projects/${projectId}/ai/report`}
        initial={project?.ai?.report}
        onGenerated={(d) => setProject?.((p) => ({ ...p, ai: { ...(p.ai || {}), report: d } }))}
        readOnly={readOnly}
        testid="ai-report"
        emptyHint="Draft a plain-language summary for the client, covering what this project is, what it costs and what still needs a decision."
      />

      {/* Lightbox Preview Modal */}
      <Dialog open={Boolean(activePreview)} onOpenChange={(open) => !open && setActivePreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              {activePreview?.name} — Proposed Floor Plate Layout
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto bg-slate-100 rounded border border-slate-200 flex items-center justify-center p-2">
            {activePreview?.url && (
              <img
                src={activePreview.url}
                alt={activePreview.name}
                className="max-w-full max-h-[75vh] object-contain rounded shadow-sm"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
