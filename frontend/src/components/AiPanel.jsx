import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { api, apiError } from "../lib/api";
import { Section } from "./Field";
import { Button } from "./ui/button";
import { dt } from "../lib/format";

// Minimal markdown renderer for model output: bold, inline code, headings, bullets,
// numbered lists and fenced blocks. Deliberately not a full parser -- the system prompts
// constrain the model to these constructs, and a markdown dependency is not worth it.
//
// Numbered lists and fenced blocks matter for APT specifically: its prompt asks for
// derivations as numbered steps with the formula on its own line, and rendering "1." as
// body text loses the structure the answer was written in.

// Model output is interpolated as HTML below, so anything that arrives already looking
// like a tag has to stop being one first. The single-shot report prompts never produce
// tags, but APT relays user questions, and a question containing markup should render as
// text rather than execute.
const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The prompt forbids LaTeX, but a stored answer from before that rule -- or an occasional
// slip -- would otherwise reach the reader as raw \frac{}{} and $$ markers. Converted to
// the plain notation an engineer writes by hand rather than left as source code.
//
// ORDER MATTERS. Inner commands are resolved first so that by the time \frac is matched,
// its two braces contain no nested braces of their own -- \frac{a}{\sqrt{b}} otherwise
// fails to match at all and ships as literal source.
const delatex = (s) => {
  let t = String(s).replace(/\$\$?/g, "");
  // 1. symbols and operators
  t = t
    .replace(/\\times|\\cdot/g, "x")
    .replace(/\\div/g, "/")
    .replace(/\\approx/g, "~")
    .replace(/\\leq/g, "<=").replace(/\\geq/g, ">=").replace(/\\neq/g, "!=")
    .replace(/\\pm/g, "+/-")
    .replace(/\\(alpha|beta|gamma|delta|theta|lambda|mu|sigma|phi|rho|pi|omega)\b/g, "$1")
    .replace(/\\left|\\right/g, "");
  // 2. braced commands, innermost first -- repeat until nothing changes
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t
      .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)")
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)")
      .replace(/_\{([^{}]*)\}/g, "$1")
      .replace(/\^\{([^{}]*)\}/g, "^$1");
    if (t === before) break;
  }
  // 3. anything still carrying a backslash loses it rather than being shown as source
  return t
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/_(?=[A-Za-z0-9])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const inline = (line) => esc(delatex(line))
  .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
  .replace(/`(.+?)`/g, '<code class="font-mono text-xs bg-slate-100 px-1 rounded-sm">$1</code>');

export const Markdown = ({ text, testid = "ai-summary-text" }) => {
  const lines = String(text || "").split("\n");
  const out = [];
  let fence = null;

  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) {
      if (fence) {
        out.push(
          <pre key={`f${i}`} className="bg-slate-900 text-slate-100 rounded-sm p-2.5 overflow-x-auto">
            <code className="font-mono text-xs whitespace-pre">{delatex(fence.join("\n"))}</code>
          </pre>
        );
        fence = null;
      } else {
        fence = [];
      }
      return;
    }
    if (fence) { fence.push(line); return; }

    const html = inline(line);
    if (/^#{1,3}\s/.test(line)) {
      out.push(<h4 key={i} className="text-sm font-semibold tracking-tight text-slate-900 pt-2"
        dangerouslySetInnerHTML={{ __html: inline(line.replace(/^#{1,3}\s/, "")) }} />);
    } else if (/^\s*\d+[.)]\s/.test(line)) {
      // Numbered steps keep their own number rather than being renumbered by the browser,
      // because a derivation that starts at step 3 must still say 3.
      const n = line.match(/^\s*(\d+)[.)]\s/)[1];
      out.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="font-mono text-xs text-slate-400 pt-0.5 shrink-0">{n}.</span>
          <span dangerouslySetInnerHTML={{ __html: inline(line.replace(/^\s*\d+[.)]\s/, "")) }} />
        </div>
      );
    } else if (/^\s*[-*]\s/.test(line)) {
      out.push(<li key={i} className="ml-4 list-disc"
        dangerouslySetInnerHTML={{ __html: inline(line.replace(/^\s*[-*]\s/, "")) }} />);
    } else if (!line.trim()) {
      out.push(<div key={i} className="h-1" />);
    } else {
      out.push(<p key={i} dangerouslySetInnerHTML={{ __html: html }} />);
    }
  });

  // An unterminated fence still has to render, or the tail of the answer disappears.
  if (fence && fence.length) {
    out.push(
      <pre key="f-open" className="bg-slate-900 text-slate-100 rounded-sm p-2.5 overflow-x-auto">
        <code className="font-mono text-xs whitespace-pre">{delatex(fence.join("\n"))}</code>
      </pre>
    );
  }

  return <div className="space-y-1.5 text-sm text-slate-700" data-testid={testid}>{out}</div>;
};

// /ai/status is the same answer for every panel on the page, so it is fetched once per
// page load and shared, rather than once per panel.
let statusPromise = null;
const aiStatus = () => {
  if (!statusPromise)
    statusPromise = api.get("/ai/status").then(({ data }) => data).catch(() => null);
  return statusPromise;
};

/**
 * One AI analysis block: a Generate/Regenerate button and the markdown it produced.
 *
 * `initial` seeds the panel from an analysis already saved on the project document, so a
 * previously generated summary is visible on load without regenerating it. It seeds state
 * once on mount rather than staying bound to the prop -- otherwise an unrelated re-render
 * of the parent would overwrite a summary the user just generated with the older stored
 * one. `onGenerated` lets the parent mirror the new result into the in-memory project so
 * it survives a tab switch; the backend has already persisted it either way.
 */
export function AiPanel({
  title = "AI analysis",
  description,
  endpoint,
  method = "post",
  body,                    // optional POST payload, for endpoints that analyse live inputs
  initial = null,
  onGenerated,
  readOnly = false,
  disabled = false,
  disabledHint = "",
  emptyHint = "Generate a natural-language analysis of the results above.",
  testid = "ai-panel",
  buttonLabel = "Generate AI analysis",
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(initial);
  const [status, setStatus] = useState(undefined);

  useEffect(() => { aiStatus().then(setStatus); }, []);

  const notConfigured = status && status.configured === false;
  const blocked = readOnly || disabled || notConfigured;

  const run = async () => {
    setBusy(true);
    try {
      const { data } = method === "get" ? await api.get(endpoint) : await api.post(endpoint, body);
      setResult(data);
      if (onGenerated) onGenerated(data);
      toast.success("AI analysis generated");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={title}
      description={description}
      testid={`${testid}-section`}
      actions={
        <Button onClick={run} disabled={busy || blocked} variant="ai" className="rounded-sm h-8"
          data-testid={`${testid}-button`}>
          <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-pulse" : ""}`} />
          {busy ? "Generating…" : result ? "Regenerate" : buttonLabel}
        </Button>
      }
    >
      {notConfigured ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1"
          data-testid={`${testid}-unconfigured`}>
          {status.detail || "No AI provider key is configured."}
        </p>
      ) : disabled && disabledHint ? (
        <p className="text-sm text-slate-500" data-testid={`${testid}-disabled`}>{disabledHint}</p>
      ) : result ? (
        <>
          <Markdown text={result.text} testid={`${testid}-text`} />
          <p className="text-[11px] text-slate-400 font-mono mt-3">
            {result.model} · {dt(result.generated_at)}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">{emptyHint}</p>
      )}
    </Section>
  );
}
