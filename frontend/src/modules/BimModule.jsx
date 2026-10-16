import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, RefreshCw, Upload, Compass, Landmark } from "lucide-react";
import { api, apiError, downloadFile } from "../lib/api";
import { Metric, Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

/**
 * BIM & CAD interchange — the module that talks to AutoCAD and Revit.
 *
 * Import side: a .dxf drawing is uploaded, its layers inventoried (entity
 * counts, closed rings, areas), and a chosen layer's largest closed ring
 * becomes the project's plot boundary — saved to the project, centred on where
 * the plot already sits, so setbacks, packing and the 3D model continue from it.
 *
 * Export side: the whole scheme as a layered DXF R2018 drawing (AutoCAD,
 * BricsCAD, LibreCAD) and as a georeferenced IFC4 model that Revit links and
 * free IFC viewers open — one building per tower, a real storey per floor.
 */
export default function BimModule({ project, projectId, readOnly }) {
  const [summary, setSummary] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const loadSummary = () => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/bim/summary`)
      .then(({ data }) => setSummary(data))
      .catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary(); }, [projectId]);

  const inspect = async (file) => {
    if (!file) return;
    setBusy(true);
    setInspection(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/bim/dxf/inspect", form);
      setInspection(data);
      const likely = data.layers?.find((l) => l.likely_boundary && l.closed_rings > 0);
      if (likely) setSelectedLayer(likely.name);
      toast.success(`${data.filename}: ${data.layers.length} layers, ${data.total_entities} entities`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const importBoundary = async () => {
    const file = importRef.current?.files?.[0];
    if (!file || !selectedLayer) {
      toast.error("Choose a DXF file and the layer carrying the boundary");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(
        `/projects/${projectId}/bim/dxf/import-boundary?layer=${encodeURIComponent(selectedLayer)}`,
        form);
      toast.success(`Boundary imported — ${data.area_sqm.toLocaleString()} m² from ${data.source}`);
      loadSummary();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setImporting(false);
    }
  };

  const exportDxf = async () => {
    try {
      await downloadFile(`/projects/${projectId}/bim/export/dxf`, `${project?.name || "siteplan"}_siteplan.dxf`);
      toast.success("DXF downloaded — opens in AutoCAD, BricsCAD, LibreCAD");
    } catch (e) {
      toast.error(apiError(e.message || e.response?.data?.detail, "DXF export failed"));
    }
  };

  const exportDwg = async () => {
    try {
      const saved = await downloadFile(`/projects/${projectId}/bim/export/dwg`, `${project?.name || "siteplan"}_siteplan.dwg`);
      if (saved?.toLowerCase().endsWith(".dwg")) {
        toast.success("AutoCAD DWG downloaded - opens in AutoCAD, BricsCAD, DraftSight");
      } else {
        toast.info("Saved as DXF: the server has no DWG converter (ODA File Converter). AutoCAD, BricsCAD and Revit open DXF directly.");
      }
    } catch (e) {
      toast.error(apiError(e.message || e.response?.data?.detail, "AutoCAD DWG export failed"));
    }
  };

  const exportIfc = async () => {
    try {
      await downloadFile(`/projects/${projectId}/bim/export/ifc`, `${project?.name || "scheme"}.ifc`);
      toast.success("IFC4 downloaded — Revit: Insert → Link IFC");
    } catch (e) {
      toast.error(apiError(e.message || e.response?.data?.detail, "IFC4 export failed"));
    }
  };

  const plot = project?.plot || {};
  const dxf = summary?.dxf || {};
  const ifc = summary?.ifc || {};

  return (
    <div className="space-y-4">
      <Section
        title="CAD import — DXF drawing"
        description="Upload a surveyor's or architect's DXF, pick the boundary layer, and the closed ring becomes the project's plot boundary"
        testid="bim-import-section"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input ref={importRef} type="file" accept=".dxf" className="hidden" data-testid="bim-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { inspect(f); } }} />
          <Button size="sm" className="h-8 rounded-sm" disabled={busy || readOnly}
            onClick={() => importRef.current?.click()} data-testid="bim-choose-file">
            <Upload className="h-3.5 w-3.5 mr-1.5" /> {busy ? "Reading…" : inspection ? "Choose another DXF" : "Choose DXF file"}
          </Button>
          {inspection && (
            <>
              <select
                value={selectedLayer}
                onChange={(e) => setSelectedLayer(e.target.value)}
                className="h-8 text-xs rounded-sm border border-slate-300 bg-white px-2 font-mono"
                data-testid="bim-layer-select"
              >
                <option value="">— pick boundary layer —</option>
                {inspection.layers.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} ({l.closed_rings} ring{l.closed_rings === 1 ? "" : "s"})
                    {l.likely_boundary ? " ★" : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" className="h-8 rounded-sm bg-blue-600 hover:bg-blue-700 text-white"
                disabled={importing || readOnly || !selectedLayer} onClick={importBoundary}
                data-testid="bim-import-button">
                <FileUp className="h-3.5 w-3.5 mr-1.5" />
                {importing ? "Importing…" : "Import as plot boundary"}
              </Button>
            </>
          )}
        </div>

        {!inspection && (
          <p className="text-xs text-slate-500" data-testid="bim-import-hint">
            DXF only — a DWG must be re-saved as DXF from the CAD product first. The drawing is read
            as metres; rings under 25 m² are refused so a stray hatch polygon can never become a plot.
          </p>
        )}

        {inspection && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wide">Layer</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Entities</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Closed rings</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Largest ring</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Boundary hint</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspection.layers.map((l) => (
                <TableRow key={l.name} data-testid={`bim-layer-row-${l.name}`}>
                  <TableCell className="font-mono text-xs">{l.name}</TableCell>
                  <TableCell className="font-mono text-xs">{l.entities}</TableCell>
                  <TableCell className="font-mono text-xs">{l.closed_rings}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.largest_ring_area_sqm ? `${l.largest_ring_area_sqm.toLocaleString()} m²` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.likely_boundary ? <span className="text-amber-700">★ named like a boundary</span> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {plot.imported_from && (
          <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-sm px-3 py-2 mt-3"
             data-testid="bim-imported-banner">
            Current boundary imported from {plot.imported_from}
            {plot.area_sqm ? ` — ${Number(plot.area_sqm).toLocaleString()} m²` : ""}.
          </p>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section
          title="Export — DXF site plan"
          description="The scheme as a layered AutoCAD R2018 drawing, in metres"
          testid="bim-dxf-section"
        >
          {dxf.tower_footprints !== undefined ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Metric label="Tower footprints" value={dxf.tower_footprints} testid="bim-dxf-towers" />
              <Metric label="Parking bays" value={dxf.parking_bays} testid="bim-dxf-bays" />
            </div>
          ) : null}
          <div className="space-y-1 mb-3">
            {(dxf.layers || []).map((l) => (
              <div key={l.name} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="w-28 text-slate-800">{l.name}</span>
                <span className="text-slate-500">{l.description}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {dxf.opens_in || "AutoCAD, BricsCAD, LibreCAD, DraftSight"}{dxf.has_boundary === false
              ? " — no drawn boundary yet, the drawing carries towers and bays only" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-8 rounded-sm" onClick={exportDxf}
              data-testid="bim-export-dxf">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download DXF
            </Button>
            <Button size="sm" className="h-8 rounded-sm bg-slate-800 hover:bg-slate-700" onClick={exportDwg}
              data-testid="bim-export-dwg">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download DWG
            </Button>
          </div>
        </Section>

        <Section
          title="Export — IFC4 model"
          description="Georeferenced building model: one building per tower, a real storey per floor"
          testid="bim-ifc-section"
        >
          {ifc.buildings !== undefined ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Metric label="Buildings" value={ifc.buildings} testid="bim-ifc-buildings" />
              <Metric label="Storeys" value={ifc.storeys} testid="bim-ifc-storeys" />
            </div>
          ) : null}
          {ifc.towers?.length > 0 && (
            <div className="space-y-1 mb-3">
              {ifc.towers.map((t, i) => (
                <div key={i} className="text-[11px] font-mono text-slate-700">
                  {t.name || "Tower"} — {t.floors ?? "?"} floors, {t.footprint_sqm ?? "?"} m² footprint
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mb-3">{ifc.viewer_hint}</p>
          <Button size="sm" className="h-8 rounded-sm" onClick={exportIfc}
            data-testid="bim-export-ifc">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download IFC
          </Button>
        </Section>
      </div>

      <Section
        title="How the round-trip stays honest"
        description="What is exchanged, and what deliberately is not"
        testid="bim-notes-section"
      >
        <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li>
            <Compass className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-blue-600" />
            <strong>Imported boundaries keep their place.</strong> The DXF ring is read as metres and
            centred on the plot's existing centroid, using the same projection the layout engine and
            3D view use — so setbacks, packing and the model continue without a jump.
          </li>
          <li>
            <Landmark className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-blue-600" />
            <strong>The IFC is georeferenced</strong> at the plot centroid (IfcSite RefLatitude /
            RefLongitude), so Revit's site placement and any GIS round-trip agree with the map.
          </li>
          <li>
            <RefreshCw className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-blue-600" />
            <strong>Exports carry what the engine computed</strong> — boundary, footprints, floors,
            bays — and say so when a piece is missing rather than filling it with invented geometry.
          </li>
          <li>
            This is interoperability, not an embedded CAD editor: drawing is still done in AutoCAD or
            Revit, and this module moves the geometry and the numbers between them and the project model.
          </li>
        </ul>
      </Section>
    </div>
  );
}
