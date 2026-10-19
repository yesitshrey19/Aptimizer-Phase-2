import { useEffect, useState } from "react";
import { Metric, NumField, Section } from "../components/Field";
import OptimiserPanel from "../components/OptimiserPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { int, num } from "../lib/format";
import { api } from "../lib/api";
import { ShieldCheck, Zap, Droplets, Waves, Activity } from "lucide-react";

export default function UtilitiesModule({ project, analysis, update, readOnly, projectId }) {
  const u = analysis?.utilities;
  const cfg = project.utility_config || {};
  const set = (k, v) => update((p) => { p.utility_config[k] = v; });

  const [networkPlan, setNetworkPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoadingPlan(true);
    api.get(`/projects/${projectId}/utility-network-plan`)
      .then(({ data }) => setNetworkPlan(data))
      .catch(() => {})
      .finally(() => setLoadingPlan(false));
  }, [projectId]);

  const netSum = networkPlan?.summary;
  const networks = networkPlan?.networks || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Population" value={int(u?.persons)} testid="util-persons" />
        <Metric label="Water demand" value={num(u?.water_demand_lpd, 0)} unit="L/day" testid="util-demand" />
        <Metric label="Domestic" value={num(u?.domestic_lpd, 0)} unit="L/day" testid="util-domestic" />
        <Metric label="Flushing" value={num(u?.flushing_lpd, 0)} unit="L/day" testid="util-flushing" />
      </div>

      <Section title="Design standards" description="Per-capita and site assumptions" testid="utility-config-section">
        <div className="grid sm:grid-cols-4 gap-3">
          <NumField label="Water supply" suffix="lpcd" value={cfg.lpcd} disabled={readOnly} onChange={(v) => set("lpcd", v)} testid="util-lpcd-input" />
          <NumField label="UG tank storage" suffix="days" step={0.1} value={cfg.ug_tank_days} disabled={readOnly} onChange={(v) => set("ug_tank_days", v)} testid="util-ug-days-input" />
          <NumField label="OH tank storage" suffix="hours" value={cfg.oh_tank_hours} disabled={readOnly} onChange={(v) => set("oh_tank_hours", v)} testid="util-oh-hours-input" />
          <NumField label="Sewage generation" suffix="factor" step={0.05} value={cfg.sewage_factor} disabled={readOnly} onChange={(v) => set("sewage_factor", v)} testid="util-sewage-input" />
          <NumField label="WTP capacity" suffix="factor" step={0.05} value={cfg.wtp_factor} disabled={readOnly} onChange={(v) => set("wtp_factor", v)} testid="util-wtp-input" />
          <NumField label="Annual rainfall" suffix="mm" value={cfg.annual_rainfall_mm} disabled={readOnly} onChange={(v) => set("annual_rainfall_mm", v)} testid="util-rainfall-input" />
          <NumField label="Runoff coefficient" step={0.05} value={cfg.runoff_coefficient} disabled={readOnly} onChange={(v) => set("runoff_coefficient", v)} testid="util-runoff-input" />
          <NumField label="Connected load" suffix="kW/unit" step={0.5} value={cfg.kw_per_unit} disabled={readOnly} onChange={(v) => set("kw_per_unit", v)} testid="util-kw-input" />
        </div>
      </Section>

      <Section title="Sizing output" testid="utility-output-section">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Underground tank" value={num(u?.ug_tank_cum, 2)} unit="m³" testid="util-ug-tank" />
          <Metric label="Overhead tank" value={num(u?.oh_tank_cum, 2)} unit="m³" testid="util-oh-tank" />
          <Metric label="STP capacity" value={num(u?.stp_capacity_kld, 2)} unit="KLD" testid="util-stp" />
          <Metric label="WTP capacity" value={num(u?.wtp_capacity_kld, 2)} unit="KLD" testid="util-wtp" />
          <Metric label="Rainwater harvest" value={num(u?.rwh_annual_litres, 0)} unit="L/yr" testid="util-rwh" />
          <Metric label="RWH storage tank" value={num(u?.rwh_storage_cum, 2)} unit="m³" testid="util-rwh-storage" />
          <Metric label="Electrical room" value={num(u?.electrical_room_sqm, 1)} unit="m²" testid="util-electrical-room" />
          <Metric label="Pump room" value={num(u?.pump_room_sqm, 1)} unit="m²" testid="util-pump-room" />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Connected load {num(u?.connected_load_kw, 1)} kW. Electrical and pump rooms are sized from connected load and
          unit count; place them adjacent to the road-access edge defined in Plot & Site.
        </p>
      </Section>

      {/* UTILITY NETWORK PLANNING (IS 1742 / CPHEEO / NBC Part 8 & 9) */}
      <Section
        title="Utility Network Planning & Site Infrastructure"
        description="Gravity sewerage gradients, stormwater box culverts, water distribution ring mains, and substation sizing"
        testid="utility-network-planning-section"
      >
        {netSum && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-sm">
              <div className="text-[11px] font-medium text-blue-900 flex items-center gap-1">
                <Waves className="h-3.5 w-3.5 text-blue-600" /> Sewer Trunk (IS 1742)
              </div>
              <div className="font-mono text-sm font-bold text-blue-950 mt-1">
                Ø{netSum.sewer_pipe_dia_mm} mm
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">
                Peak: {num(netSum.peak_sewage_lps, 1)} L/s · {netSum.manhole_count} manholes
              </div>
            </div>

            <div className="p-3 bg-cyan-50/60 border border-cyan-200 rounded-sm">
              <div className="text-[11px] font-medium text-cyan-900 flex items-center gap-1">
                <Droplets className="h-3.5 w-3.5 text-cyan-600" /> Stormwater Culvert
              </div>
              <div className="font-mono text-sm font-bold text-cyan-950 mt-1">
                {netSum.storm_drain_size_mm} mm
              </div>
              <div className="text-[10px] text-cyan-700 mt-0.5">
                Peak: {num(netSum.peak_storm_runoff_lps, 1)} L/s (Q = C·I·A / 360)
              </div>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-sm">
              <div className="text-[11px] font-medium text-emerald-900 flex items-center gap-1">
                <Activity className="h-3.5 w-3.5 text-emerald-600" /> Water Ring Main & Fire
              </div>
              <div className="font-mono text-sm font-bold text-emerald-950 mt-1">
                Ø{netSum.water_ring_dia_mm} mm
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">
                Booster Head: {num(netSum.booster_pump_head_m, 1)} m TDH
              </div>
            </div>

            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-sm">
              <div className="text-[11px] font-medium text-amber-900 flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-600" /> Substation & DG Backup
              </div>
              <div className="font-mono text-sm font-bold text-amber-950 mt-1">
                {netSum.transformer_kva} kVA
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">
                DG Backup: {netSum.dg_backup_kva} kVA · {num(netSum.connected_load_kw, 0)} kW load (NBC Part 8)
              </div>
            </div>
          </div>
        )}

        {networks.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System</TableHead>
                <TableHead>Network Element</TableHead>
                <TableHead>Engineered Specification</TableHead>
                <TableHead>Capacity / Rating</TableHead>
                <TableHead>Governing Standard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {networks.map((net, i) => (
                <TableRow key={i} data-testid={`network-spec-row-${i}`}>
                  <TableCell className="font-medium text-xs text-slate-800">{net.system}</TableCell>
                  <TableCell className="text-xs text-slate-600">{net.element}</TableCell>
                  <TableCell className="text-xs font-mono font-medium text-blue-900">{net.specification}</TableCell>
                  <TableCell className="text-xs font-mono">{net.capacity || "—"}</TableCell>
                  <TableCell className="text-xs">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      {net.governing_code}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <OptimiserPanel projectId={projectId} only="utilities" readOnly={readOnly} />
    </div>
  );
}

