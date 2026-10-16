import { AlertTriangle, Check, X } from "lucide-react";
import { Metric, NumField, Section } from "../components/Field";
import OptimiserPanel from "../components/OptimiserPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { int, num } from "../lib/format";

export default function ParkingModule({ project, analysis, update, readOnly, projectId }) {
  const p = project.parking || {};
  const r = analysis?.parking;
  const set = (k, v) => update((x) => { x.parking[k] = v; });
  // Slots that belong to a specific building (stilt / podium) live on the tower, not on
  // the site, so they are edited through the tower record.
  const setTower = (id, k, v) => update((x) => {
    const t = (x.towers || []).find((y) => y.id === id);
    if (t) t.parking = { ...(t.parking || {}), [k]: v };
  });
  const setRamp = (k, v) => update((x) => { x.parking.ramp[k] = v; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Required slots" value={int(r?.required_slots)} testid="parking-required" />
        <Metric label="Provided slots" value={int(r?.provided_slots)} testid="parking-provided"
          tone={r && r.provided_slots >= r.required_slots ? "success" : "danger"} />
        <Metric label="Deficit" value={int(r?.deficit)} tone={r?.deficit ? "danger" : "success"} testid="parking-deficit" />
        <Metric label="Two-wheelers required" value={int(r?.scooters_required)} testid="parking-scooters" />
        <Metric label="Layout efficiency" value={num(r?.efficiency_pct, 1)} unit="%" testid="parking-efficiency" />
      </div>

      {r?.norm && (
        <div className={`text-[11px] border rounded-sm px-2 py-1.5 ${
          r.norm.verified ? "text-slate-600 bg-slate-50 border-slate-200"
                          : "text-amber-800 bg-amber-50 border-amber-200"}`}
          data-testid="parking-norm-banner">
          {!r.norm.verified && <AlertTriangle className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />}
          <span className="font-semibold">{r.norm.state}</span> · {r.norm.authority}
          {r.norm.note ? ` — ${r.norm.note}` : ""}
        </div>
      )}

      {(r?.warnings || []).map((w, i) => (
        <p key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5"
          data-testid={`parking-warning-${i}`}>{w.text}</p>
      ))}

      <Section
        title="Demand and supply by building"
        description="Sanction is granted per building, so a site-wide surplus does not cover a tower that is short. Demand comes from each tower's own unit mix; shared basement and surface slots are allocated to whichever buildings still need them."
        testid="parking-by-building"
      >
        {!(r?.towers || []).length ? (
          <p className="text-sm text-slate-500">Add a tower to see its parking demand.</p>
        ) : (
          <div className="space-y-3">
            {r.towers.map((t) => (
              <div key={t.id} className={`border rounded-sm ${t.deficit ? "border-red-300" : "border-slate-200"}`}
                data-testid={`parking-tower-${t.id}`}>
                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm ${
                  t.deficit ? "bg-red-50" : "bg-slate-50"}`}>
                  <span className="font-semibold tracking-tight">{t.name}</span>
                  <span className="text-slate-500 text-xs">{int(t.units)} units · {int(t.floors)} floors</span>
                  <span className="ml-auto text-xs">
                    needs <span className="font-mono font-semibold">{int(t.cars_required)}</span> ·
                    has <span className="font-mono font-semibold">{int(t.provided_slots)}</span>
                  </span>
                  {t.deficit ? (
                    <span className="text-xs font-semibold text-red-700" data-testid={`parking-tower-deficit-${t.id}`}>
                      short {int(t.deficit)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> compliant
                    </span>
                  )}
                </div>

                <div className="px-3 py-2 grid md:grid-cols-2 gap-3">
                  <div>
                    {t.residential_basement && (
                      <div className="mb-2 rounded-sm border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-900"
                        data-testid={`parking-residential-basement-${t.id}`}>
                        Project basement allocation: {int(t.residential_basement.car_spaces)} car · {int(t.residential_basement.bike_spaces)} bike
                        {t.residential_basement.optional_car_pool > 0 &&
                          ` · ${int(t.residential_basement.optional_car_pool)} optional car spaces for purchase`}
                        {t.residential_basement.flexible_space_use && " · flexible use; no dedicated bike bays"}
                        {` · ${num(t.residential_basement.area_sqm, 0)} m² per tower`}
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Unit type</TableHead>
                          <TableHead className="text-xs text-right">Carpet</TableHead>
                          <TableHead className="text-xs text-right">Nos</TableHead>
                          <TableHead className="text-xs text-right">Cars</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(t.breakdown || []).map((b, i) => (
                          <TableRow key={i} title={b.band}>
                            <TableCell className="py-1 text-xs uppercase">{b.type}</TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono">
                              {b.carpet_sqm != null ? `${num(b.carpet_sqm, 0)} m²` : "—"}
                            </TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono">{int(b.units)}</TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono">{num(b.cars, 1)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-[11px] text-slate-500 mt-1">Hover a row for the band that governs it.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 content-start">
                    <NumField label="Stilt slots" value={t.stilt_slots} disabled={readOnly}
                      onChange={(v) => setTower(t.id, "stilt_slots", v)}
                      testid={`parking-stilt-${t.id}`} />
                    <NumField label="Podium slots" value={t.podium_slots} disabled={readOnly}
                      onChange={(v) => setTower(t.id, "podium_slots", v)}
                      testid={`parking-podium-${t.id}`} />
                    <Metric label="From shared pool" value={int(t.shared_slots)}
                      testid={`parking-shared-${t.id}`} />
                    <Metric label="Two-wheelers" value={int(t.scooters_required)}
                      testid={`parking-tw-${t.id}`} />
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">
              Shared pool: {int(r.shared_pool)} slots ({int(r.basement_slots)} basement + {int(r.ground_slots)} surface),
              of which {int(r.shared_allocated)} are allocated. Building-owned: {int(r.own_slots_total)}.
            </p>
          </div>
        )}
      </Section>

      <Section title="Compliance checks" testid="parking-checks-section">
        <ul className="space-y-1">
          {(r?.checks || []).map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" data-testid={`parking-check-${i}`}>
              {c.pass ? <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      : <X className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
              <span className="flex-1">
                {c.label}
                <span className="text-slate-500"> — {c.value}</span>
                {c.detail && <span className="block text-[11px] text-slate-500">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Parking layout & capacity" testid="parking-layout-section">
          <div className="grid sm:grid-cols-2 gap-3">
            <NumField label="Basement levels" value={p.basement_levels} disabled={readOnly} onChange={(v) => set("basement_levels", v)} testid="parking-basement-levels-input" />
            <NumField label="Basement area / level" suffix="m²" value={p.basement_area_per_level} disabled={readOnly} onChange={(v) => set("basement_area_per_level", v)} testid="parking-basement-area-input" />
            <NumField label="Ground-level parking area" suffix="m²" value={p.ground_area} disabled={readOnly} onChange={(v) => set("ground_area", v)} testid="parking-ground-area-input" />
            <NumField label="Area per slot (incl. aisle)" suffix="m²" value={p.area_per_slot} disabled={readOnly} onChange={(v) => set("area_per_slot", v)} testid="parking-area-per-slot-input" />
            <NumField label="Required ratio" suffix="/unit" step={0.1} value={p.ratio_per_unit} disabled={readOnly} onChange={(v) => set("ratio_per_unit", v)} testid="parking-ratio-input" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Metric label="Basement slots" value={int(r?.basement_slots)} testid="parking-basement-slots" />
            <Metric label="Ground slots" value={int(r?.ground_slots)} testid="parking-ground-slots" />
          </div>
        </Section>

        <Section title="Allocation — visitor, EV, accessible" testid="parking-allocation-section">
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Visitor %" suffix="%" value={p.visitor_pct} disabled={readOnly} onChange={(v) => set("visitor_pct", v)} testid="parking-visitor-pct-input" />
            <NumField label="EV %" suffix="%" value={p.ev_pct} disabled={readOnly} onChange={(v) => set("ev_pct", v)} testid="parking-ev-pct-input" />
            <NumField label="Accessible %" suffix="%" value={p.accessible_pct} disabled={readOnly} onChange={(v) => set("accessible_pct", v)} testid="parking-accessible-pct-input" />
            <NumField label="Visitor provided" value={p.visitor_provided} disabled={readOnly} onChange={(v) => set("visitor_provided", v)} testid="parking-visitor-provided-input" />
            <NumField label="EV provided" value={p.ev_provided} disabled={readOnly} onChange={(v) => set("ev_provided", v)} testid="parking-ev-provided-input" />
            <NumField label="Accessible provided" value={p.accessible_provided} disabled={readOnly} onChange={(v) => set("accessible_provided", v)} testid="parking-accessible-provided-input" />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Metric label="Visitor required" value={int(r?.visitor_required)} testid="parking-visitor-required" />
            <Metric label="EV required" value={int(r?.ev_required)} testid="parking-ev-required" />
            <Metric label="Accessible required" value={int(r?.accessible_required)} testid="parking-accessible-required" />
          </div>
        </Section>
      </div>

      <Section title="Ramp planning & validation" testid="ramp-section">
        <div className="grid sm:grid-cols-3 gap-3">
          <NumField label="Slope" suffix="%" step={0.1} value={p.ramp?.slope_pct} disabled={readOnly} onChange={(v) => setRamp("slope_pct", v)} testid="ramp-slope-input" />
          <NumField label="Ramp width" suffix="m" step={0.1} value={p.ramp?.width} disabled={readOnly} onChange={(v) => setRamp("width", v)} testid="ramp-width-input" />
          <NumField label="Turning radius" suffix="m" step={0.1} value={p.ramp?.turning_radius} disabled={readOnly} onChange={(v) => setRamp("turning_radius", v)} testid="ramp-radius-input" />
        </div>
        <ul className="mt-4 space-y-2">
          {(r?.ramp_checks || []).map((c, i) => (
            <li key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-sm border ${
              c.pass ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
            }`} data-testid={`ramp-check-${i}`}>
              {c.pass ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              <span className="flex-1">{c.label}</span>
              <span className="font-mono text-xs">{c.value}</span>
            </li>
          ))}
        </ul>
      </Section>
      <OptimiserPanel projectId={projectId} only="parking" readOnly={readOnly} />

    </div>
  );
}
