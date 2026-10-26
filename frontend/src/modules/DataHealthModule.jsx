import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { api, apiError } from "../lib/api";
import { Metric, Section } from "../components/Field";
import { Button } from "../components/ui/button";
import { num } from "../lib/format";

/* Palette.
 *
 * Three colour jobs, kept apart on purpose:
 *   STATUS    good / warning / critical, reserved for state and never reused as a series.
 *   DIVERGING compliance slack against shortfall — two poles about a neutral zero.
 *   NEUTRAL   grid, axes and every piece of text, so identity is never carried by ink.
 *
 * Each set was checked for colour-vision separation against a light surface rather than
 * chosen by eye. The good/warning pair sits in the marginal band under protanopia, so
 * every bar that uses it is directly labelled — the label, not the hue, is what the
 * reader relies on.
 */
const STATUS = { good: "#16A34A", warn: "#D97706", bad: "#B91C1C" };
const DIVERGING = { slack: "#2563EB", shortfall: "#DC2626" };
const GRID = "#E2E8F0";
const AXIS_TICK = { fontSize: 11, fontFamily: "JetBrains Mono", fill: "#64748B" };

const scoreColor = (v) => (v >= 80 ? STATUS.good : v >= 40 ? STATUS.warn : STATUS.bad);

const TARGET_SCORE = 80;

/** Shared tooltip chrome, so all four charts read as one surface. */
const tipStyle = {
  contentStyle: { borderRadius: 2, border: "1px solid #E2E8F0", fontSize: 12 },
  labelStyle: { color: "#0F172A", fontWeight: 600 },
};

function StateRow({ state, label, detail }) {
  const ok = state === "fresh" || state === "ok";
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-start gap-2.5 border-b border-slate-100 py-2 last:border-b-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-600" : "text-amber-500"}`} />
      <div className="min-w-0">
        <div className="text-xs font-semibold tracking-tight text-slate-900">
          {label}
          <span className={`ml-2 font-mono text-[10px] uppercase ${ok ? "text-emerald-700" : "text-amber-700"}`}>
            {state}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

/** Data reliability — whether the inputs behind every other module hold up.
 *
 *  Read-only and derived. It never writes to the project, so looking at it cannot be the
 *  thing that changes the answer it is reporting on.
 */
export default function DataHealthModule({ project, projectId, goToModule }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The live form is sent the in-memory document rather than reading the saved one:
      // the point of the panel is to describe the project as it is on screen, and the
      // autosave debounce means those two differ for about a second after every edit.
      const { data } = await api.post("/data-health", { project });
      setReport(data);
    } catch (e) {
      setError(apiError(e.response?.data?.detail, "Could not compute the data reliability report."));
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => { load(); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !report)
    return (
      <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="data-health-error">
        {error}
      </p>
    );

  if (!report)
    return <p className="text-sm text-slate-500" data-testid="data-health-loading">Checking the project's inputs…</p>;

  const { scores, counts } = report;

  const scoreData = [
    { name: "Completeness", value: scores.completeness },
    { name: "Freshness", value: scores.freshness },
    { name: "Consistency", value: scores.consistency },
    { name: "Compliance", value: scores.compliance },
  ];

  const groupData = report.groups.map((g) => ({
    name: g.label, value: g.score, met: g.met, total: g.total, detail: g.detail, key: g.key,
  }));

  const marginData = report.compliance_margins.map((m) => ({
    name: m.code || m.label,
    label: m.label,
    value: m.margin_pct,
    actual: m.actual,
    threshold: m.threshold,
    unit: m.unit || "",
    status: m.status,
  }));

  const warnData = report.module_warnings.map((r) => ({
    name: r.module, critical: r.critical, warning: r.warning,
  })).filter((r) => r.critical || r.warning);

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-600" data-testid="data-health-oneliner">
        Every module computes an answer whether or not the inputs behind it were ever entered —
        this is the one page that says which of today's numbers rest on your project and which
        rest on a default.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-2" data-testid="data-health-overall">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Data reliability</div>
          <div className="font-mono text-3xl leading-tight" style={{ color: scoreColor(report.overall_score) }}>
            {num(report.overall_score, 1)}
            <span className="ml-1 text-[11px] text-slate-400">/ 100</span>
          </div>
        </div>
        <Metric label="Stale artefacts" value={counts.stale} testid="data-health-stale"
                tone={counts.stale ? "danger" : "success"} />
        <Metric label="Mismatches" value={counts.mismatched} testid="data-health-mismatched"
                tone={counts.mismatched ? "danger" : "success"} />
        <Metric label="Missing inputs" value={counts.missing_inputs} testid="data-health-missing" />
        <Metric label="Rules failed" value={counts.rules_failed} testid="data-health-rules-failed"
                tone={counts.rules_failed ? "danger" : "success"} />
      </div>

      <Section
        title="Reliability scores"
        description="Completeness asks whether the input was supplied; freshness whether the derived artefact still matches it; consistency whether two stored facts agree."
        testid="data-health-scores-section"
        actions={
          <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs"
                  disabled={loading} onClick={load} data-testid="data-health-refresh">
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking…" : "Re-check"}
          </Button>
        }
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={scoreData} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            {/* The bar you are aiming for, so a 71 reads as "short of target", not as a bare number. */}
            <ReferenceLine y={TARGET_SCORE} stroke="#94A3B8" strokeDasharray="4 3"
                           label={{ value: `target ${TARGET_SCORE}`, position: "right", fontSize: 10, fill: "#64748B" }} />
            <Tooltip {...tipStyle} formatter={(v) => [`${num(v, 1)} / 100`, "Score"]} cursor={{ fill: "#F1F5F9" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11, fill: "#475569", formatter: (v) => num(v, 0) }}>
              {scoreData.map((d) => <Cell key={d.name} fill={scoreColor(d.value)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Green at or above {TARGET_SCORE}, amber above 40, red below. Every bar carries its own
          number — the colour is a second reading of the same value, never the only one.
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Input completeness by source"
          description="What was actually entered, against what the modules downstream expect."
          testid="data-health-groups-section"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={groupData} layout="vertical" margin={{ top: 4, right: 44, left: 44, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11, fill: "#475569" }}
                     tickLine={false} axisLine={false} />
              <Tooltip {...tipStyle} cursor={{ fill: "#F1F5F9" }}
                       formatter={(v, _n, p) => [`${num(v, 0)}% · ${p.payload.met} of ${p.payload.total} checks`, p.payload.name]}
                       labelFormatter={() => ""} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}
                   label={{ position: "right", fontSize: 11, fill: "#475569", formatter: (v) => `${num(v, 0)}%` }}>
                {groupData.map((d) => <Cell key={d.key} fill={scoreColor(d.value)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 space-y-2" data-testid="data-health-group-list">
            {report.groups.filter((g) => g.score < 100).map((g) => (
              <div key={g.key} className="rounded-sm border border-slate-200 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold tracking-tight text-slate-900">{g.label}</span>
                  <span className="font-mono text-[11px] text-slate-500">{g.met}/{g.total}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{g.detail}</p>
                <ul className="mt-1.5 space-y-1">
                  {g.checks.filter((c) => !c.ok).map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                      <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <div className="space-y-4">
          <Section
            title="Freshness & consistency"
            description="Derived artefacts checked against the inputs they were produced from."
            testid="data-health-freshness-section"
          >
            {[...report.freshness, ...report.consistency].length === 0 ? (
              <p className="text-xs text-slate-500">
                Nothing derived yet — generate a site layout or run the GIS analysis and the checks appear here.
              </p>
            ) : (
              <div>
                {report.freshness.map((f) => <StateRow key={f.key} {...f} />)}
                {report.consistency.map((c) => <StateRow key={c.key} {...c} />)}
              </div>
            )}
            {(counts.stale > 0 || counts.mismatched > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs"
                        onClick={() => goToModule?.("plot")} data-testid="data-health-goto-plot">
                  Regenerate site layout
                </Button>
                <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs"
                        onClick={() => goToModule?.("planning")} data-testid="data-health-goto-planning">
                  Apply layout in planning
                </Button>
                <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs"
                        onClick={() => goToModule?.("gis")} data-testid="data-health-goto-gis">
                  Re-run GIS
                </Button>
              </div>
            )}
          </Section>

          <Section
            title="Engineering findings by module"
            description="Where the codes flagged something. Critical blocks a sign-off; a warning needs a decision recorded."
            testid="data-health-warnings-section"
          >
            {warnData.length === 0 ? (
              <p className="text-xs text-slate-500">No module raised a warning against the current inputs.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, warnData.length * 34 + 48)}>
                <BarChart data={warnData} layout="vertical" margin={{ top: 4, right: 16, left: 44, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis type="category" dataKey="name" width={156} tick={{ fontSize: 11, fill: "#475569" }}
                         tickLine={false} axisLine={false} />
                  <Tooltip {...tipStyle} cursor={{ fill: "#F1F5F9" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* The white stroke is the 2px surface gap between stacked segments — without
                      it two adjacent counts read as one longer bar. */}
                  <Bar dataKey="critical" stackId="s" fill={STATUS.bad} name="Critical"
                       stroke="#FFFFFF" strokeWidth={2} barSize={16} />
                  <Bar dataKey="warning" stackId="s" fill={STATUS.warn} name="Warning"
                       stroke="#FFFFFF" strokeWidth={2} barSize={16} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>
        </div>
      </div>

      <Section
        title="Compliance headroom"
        description="Each rule as its distance from the threshold. Right of zero is slack you can spend; left of zero is the shortfall to close."
        testid="data-health-margins-section"
      >
        {marginData.length === 0 ? (
          <p className="text-xs text-slate-500">No compliance rules are enabled on this project.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, marginData.length * 26 + 48)}>
              <BarChart data={marginData} layout="vertical" margin={{ top: 4, right: 40, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[-100, 100]} unit="%" tick={AXIS_TICK}
                       tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#475569" }}
                       tickLine={false} axisLine={false} />
                {/* Neutral midpoint: the threshold itself, which is what every bar is measured from. */}
                <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
                <Tooltip
                  {...tipStyle}
                  cursor={{ fill: "#F1F5F9" }}
                  formatter={(v, _n, p) => [
                    `${v >= 0 ? "+" : ""}${num(v, 1)}% — actual ${num(p.payload.actual, 2)}${p.payload.unit} vs ${num(p.payload.threshold, 2)}${p.payload.unit}`,
                    p.payload.status === "pass" ? "Passing" : "Failing",
                  ]}
                  labelFormatter={(l, p) => p?.[0]?.payload?.label || l}
                />
                <Bar dataKey="value" barSize={13}>
                  {marginData.map((d) => (
                    <Cell key={d.name} fill={d.value < 0 ? DIVERGING.shortfall : DIVERGING.slack} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* The table the chart is a picture of. Also the relief for anyone who cannot
                separate the two poles by colour. */}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11px]" data-testid="data-health-margin-table">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Rule</th>
                    <th className="py-1.5 pr-3 font-medium">Actual</th>
                    <th className="py-1.5 pr-3 font-medium">Threshold</th>
                    <th className="py-1.5 pr-3 font-medium">Headroom</th>
                    <th className="py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {marginData.map((m) => (
                    <tr key={m.name} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-1.5 pr-3 text-slate-700">{m.label}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-900">{num(m.actual, 2)}{m.unit}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-500">{num(m.threshold, 2)}{m.unit}</td>
                      <td className="py-1.5 pr-3 font-mono" style={{ color: m.value < 0 ? DIVERGING.shortfall : DIVERGING.slack }}>
                        {m.value >= 0 ? "+" : ""}{num(m.value, 1)}%
                      </td>
                      <td className="py-1.5">
                        <span className={`font-mono text-[10px] uppercase ${m.status === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {!!report.missing_inputs.length && (
        <Section title="Inputs the engineering modules fell back on" testid="data-health-missing-section">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {report.missing_inputs.map((m) => (
              <li key={m} className="flex items-start gap-2 text-[11px] text-slate-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            Each of these was not supplied, so the module used an assumed value. The result is still
            computed — it is just not computed from your project.
          </p>
        </Section>
      )}
    </div>
  );
}
