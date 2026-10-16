import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Bot,
  Users,
  ShieldCheck,
  Calculator,
  Send,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  RefreshCw,
  Zap,
  Compass,
  Ruler,
  TrendingUp,
} from "lucide-react";
import { api, apiError } from "../lib/api";
import { Section, Metric } from "../components/Field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { inr, num } from "../lib/format";

export default function AutonomousStudioModule({ project, projectId, onRefresh }) {
  // One-Click Generator state
  const [tier, setTier] = useState("mid");
  const [plotArea, setPlotArea] = useState(12000);
  const [targetFar, setTargetFar] = useState(2.75);
  const [floors, setFloors] = useState(14);
  const [generatingOneClick, setGeneratingOneClick] = useState(false);
  const [oneClickResult, setOneClickResult] = useState(null);

  // Conversational Design state
  const [instruction, setInstruction] = useState("");
  const [mutating, setMutating] = useState(false);
  const [mutationLog, setMutationLog] = useState([]);

  // Multi-Agent Review state
  const [agentReview, setAgentReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  // Autonomous Compliance state
  const [complianceAudit, setComplianceAudit] = useState(null);
  const [auditingCompliance, setAuditingCompliance] = useState(false);

  // Autonomous BOQ state
  const [boqTakeoff, setBoqTakeoff] = useState(null);
  const [computingBoq, setComputingBoq] = useState(false);

  // 1. Trigger One-Click Generation
  const handleOneClickGenerate = async (saveToProject = false) => {
    setGeneratingOneClick(true);
    try {
      const { data } = await api.post("/projects/one-click-generate", {
        plot_area_sqm: Number(plotArea) || 10000,
        target_tier: tier,
        city: project?.location || "Bengaluru",
        target_far: Number(targetFar) || 2.75,
        floors: Number(floors) || 14,
        save: saveToProject,
      });
      setOneClickResult(data.scheme);
      toast.success(
        saveToProject
          ? `Created & saved new ${tier} project: ${data.scheme.name}`
          : `Synthesized complete ${tier} scheme!`
      );
      if (saveToProject && onRefresh) onRefresh();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setGeneratingOneClick(false);
    }
  };

  // 2. Trigger Conversational Design Mutation
  const handleConversationalDesign = async (e) => {
    e?.preventDefault();
    if (!instruction.trim() || !projectId) return;
    setMutating(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/conversational-design`, {
        instruction,
        save: true,
      });
      if (data?.ok === false) {
        toast.error(data.message || "I couldn't apply that design change.");
        return;
      }
      setMutationLog((prev) => [
        { instruction, result: data.mutations_applied, time: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      setInstruction("");
      toast.success("Applied design mutation to project!");
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setMutating(false);
    }
  };

  // 3. Trigger Multi-Agent Review
  const handleMultiAgentReview = async () => {
    if (!projectId) return;
    setReviewing(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/multi-agent-review`);
      setAgentReview(data);
      toast.success("Multi-Agent Engineering Consensus complete!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setReviewing(false);
    }
  };

  // 4. Trigger Autonomous Compliance Scan
  const handleAutonomousCompliance = async () => {
    if (!projectId) return;
    setAuditingCompliance(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/autonomous-compliance`);
      setComplianceAudit(data);
      toast.success(`Compliance Audit: ${data.passed}/${data.total_checks} passed!`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setAuditingCompliance(false);
    }
  };

  // 5. Trigger Autonomous BOQ
  const handleAutonomousBoq = async () => {
    if (!projectId) return;
    setComputingBoq(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/autonomous-boq`);
      setBoqTakeoff(data);
      toast.success("Autonomous takeoff & cost benchmark computed!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setComputingBoq(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="rounded-lg border border-blue-900/40 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Autonomous Engineering Studio</h1>
            <p className="text-xs text-slate-300">
              One-click project synthesis, natural-language design morphing, 5-agent engineering consensus, and autonomous code auditing
            </p>
          </div>
        </div>
      </div>

      {/* 1. ONE-CLICK PROJECT GENERATION */}
      <Section
        title="One-Click Project Generator (Intelligent Planning)"
        description="Synthesizes full plot geometry, statutory setbacks, tower packing, floor plates, unit mix, parking, and costing in one shot"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Target Tier</label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="affordable">Affordable Housing</SelectItem>
                <SelectItem value="mid">Mid-Market Premium</SelectItem>
                <SelectItem value="luxury">High-End Luxury</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Plot Area (m²)</label>
            <Input
              type="number"
              value={plotArea}
              onChange={(e) => setPlotArea(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Target FAR / FSI</label>
            <Input
              type="number"
              step="0.1"
              value={targetFar}
              onChange={(e) => setTargetFar(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Storeys / Height</label>
            <Input
              type="number"
              value={floors}
              onChange={(e) => setFloors(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              onClick={() => handleOneClickGenerate(false)}
              disabled={generatingOneClick}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {generatingOneClick ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Synthesize
            </Button>
          </div>
        </div>

        {oneClickResult && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-semibold text-slate-900">{oneClickResult.name}</span>
                <span className="ml-2 text-xs text-blue-600 font-medium capitalize">({oneClickResult.tier} Tier)</span>
              </div>
              <div className="text-xs text-slate-600">
                FAR: <strong className="text-slate-900">{oneClickResult.achieved_metrics?.achieved_far}</strong> | Built-up:{" "}
                <strong className="text-slate-900">{num(oneClickResult.achieved_metrics?.total_builtup_sqm)} m²</strong> | Units:{" "}
                <strong className="text-slate-900">{oneClickResult.achieved_metrics?.total_units}</strong> | Est. Cost:{" "}
                <strong className="text-slate-900">{inr(oneClickResult.achieved_metrics?.estimated_cost_inr)}</strong>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 md:grid-cols-2">
              {oneClickResult.generation_log?.map((log, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 2. CONVERSATIONAL PROJECT DESIGN */}
      <Section
        title="Conversational Project Design"
        description="Mutate project parameters, unit mixes, floor counts, parking, and setbacks using natural-language instructions"
      >
        <form onSubmit={handleConversationalDesign} className="flex gap-2">
          <Input
            placeholder="e.g. 'Make Tower A 16 floors and set 3BHK share to 60%', 'Add 20 EV charging slots', 'Set front setback to 12m'"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={mutating}
            className="flex-1"
          />
          <Button type="submit" disabled={mutating || !instruction.trim()} className="bg-slate-800 hover:bg-slate-700">
            {mutating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Apply
          </Button>
        </form>

        {mutationLog.length > 0 && (
          <div className="mt-3 space-y-2">
            {mutationLog.map((log, i) => (
              <div key={i} className="rounded border border-slate-200 bg-slate-50/70 p-2.5 text-xs shadow-2xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-semibold text-slate-900">“{log.instruction}”</span>
                  <span className="text-slate-400">{log.time}</span>
                </div>
                <div className="mt-1 text-emerald-700 font-medium">
                  {log.result.map((r, idx) => (
                    <div key={idx}>✓ {r}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. MULTI-AGENT ENGINEERING REVIEW */}
      <Section
        title="Multi-Agent Engineering Teams"
        description="Autonomous collaborative audit by 5 specialized AI engineering personas: Architect, Structural, MEP, Cost, and Statutory Safety"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Simulates an interdisciplinary design review, identifying coordination clashes and issuing an engineering sign-off certificate.
          </p>
          <Button onClick={handleMultiAgentReview} disabled={reviewing} className="bg-indigo-600 hover:bg-indigo-700">
            {reviewing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Run 5-Agent Review
          </Button>
        </div>

        {agentReview && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 shadow-2xs">
              <div>
                <span className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">Team Consensus</span>
                <div className="text-lg font-bold text-indigo-950">{agentReview.team_consensus}</div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">Overall Engineering Score</span>
                <div className="text-2xl font-black text-indigo-800">{agentReview.overall_engineering_score} / 100</div>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Review ID: <strong className="font-mono text-slate-900">{agentReview.sign_off_certificate?.certificate_hash}</strong></div>
                <div className={`font-semibold ${agentReview.team_consensus === "NO BLOCKING ISSUES" ? "text-emerald-700" : "text-amber-700"}`}>
                  {agentReview.sign_off_certificate?.verdict}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agentReview.agents?.map((agent, i) => (
                <div key={i} className="rounded-md border border-slate-200 bg-white p-3 text-xs shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-900">{agent.role}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-bold ${
                        agent.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {agent.score}/100
                    </span>
                  </div>
                  <p className="mt-2 text-slate-700 italic">"{agent.verdict}"</p>
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {agent.findings?.map((f, idx) => (
                      <li key={idx}>• {f}</li>
                    ))}
                  </ul>
                  {agent.recommendations?.length > 0 && (
                    <div className="mt-2 text-indigo-700 border-t border-slate-100 pt-1 font-medium">
                      💡 {agent.recommendations[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 4. AUTONOMOUS COMPLIANCE & AUTONOMOUS BOQ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* COMPLIANCE */}
        <Section
          title="Autonomous Compliance Engine"
          description="Clause-referenced validation against NBC 2016 and statutory bye-laws with auto-remediation patches"
        >
          <div className="mb-3 flex justify-end">
            <Button
              onClick={handleAutonomousCompliance}
              disabled={auditingCompliance}
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              {auditingCompliance ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
              Run Code Audit
            </Button>
          </div>

          {complianceAudit ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Compliance Score: <strong className="text-slate-900 font-bold">{complianceAudit.score_pct}%</strong></span>
                <span>Passed: <strong className="text-emerald-700 font-semibold">{complianceAudit.passed}</strong> / Failed: <strong className="text-rose-700 font-semibold">{complianceAudit.failed}</strong></span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200">
                    <TableHead className="text-slate-900 font-semibold">Rule / Clause</TableHead>
                    <TableHead className="text-slate-900 font-semibold">Permissible</TableHead>
                    <TableHead className="text-slate-900 font-semibold">Achieved</TableHead>
                    <TableHead className="text-slate-900 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceAudit.checks?.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-slate-900">
                        <div>{c.rule}</div>
                        <div className="text-[10px] text-slate-500">{c.clause}</div>
                      </TableCell>
                      <TableCell className="text-slate-700">{c.permissible} {c.unit}</TableCell>
                      <TableCell className="text-slate-700">{c.achieved ?? "not set"} {c.achieved != null ? c.unit : ""}</TableCell>
                      <TableCell>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            c.status === "pass" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {c.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Click "Run Code Audit" to initiate autonomous statutory clause scanning.
            </div>
          )}
        </Section>

        {/* AUTONOMOUS BOQ & COSTING */}
        <Section
          title="Autonomous BOQ & Cost Takeoff"
          description="Parametric structural & architectural quantity take-off with CPWD DSR rate benchmarking"
        >
          <div className="mb-3 flex justify-end">
            <Button
              onClick={handleAutonomousBoq}
              disabled={computingBoq}
              size="sm"
              className="bg-blue-700 hover:bg-blue-800"
            >
              {computingBoq ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-1.5 h-3.5 w-3.5" />}
              Generate Takeoff
            </Button>
          </div>

          {boqTakeoff ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 shadow-2xs">
                <div>Total Est. Cost: <strong className="text-slate-900 font-bold text-sm">{inr(boqTakeoff.summary?.total_project_cost_inr)}</strong></div>
                <div>Rate: <strong className="text-slate-900 font-semibold">₹{num(boqTakeoff.summary?.cost_per_sqm_inr)}/m²</strong></div>
                <div className="text-emerald-700 font-semibold">{boqTakeoff.variance_vs_benchmark?.status}</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200">
                    <TableHead className="text-slate-900 font-semibold">Element</TableHead>
                    <TableHead className="text-right text-slate-900 font-semibold">Quantity</TableHead>
                    <TableHead className="text-right text-slate-900 font-semibold">Rate</TableHead>
                    <TableHead className="text-right text-slate-900 font-semibold">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boqTakeoff.items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-xs text-slate-900">{item.item}</TableCell>
                      <TableCell className="text-right text-xs text-slate-700">{num(item.quantity)} {item.unit}</TableCell>
                      <TableCell className="text-right text-xs text-slate-700">₹{num(item.rate_inr)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold text-slate-900">{inr(item.amount_inr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Click "Generate Takeoff" to compute autonomous parametric bill of quantities.
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
