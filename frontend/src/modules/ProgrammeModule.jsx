import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Undo2,
  Users,
  Wallet,
  X,
  Truck,
  Wrench,
  Fuel,
  HardHat,
} from "lucide-react";
import { api, apiError } from "../lib/api";
import { Metric, NumField, Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AiPanel } from "../components/AiPanel";
import TaskRow from "../components/TaskRow";
import { int, money, num } from "../lib/format";

const PHASE_COLOR = {
  "Pre-construction": "#94A3B8",
  Substructure: "#78716C",
  Superstructure: "#2563EB",
  Blockwork: "#0EA5E9",
  MEP: "#8B5CF6",
  Finishing: "#F59E0B",
  "External works": "#16A34A",
  Handover: "#DC2626",
};
const PHASES = Object.keys(PHASE_COLOR);

const day = (s) => (s ? new Date(`${s}T00:00:00`) : null);
const fmt = (s) => (s ? day(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const trade = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const plural = (n, w) => `${int(n)} ${w}${Math.abs(n) === 1 ? "" : "s"}`;

// How the metric strip and the banner read for each solver outcome. `unreachable` is the
// one that matters: the programme floor is IS 456 curing and prop removal, so a target
// below it is refused rather than met by compressing something that must not be.
const TARGET_TONE = {
  already_met: "success",
  met_with_more_labour: "success",
  unreachable: "danger",
  invalid: "danger",
};

function TargetBanner({ target, cost }) {
  if (!target) return null;
  const bad = TARGET_TONE[target.status] === "danger";
  const Icon = bad ? CalendarX : CalendarCheck;
  const changes = Object.entries(target.crew_changes || {});
  return (
    <div
      className={`text-[11px] rounded-sm border px-2 py-1.5 flex gap-2 ${
        bad ? "text-red-800 bg-red-50 border-red-200" : "text-emerald-900 bg-emerald-50 border-emerald-200"
      }`}
      data-testid="prog-target-result"
    >
      <Icon className={`h-4 w-4 shrink-0 mt-px ${bad ? "text-red-500" : "text-emerald-600"}`} />
      <div className="space-y-1">
        {target.status === "already_met" && (
          <p>
            The programme already finishes{" "}
            <span className="font-semibold">{plural(target.days_early, "day")}</span> inside your{" "}
            {fmt(target.requested_finish)} finish date, so the crews were left exactly as entered.
          </p>
        )}
        {target.status === "met_with_more_labour" && (
          <p>
            Planned to finish <span className="font-semibold">{fmt(target.achieved_finish)}</span> —{" "}
            {plural(target.days_early, "day")} inside your finish date and{" "}
            {plural(target.days_saved, "day")} earlier than the {fmt(target.baseline_finish)} the
            entered crews would give.
          </p>
        )}
        {target.status === "unreachable" && (
          <p>
            <span className="font-semibold">{fmt(target.requested_finish)} cannot be reached safely.</span>{" "}
            The earliest completion is {fmt(target.earliest_possible_finish)},{" "}
            {plural(target.days_short, "day")} later, even at the labour ceiling. {target.note}
          </p>
        )}
        {target.status === "invalid" && <p>{target.note}</p>}
        {cost && cost.delta !== 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
            data-testid="prog-target-cost">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>
              Finishing{" "}
              <span className="font-semibold">
                {plural(Math.abs(cost.days), "day")} {cost.days > 0 ? "earlier" : "later"}
              </span>{" "}
              {cost.delta > 0 ? "adds" : "saves"}{" "}
              <span className="font-semibold">{money(Math.abs(cost.delta), "INR")}</span>
              {cost.delta > 0 && (
                <>
                  {": "}
                  {money(cost.premium, "INR")} overtime premium,{" "}
                  {money(cost.lost, "INR")} lost output per head from crowding the same
                  work front
                  {cost.prelim > 0 && <>, {money(cost.prelim, "INR")} more site running cost</>}
                </>
              )}
              .
            </span>
          </p>
        )}
        {changes.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-emerald-800">
            <Users className="h-3.5 w-3.5 shrink-0" />
            {changes.map(([k, c]) => (
              <span key={k} className="font-mono">
                {trade(k)} {c.from}→{c.to}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

const BLANK_TASK = { name: "", phase: "Finishing", days: 5, after: "" };

/** Compact form for work the quantities cannot know about -- approvals, a vendor scope. */
function AddTaskRow({ byPhase, onAdd, disabled }) {
  const [draft, setDraft] = useState(BLANK_TASK);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const ready = draft.name.trim().length > 0;

  // Default to following the last task in the chosen phase. Left blank the new task hangs
  // off the project-start milestone, so its earliest start is day zero and it lands among
  // the other day-zero tasks rather than at the end of the phase where the user expects
  // it. "Project start" stays available, just no longer the silent default.
  const phaseRows = byPhase[draft.phase] || [];
  const lastInPhase = phaseRows.length ? phaseRows[phaseRows.length - 1] : null;
  const after = draft.after === null ? "" : (draft.after || lastInPhase?.id || "");

  return (
    <div className="border-t border-slate-200 pt-3 mt-3 space-y-2" data-testid="prog-add-task">
      <p className="text-[11px] text-slate-500">
        Add work the quantities cannot know about — a client approval, a compound wall, lift
        erection by a vendor. It joins the critical path like any other task.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-[2fr_1fr_0.7fr_2fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Task name</label>
          <Input className="h-9 rounded-sm text-sm" value={draft.name} disabled={disabled}
            placeholder="Lift erection by vendor" data-testid="prog-task-name"
            onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Phase</label>
          <select className="h-9 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
            value={draft.phase} disabled={disabled} data-testid="prog-task-phase"
            onChange={(e) => set("phase", e.target.value)}>
            {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Days</label>
          <Input type="number" min={1} className="h-9 rounded-sm font-mono text-sm"
            value={draft.days} disabled={disabled} data-testid="prog-task-days"
            onChange={(e) => set("days", Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Starts after</label>
          {/* Grouped by phase: a flat list of every task on a tower job is hundreds of
              options long and impossible to pick from. */}
          <select className="h-9 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
            value={after} disabled={disabled} data-testid="prog-task-after"
            onChange={(e) => set("after", e.target.value === "" ? null : e.target.value)}>
            <option value="">Project start</option>
            {Object.entries(byPhase).map(([phase, rows]) => (
              <optgroup key={phase} label={phase}>
                {rows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <Button className="rounded-sm h-9" disabled={disabled || !ready} data-testid="prog-task-add"
          onClick={() => {
            // Land it at the end of its phase, which is where the form implies it goes.
            onAdd({ ...draft, name: draft.name.trim(), after,
                    order: phaseRows.length });
            setDraft(BLANK_TASK);
          }}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
    </div>
  );
}

export default function ProgrammeModule({ project, projectId, readOnly, setProject, update }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});          // phase name -> task rows expanded
  const [equipmentPlan, setEquipmentPlan] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/equipment-plan`)
      .then(({ data }) => setEquipmentPlan(data))
      .catch(() => {});
  }, [projectId]);
  // Seeded from whatever was saved with the project, so a reload reopens the programme the
  // user left rather than the generated one underneath it.
  const [cfg, setCfg] = useState(() => ({
    // Defaults FIRST, saved config on top. The other way round -- which is what this was --
    // meant every remount overwrote the saved tasks and edits with empty defaults, so
    // switching tabs silently threw away everything the user had just entered.
    start_date: new Date().toISOString().slice(0, 10),
    target_finish: "",
    mobilisation_days: 10,
    blockwork_lag_floors: 2,
    crews: {},
    extra_tasks: [],
    excluded_tasks: [],
    task_overrides: {},
    ...(project?.schedule || {}),
  }));

  // Undo stack. Autosave means there is no Save button to hesitate over, so there has to
  // be a way back -- seven steps, which covers a wrong drag or a mistyped date without
  // turning into a document history.
  const UNDO_LIMIT = 7;
  const [undoStack, setUndoStack] = useState([]);

  // `next` lets an edit re-plan with the config it just produced rather than waiting a
  // render for setCfg to land.
  const run = useCallback(async (next) => {
    const body = next || cfg;
    setBusy(true);
    setErr("");
    try {
      const { data } = await api.post(`/projects/${projectId}/schedule`, { config: body });
      if (data.ok) setPlan(data);
      else { setPlan(null); setErr(data.error?.message || "Could not build a programme."); }
    } catch (e) {
      setPlan(null);
      setErr(apiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  }, [projectId, cfg]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [projectId]);

  // The saved config is the source of truth. Re-seeding on it means returning to this tab
  // shows what the user left, not a fresh default.
  useEffect(() => {
    const saved = project?.schedule;
    if (saved && Object.keys(saved).length) {
      setCfg((c) => ({
        ...c, ...saved,
        // Lists must never come back undefined: a project saved before one of these
        // existed would otherwise crash the first edit that touched it.
        extra_tasks: saved.extra_tasks ?? c.extra_tasks ?? [],
        excluded_tasks: saved.excluded_tasks ?? c.excluded_tasks ?? [],
        task_overrides: saved.task_overrides ?? c.task_overrides ?? {},
        crews: saved.crews ?? c.crews ?? {},
      }));
    }
    // eslint-disable-next-line
  }, [projectId]);

  // Everything the user changes goes to the project immediately. The module unmounts when
  // the user switches tabs, so anything held only in local state is gone the moment they
  // navigate away -- which is what used to happen to the finish date, the task names and
  // every per-task edit.
  const persist = (next) => {
    if (!readOnly) update?.((p) => { p.schedule = next; });
  };

  const apply = (next, { track = true } = {}) => {
    if (track) {
      setUndoStack((st) => [...st, cfg].slice(-UNDO_LIMIT));
    }
    setCfg(next);
    persist(next);
    run(next);
  };

  // Side effects stay out of the updater -- React may run an updater twice, and calling
  // another component's setState from inside one drops writes.
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((st) => st.slice(0, -1));
    setCfg(prev);
    persist(prev);
    run(prev);
  };

  // Config fields (dates, site setup, crew) used to call setCfg only, so they were saved
  // by nothing at all. They persist now; the re-plan still waits for the Re-plan button
  // so typing a date does not fire a request per keystroke.
  const set = (k, v) => {
    const next = { ...cfg, [k]: v };
    setUndoStack((st) => [...st, cfg].slice(-UNDO_LIMIT));
    setCfg(next);
    persist(next);
  };

  // One override object per task. Merging rather than replacing means editing the crew
  // does not silently discard a pinned date the user set earlier.
  const editTask = (id, patch) => {
    const cur = cfg.task_overrides || {};
    const merged = { ...(cur[id] || {}), ...patch };
    // A null from a cleared date input means "unpin", so the generated date comes back.
    Object.keys(patch).forEach((k) => { if (patch[k] === null) delete merged[k]; });
    const next = { ...cur, [id]: merged };
    if (Object.keys(merged).length === 0) delete next[id];
    apply({ ...cfg, task_overrides: next });
  };

  const resetTask = (id) => {
    const next = { ...(cfg.task_overrides || {}) };
    delete next[id];
    apply({ ...cfg, task_overrides: next });
  };

  const resetPhase = (phase) => {
    const ids = new Set((byPhase[phase] || []).map((t) => t.id));
    const next = Object.fromEntries(
      Object.entries(cfg.task_overrides || {}).filter(([k]) => !ids.has(k)));
    apply({ ...cfg, task_overrides: next });
  };

  const resetAll = () => apply({ ...cfg, task_overrides: {} });

  // Dragging writes an `order` to every task in the phase. It is DISPLAY order only --
  // dependencies decide when work happens, so nothing about the dates moves.
  const [drag, setDrag] = useState(null);
  const dropOn = (phase, targetId) => {
    if (!drag || drag.phase !== phase || drag.id === targetId) return setDrag(null);
    const rows = [...(byPhase[phase] || [])];
    const from = rows.findIndex((r) => r.id === drag.id);
    const to = rows.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return setDrag(null);
    rows.splice(to, 0, rows.splice(from, 1)[0]);
    const next = { ...(cfg.task_overrides || {}) };
    rows.forEach((r, i) => { next[r.id] = { ...(next[r.id] || {}), order: i }; });
    setDrag(null);
    apply({ ...cfg, task_overrides: next });
  };

  const addTask = (t) =>
    apply({ ...cfg, extra_tasks: [...(cfg.extra_tasks || []), t] });
  const removeTask = (id) =>
    apply(id.startsWith("custom_")
      ? { ...cfg, extra_tasks: (cfg.extra_tasks || []).filter((_, i) => `custom_${i}` !== id) }
      : { ...cfg, excluded_tasks: [...(cfg.excluded_tasks || []), id] });
  const restoreAll = () => apply({ ...cfg, excluded_tasks: [] });

  // One shared time axis so every phase bar is comparable.
  const axis = useMemo(() => {
    if (!plan?.phases?.length) return null;
    const t0 = day(plan.start).getTime();
    const t1 = day(plan.finish).getTime();
    const span = Math.max(t1 - t0, 1);
    return { t0, span, pct: (s) => ((day(s).getTime() - t0) / span) * 100 };
  }, [plan]);

  // The baseline programme -- no target date, no crew multipliers -- is what the cost
  // delta is measured against. Fetched once per project rather than on every re-plan.
  const [baseline, setBaseline] = useState(null);
  useEffect(() => {
    if (!projectId) return;
    api.post(`/projects/${projectId}/schedule`, { config: { start_date: cfg.start_date } })
      .then(({ data }) => setBaseline(data.ok ? data : null))
      .catch(() => setBaseline(null));
    // eslint-disable-next-line
  }, [projectId, cfg.start_date]);

  const costDelta = (() => {
    const t = plan?.time_cost;
    const b = baseline?.time_cost;
    if (!t || !b || !plan?.target) return null;
    const days = Math.round(
      (new Date(`${baseline.finish}T00:00:00`) - new Date(`${plan.finish}T00:00:00`))
      / 86400000);
    return {
      delta: Math.round(t.total_cost - b.total_cost),
      premium: Math.round(t.acceleration_premium - b.acceleration_premium),
      lost: Math.round(t.lost_productivity - b.lost_productivity),
      prelim: Math.round(t.preliminaries_total - b.preliminaries_total),
      days,
    };
  })();

  const editCount = Object.keys(cfg.task_overrides || {}).length;
  // Tasks grouped under the phase they belong to, and an id -> name map so a dependency
  // reads as "Tower A: floor 3 slab" rather than "t0_slabcast_3".
  const { byPhase, nameOf } = useMemo(() => {
    const tasks = plan?.activities || [];
    const g = {};
    const n = {};
    for (const t of tasks) {
      n[t.id] = t.name;
      (g[t.phase] = g[t.phase] || []).push(t);
    }
    // Display order: an explicit `order` first, then start date. Without the explicit
    // order, tasks sharing a start date fall wherever the sort leaves them -- which is why
    // a task added at the top of Pre-construction used to appear third.
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => {
        const ao = a.order ?? null;
        const bo = b.order ?? null;
        if (ao !== null && bo !== null && ao !== bo) return ao - bo;
        if (ao !== null && bo === null) return -1;
        if (ao === null && bo !== null) return 1;
        return (a.start || "").localeCompare(b.start || "");
      });
    }
    return { byPhase: g, nameOf: n };
  }, [plan?.activities]);

  return (
    <div className="space-y-4">
      {/* Start sits beside completion so the strip reads as a span, not just an end date.
          Dates are long, so this goes six across only once there is room for it. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Metric label="Build duration" value={num(plan?.duration_months, 1)} unit="months"
          testid="prog-duration" />
        <Metric label="Calendar days" value={int(plan?.duration_calendar_days)} testid="prog-days" />
        <Metric label="Start" value={plan ? fmt(plan.start) : "—"} testid="prog-start" />
        <Metric label="Completion" value={plan ? fmt(plan.finish) : "—"} testid="prog-finish"
          tone={TARGET_TONE[plan?.target?.status]} />
        <Metric label="Floor cycle" value={int(plan?.safety?.floor_cycle_days)} unit="days"
          testid="prog-cycle" />
        <Metric label="Phases" value={int(plan?.phases?.length)} testid="prog-phases" />
      </div>

      <p className="text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">Floor cycle</span> is how many days it takes
        to complete one typical floor — pouring columns, laying the slab, and waiting for the
        concrete to set — so a 20-storey tower takes roughly 20 × that many days to reach the top.
        Open any phase in the breakdown below to see every task it includes.
      </p>

      {err && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5"
          data-testid="prog-error">{err}</p>
      )}

      <TargetBanner target={plan?.target} cost={costDelta} />

      {plan?.budget && (
        <div className="text-[11px] rounded-sm border border-slate-200 bg-slate-50 px-3 py-2"
          data-testid="prog-budget">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              <span className="text-slate-500">Project cost </span>
              <span className="font-mono font-semibold text-slate-900">
                {money(plan.budget.project_total, "INR")}
              </span>
            </span>
            <span className="text-slate-500">
              BOQ {money(plan.budget.boq_total, "INR")}
              {plan.budget.added_tasks > 0 && <> + added work {money(plan.budget.added_tasks, "INR")}</>}
              {plan.budget.acceleration_premium > 0 && <> + overtime {money(plan.budget.acceleration_premium, "INR")}</>}
              {plan.budget.lost_productivity > 0 && <> + lost output {money(plan.budget.lost_productivity, "INR")}</>}
              {plan.budget.preliminaries > 0 && <> + site running {money(plan.budget.preliminaries, "INR")}</>}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{plan.budget.note}</p>
        </div>
      )}

      {plan?.safety && (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 flex gap-2"
          data-testid="prog-safety">
          <ShieldAlert className="h-4 w-4 shrink-0 text-slate-500 mt-px" />
          <span>
            Each floor needs at least{" "}
            <span className="font-semibold">{plan.safety.prop_removal_days} calendar days</span> for
            the concrete to gain enough strength before the supports can be removed ({plan.safety.governing_rule}).
            Adding more workers shortens other tasks, but never this waiting period.
          </span>
        </p>
      )}

      {(plan?.safety?.findings || []).map((f, i) => (
        <p key={i} className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5"
          data-testid={`prog-safety-finding-${i}`}>{f.text}</p>
      ))}

      {(plan?.warnings || []).filter((w) => w.severity === "critical").map((w, i) => (
        <p key={i} className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5"
          data-testid={`prog-warning-${i}`}>{w.text}</p>
      ))}

      <Section
        title="Programme assumptions"
        description="Work days = quantity ÷ (daily output × crew). Set a finish date to size the crews for it."
        testid="prog-config"
        actions={
          <Button onClick={() => run()} disabled={busy || readOnly} className="rounded-sm h-8" data-testid="prog-run">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Planning…" : "Re-plan"}
          </Button>
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Start date</label>
            <Input type="date" className="h-9 rounded-sm" value={cfg.start_date} disabled={readOnly}
              onChange={(e) => set("start_date", e.target.value)} data-testid="prog-start-input" />
            <p className="text-[10px] leading-snug text-slate-500">
              When work can begin on site.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Finish date</label>
            <Input type="date" className="h-9 rounded-sm" value={cfg.target_finish} disabled={readOnly}
              min={cfg.start_date} onChange={(e) => set("target_finish", e.target.value)}
              data-testid="prog-target-input" />
            <p className="text-[10px] leading-snug text-slate-500">
              Optional. Crews are sized to hit it.
            </p>
          </div>
          <NumField label="Site setup (days)" value={cfg.mobilisation_days} disabled={readOnly}
            onChange={(v) => set("mobilisation_days", v)} testid="prog-mobilisation-input"
            hint="Site setup before building starts: offices, fencing, water, power." />
          <NumField label="Masonry starts after (floors)" value={cfg.blockwork_lag_floors} disabled={readOnly}
            onChange={(v) => set("blockwork_lag_floors", v)} testid="prog-blocklag-input"
            hint="Floors the frame stays ahead of wall work. Higher is safer, slower." />
          <NumField label="Concrete crew size" value={cfg.crews.concretor || 6} disabled={readOnly}
            onChange={(v) => setCfg((c) => ({ ...c, crews: { ...c.crews, concretor: v } }))}
            testid="prog-crew-concretor"
            hint="Concrete teams working at once. More is faster, up to the curing limit." />
        </div>
      </Section>

      <Section title="Phase timeline" description="Each bar spans a phase from first start to last finish."
        testid="prog-timeline">
        {!plan?.phases?.length ? (
          <p className="text-sm text-slate-500">Run the programme to see the timeline.</p>
        ) : (
          <div className="space-y-1.5">
            {plan.phases.map((ph) => {
              const left = axis.pct(ph.start);
              const width = Math.max(axis.pct(ph.finish) - left, 0.6);
              return (
                <div key={ph.phase} className="grid grid-cols-[150px_1fr_86px] items-center gap-2"
                  data-testid={`prog-phase-${ph.phase.replace(/\s+/g, "-").toLowerCase()}`}>
                  <span className="text-xs text-slate-700 truncate" title={ph.phase}>{ph.phase}</span>
                  <div className="relative h-5 bg-slate-100 rounded-sm">
                    <div
                      className="absolute h-5 rounded-sm"
                      style={{ left: `${left}%`, width: `${width}%`,
                               background: PHASE_COLOR[ph.phase] || "#64748B" }}
                      title={`${fmt(ph.start)} → ${fmt(ph.finish)}`}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 text-right">{int(ph.calendar_days)}d</span>
                </div>
              );
            })}
            <div className="grid grid-cols-[150px_1fr_86px] gap-2 pt-1">
              <span />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{fmt(plan.start)}</span><span>{fmt(plan.finish)}</span>
              </div>
              <span />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Phase breakdown"
        description="Open a phase to see its tasks. Phase days are calendar days; task days are working days. A red dot marks the critical path."
        testid="prog-phase-table"
        actions={
          <div className="flex items-center gap-2">
            {undoStack.length > 0 && (
              <Button variant="outline" className="rounded-sm h-8" onClick={undo}
                disabled={busy || readOnly} data-testid="prog-undo"
                title={`Undo the last change (${undoStack.length} available)`}>
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Undo ({undoStack.length})
              </Button>
            )}
            {editCount > 0 && (
              <>
                <span className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-sm px-1.5 py-0.5"
                  data-testid="prog-edit-count">
                  {plural(editCount, "edit")}
                </span>
                <Button variant="outline" className="rounded-sm h-8" onClick={resetAll}
                  disabled={busy || readOnly} data-testid="prog-reset-all">
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset all edits
                </Button>
              </>
            )}
            {(cfg.excluded_tasks || []).length > 0 && (
              <Button variant="outline" className="rounded-sm h-8" onClick={restoreAll}
                disabled={busy || readOnly} data-testid="prog-restore-tasks">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Restore {plural((cfg.excluded_tasks || []).length, "removed task")}
              </Button>
            )}
          </div>
        }
      >
        {!plan?.phases?.length ? (
          <p className="text-sm text-slate-500">—</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase / task</TableHead>
                  <TableHead>Waits for</TableHead>
                  <TableHead className="text-right">Start</TableHead>
                  <TableHead className="text-right">Finish</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Crew</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.phases.map((ph) => {
                  const rows = byPhase[ph.phase] || [];
                  const isOpen = !!open[ph.phase];
                  const Chevron = isOpen ? ChevronDown : ChevronRight;
                  return [
                    <TableRow key={ph.phase} className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setOpen((o) => ({ ...o, [ph.phase]: !o[ph.phase] }))}
                      data-testid={`prog-phase-row-${ph.phase.replace(/\s+/g, "-").toLowerCase()}`}>
                      <TableCell className="py-1.5 text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          <Chevron className="h-3.5 w-3.5 text-slate-400" />
                          <span className="h-2 w-2 rounded-sm shrink-0"
                            style={{ background: PHASE_COLOR[ph.phase] || "#64748B" }} />
                          {ph.phase}
                          {/* Counted off the rows this actually reveals -- ph.activities
                              leaves milestones out, and a header that says 3 opening to
                              4 lines reads as a bug. */}
                          <span className="text-slate-400 font-normal">
                            ({plural(rows.length || ph.activities, "task")})
                          </span>
                        </span>
                      </TableCell>
                      <TableCell />
                      <TableCell className="py-1.5 text-xs text-right font-mono">{fmt(ph.start)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-right font-mono">{fmt(ph.finish)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-right font-mono"
                        title="Calendar days from this phase's first start to its last finish">
                        {int(ph.calendar_days)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="py-1.5 text-xs text-right font-mono">{money(ph.cost, "INR")}</TableCell>
                      <TableCell />
                    </TableRow>,
                    ...(isOpen ? rows.map((t) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        nameOf={nameOf}
                        readOnly={readOnly}
                        busy={busy}
                        onEdit={editTask}
                        onResetRow={resetTask}
                        onRemove={removeTask}
                        dragging={drag?.id === t.id}
                        onDragStart={() => setDrag({ id: t.id, phase: ph.phase })}
                        onDragOver={(ev) => { if (drag?.phase === ph.phase) ev.preventDefault(); }}
                        onDrop={() => dropOn(ph.phase, t.id)}
                      />
                    )) : []),
                  ];
                })}
              </TableBody>
            </Table>
            <div className="mt-3 space-y-1 text-[10px] text-slate-500 leading-snug">
              <p>
                <span className="font-semibold text-slate-700">Every cell is editable.</span>{" "}
                Click a name to rename it. Type over days, crew or cost. Set a date to pin it.
                Edited cells show a blue edge; the reset arrow restores the original.
              </p>
              <p>
                <span className="font-semibold text-slate-700">If edits disagree:</span>{" "}
                pinned date &gt; days &gt; crew &gt; generated. Change crew alone and days
                recalculate.
              </p>
              <p>
                Dragging changes the display order only — dates follow the dependencies.
              </p>
              <p>
                A date earlier than the work allows is refused; the row names the blocker.
                Curing and prop-removal times are fixed by IS 456.
              </p>
              <p>
                An edited cost changes the phase and project totals, not the BOQ.
              </p>
            </div>
            {!readOnly && <AddTaskRow byPhase={byPhase} onAdd={addTask} disabled={busy} />}
            {plan.floats_verified === false && (
              <p className="text-[10px] text-slate-400 mt-2">
                Spare time per task is an upper bound at this size. Dates and the critical
                path are exact.
              </p>
            )}
          </>
        )}
      </Section>

      {plan?.cost_check && (
        <p className="text-[11px] text-slate-500" data-testid="prog-cost-check">
          Programme prices {money(plan.cost_check.scheduled_cost, "INR")} of the{" "}
          {money(plan.cost_check.boq_grand_total, "INR")} BOQ total. {plan.cost_check.note}
        </p>
      )}

      {/* CONSTRUCTION EQUIPMENT PLANNING & LOGISTICS (IS 4573 / IS 4925 / IS 5121) */}
      <Section
        title="Construction Equipment Planning & Logistics (IS 4573 / IS 4925 / IS 5121)"
        description="Heavy plant sizing, tower cranes, vertical hoists, concrete batching, and monthly mobilization schedule"
        testid="equipment-planning-section"
      >
        {equipmentPlan?.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-sm">
              <div className="text-[11px] font-medium text-amber-900 flex items-center gap-1">
                <HardHat className="h-3.5 w-3.5 text-amber-600" /> Tower Cranes (IS 4573)
              </div>
              <div className="font-mono text-sm font-bold text-amber-950 mt-1">
                {equipmentPlan.summary.tower_cranes} Unit(s)
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">
                {equipmentPlan.summary.num_towers} tower(s) · {num(equipmentPlan.summary.building_height_m, 0)} m height
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-sm">
              <div className="text-[11px] font-medium text-blue-900 flex items-center gap-1">
                <Truck className="h-3.5 w-3.5 text-blue-600" /> Concrete Logistics (IS 4925)
              </div>
              <div className="font-mono text-sm font-bold text-blue-950 mt-1">
                {equipmentPlan.summary.batching_plant_capacity_cum_hr} m³/h Plant
              </div>
              <div className="text-[10px] text-blue-700 mt-0.5">
                {equipmentPlan.summary.transit_mixers} Mixers · {num(equipmentPlan.summary.peak_monthly_pour_cum, 0)} m³ peak pour/mo
              </div>
            </div>

            <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-sm">
              <div className="text-[11px] font-medium text-indigo-900 flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5 text-indigo-600" /> Vertical Hoists (IS 5121)
              </div>
              <div className="font-mono text-sm font-bold text-indigo-950 mt-1">
                {equipmentPlan.summary.passenger_hoists} Twin-Cage
              </div>
              <div className="text-[10px] text-indigo-700 mt-0.5">
                {num(equipmentPlan.summary.duration_months, 1)} month programme
              </div>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-sm">
              <div className="text-[11px] font-medium text-emerald-900 flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5 text-emerald-600" /> Power & Diesel
              </div>
              <div className="font-mono text-sm font-bold text-emerald-950 mt-1">
                {num(equipmentPlan.summary.total_power_demand_kw, 0)} kW Connected
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">
                DG backup: {num(equipmentPlan.summary.dg_backup_kva, 0)} kVA · ~{num(equipmentPlan.summary.est_monthly_diesel_litres, 0)} L/month
              </div>
            </div>
          </div>
        )}

        {equipmentPlan?.fleet?.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plant / Machine</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Sizing Specification</TableHead>
                <TableHead>Code Reference</TableHead>
                <TableHead>Mobilization Window</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipmentPlan.fleet.map((item, i) => (
                <TableRow key={i} data-testid={`fleet-row-${i}`}>
                  <TableCell className="font-medium text-xs text-slate-800">{item.name}</TableCell>
                  <TableCell className="text-xs text-slate-600">{item.category}</TableCell>
                  <TableCell className="text-xs font-mono text-center font-bold">{item.quantity}</TableCell>
                  <TableCell className="text-xs font-mono text-blue-900">{item.specification}</TableCell>
                  <TableCell className="text-xs">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      {item.governing_code}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-600">
                    Month {item.mobilisation_month} → Month {item.demobilisation_month} · {item.phase}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <AiPanel
        title="AI programme review"
        description="Reads the phase spans, floor cycle and critical path and says what actually drives the date"
        endpoint={`/projects/${projectId}/ai/report`}
        initial={project?.ai?.programme}
        onGenerated={(d) => setProject?.((p) => ({ ...p, ai: { ...(p.ai || {}), programme: d } }))}
        readOnly={readOnly}
        testid="ai-programme"
        emptyHint="Explain what is driving the completion date and where time could realistically be recovered."
      />
    </div>
  );
}
