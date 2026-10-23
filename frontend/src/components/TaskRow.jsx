import { useEffect, useRef, useState } from "react";
import { GripVertical, Pin, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Input } from "./ui/input";
import { TableCell, TableRow } from "./ui/table";
import { int, money } from "../lib/format";

const fmt = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN",
    { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** A cell the user has changed. Marked with a left border rather than a colour fill so a
 *  row full of edits still reads as a table row and not as a warning. */
const edited = (on) =>
  on ? "border-l-2 border-l-blue-500 bg-blue-50/40" : "";

/** Click-to-edit text. Enter or blur saves, Escape cancels back to what was there. */
function EditableName({ value, generated, onSave, disabled, critical, custom }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim() && draft !== value) onSave(draft.trim()); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="w-full border border-blue-300 rounded-sm px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        data-testid="task-name-input"
      />
    );
  }
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {critical && (
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"
          title="On the critical path — a day lost here is a day lost on the completion date" />
      )}
      <span
        onClick={() => !disabled && setEditing(true)}
        title={generated ? `Generated name: ${generated}` : (disabled ? "" : "Click to rename")}
        className={`truncate ${critical ? "text-slate-900" : "text-slate-600"} ${
          disabled ? "" : "cursor-text hover:underline decoration-dotted underline-offset-2"}`}
      >
        {value}
      </span>
      {custom && (
        <span className="text-[9px] uppercase tracking-wide text-blue-600 border border-blue-200 bg-blue-50 rounded-sm px-1 shrink-0">
          added
        </span>
      )}
    </span>
  );
}

/** A number cell that edits in place and commits on blur or Enter. */
function NumCell({ value, onSave, disabled, isEdited, title, suffix, align = "right" }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  return (
    <input
      type="number"
      value={draft}
      disabled={disabled}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (draft !== "" && Number.isFinite(n) && n !== Number(value)) onSave(n);
        else setDraft(String(value ?? ""));
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`w-full bg-transparent text-[11px] font-mono text-${align} px-1 py-0.5 rounded-sm
        focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-default
        ${isEdited ? "text-blue-800 font-semibold" : "text-slate-600"}`}
      data-testid="task-num-input"
    />
  );
}

export default function TaskRow({
  t, nameOf, readOnly, busy, onEdit, onResetRow, onRemove,
  onDragStart, onDragOver, onDrop, dragging,
}) {
  const e = t.edited || {};
  const gen = t.generated || {};
  const hasEdits = Object.keys(e).length > 0;
  const pinned = t.pinned_start || t.pinned_finish;

  return (
    <TableRow
      className={`bg-slate-50/60 ${dragging ? "opacity-40" : ""} ${
        t.pin_conflict ? "bg-red-50/60" : ""}`}
      data-testid={`prog-task-${t.id}`}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TableCell className={`py-1 text-xs pl-2 ${edited(!!e.name)}`}>
        <span className="flex items-center gap-1 min-w-0">
          {!readOnly && (
            <GripVertical
              className="h-3.5 w-3.5 text-slate-300 hover:text-slate-500 cursor-grab shrink-0"
              data-testid={`prog-task-grip-${t.id}`} />
          )}
          {pinned && (
            <Pin className="h-3 w-3 text-blue-600 shrink-0" data-testid="task-pin"
              title="This date was set by you, not calculated" />
          )}
          <EditableName
            value={t.name}
            generated={gen.name}
            disabled={readOnly || busy}
            critical={t.critical}
            custom={t.custom}
            onSave={(v) => onEdit(t.id, { name: v })}
          />
        </span>
        {t.pin_conflict && (
          <span className="flex items-start gap-1 text-[10px] text-red-700 mt-0.5 leading-snug"
            data-testid={`prog-pin-conflict-${t.id}`}>
            <TriangleAlert className="h-3 w-3 shrink-0 mt-px" />
            {t.pin_conflict}
          </span>
        )}
        {e.implied_output_per_day != null && (
          <span className="block text-[10px] text-slate-500 mt-0.5">
            That is {e.implied_output_per_day} {t.unit || "units"} per day per person —
            the productivity this duration assumes.
          </span>
        )}
      </TableCell>

      <TableCell className="py-1 text-[11px] text-slate-500 max-w-[150px] truncate"
        title={(t.predecessors || []).map((p) => nameOf[p.id] || p.id).join(", ")}>
        {t.driver ? (nameOf[t.driver] || t.driver) : "—"}
      </TableCell>

      <TableCell className={`py-1 ${edited(!!e.start)}`}>
        {t.milestone ? (
          <span className="text-[11px] font-mono text-slate-600 block text-right">{fmt(t.start)}</span>
        ) : (
          <Input type="date" value={t.pinned_start || t.start || ""} disabled={readOnly || busy}
            onChange={(ev) => onEdit(t.id, { start: ev.target.value || null })}
            className="h-7 rounded-sm text-[11px] font-mono px-1"
            data-testid={`prog-task-start-${t.id}`} />
        )}
      </TableCell>

      <TableCell className={`py-1 ${edited(!!e.finish)}`}>
        {t.milestone ? (
          <span className="text-[11px] font-mono text-slate-600 block text-right">{fmt(t.finish)}</span>
        ) : (
          <Input type="date" value={t.pinned_finish || t.finish || ""} disabled={readOnly || busy}
            onChange={(ev) => onEdit(t.id, { finish: ev.target.value || null })}
            className="h-7 rounded-sm text-[11px] font-mono px-1"
            data-testid={`prog-task-finish-${t.id}`} />
        )}
      </TableCell>

      <TableCell className={`py-1 ${edited(!!e.work_days || !!e.work_days_from_crew)}`}>
        {t.milestone ? <span className="block text-right text-[11px] text-slate-400">—</span> : (
          <NumCell value={t.work_days} disabled={readOnly || busy}
            isEdited={!!e.work_days || !!e.work_days_from_crew}
            title={gen.work_days != null
              ? `Generated: ${gen.work_days} working days`
              : "Working days — Sundays, holidays and monsoon stoppages are not counted"}
            onSave={(v) => onEdit(t.id, { work_days: v })} />
        )}
      </TableCell>

      <TableCell className={`py-1 ${edited(!!e.crew)}`}>
        {t.milestone ? <span className="block text-right text-[11px] text-slate-400">—</span> : (
          <NumCell value={t.crew} disabled={readOnly || busy} isEdited={!!e.crew}
            title={gen.crew != null ? `Generated: ${gen.crew} people` : "People on this task"}
            onSave={(v) => onEdit(t.id, { crew: v })} />
        )}
      </TableCell>

      <TableCell className={`py-1 ${edited(!!e.cost)}`}>
        {t.milestone ? <span className="block text-right text-[11px] text-slate-400">—</span> : (
          <NumCell value={Math.round(t.cost || 0)} disabled={readOnly || busy} isEdited={!!e.cost}
            title={gen.cost != null ? `Generated: ${money(gen.cost, "INR")}` : "Cost of this task"}
            onSave={(v) => onEdit(t.id, { cost: v })} />
        )}
      </TableCell>

      <TableCell className="py-1 text-right whitespace-nowrap">
        {hasEdits && !readOnly && (
          <button onClick={() => onResetRow(t.id)} disabled={busy}
            className="text-slate-300 hover:text-blue-600 transition-colors mr-1"
            title="Undo the edits on this task" data-testid={`prog-task-reset-${t.id}`}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        {t.removable && !readOnly && (
          <button onClick={() => onRemove(t.id)} disabled={busy}
            className="text-slate-300 hover:text-red-600 transition-colors"
            title={`Remove "${t.name}" from the programme`}
            data-testid={`prog-task-remove-${t.id}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </TableCell>
    </TableRow>
  );
}

export { fmt as formatDate };
