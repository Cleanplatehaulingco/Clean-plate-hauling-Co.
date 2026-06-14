import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Bot, BrainCircuit, CheckCircle2, Clock3, Code2, Database, GitPullRequest,
  Hammer, History, Loader2, LockKeyhole, Play, RefreshCw, Rocket, Search,
  ShieldCheck, Sparkles, XCircle, Zap,
} from "lucide-react";

type BuilderTool = {
  name: string;
  label: string;
  riskLevel: string;
  approvalRequired: boolean;
  description: string;
  canExecuteNow: boolean;
};

type BuilderAction = {
  id: number;
  title: string;
  toolName: string;
  riskLevel: string;
  status: string;
  mode: string;
  humanSummary: string;
  approvalRequired: boolean;
  input: any;
  preview: any;
  result: any;
  rollback: any;
  createdAt: string;
  approvedAt?: string | null;
  executedAt?: string | null;
};

type BuilderStatus = {
  mode: string;
  environment: string;
  tools: BuilderTool[];
  actions: BuilderAction[];
  signals: {
    liveSheetsConnected: boolean;
    crmRows: number;
    jobEntryRows: number;
    openLeads: number;
    pendingApprovals: number;
    executedActions: number;
  };
  guardrails: string[];
};

const MODE_COPY = {
  suggest_only: "Suggest Only",
  draft_changes: "Draft Changes",
  apply_with_approval: "Apply With Approval",
};

function riskClass(risk: string) {
  if (risk === "critical") return "border-red-500/35 bg-red-500/10 text-red-300";
  if (risk === "high") return "border-orange-500/35 bg-orange-500/10 text-orange-300";
  if (risk === "medium") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
}

function statusClass(status: string) {
  if (status === "executed") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
  if (status === "approved") return "border-blue-500/35 bg-blue-500/10 text-blue-300";
  if (status === "pending_approval") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (status === "failed" || status === "rejected") return "border-red-500/35 bg-red-500/10 text-red-300";
  return "border-border bg-background text-muted-foreground";
}

function pretty(value: any) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function BuilderMode() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Build me the next best improvement for Clean Plate, but show approvals first.");
  const [mode, setMode] = useState<keyof typeof MODE_COPY>("apply_with_approval");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<any | null>(null);

  const { data: status, isLoading, refetch } = useQuery<BuilderStatus>({
    queryKey: ["/api/builder/status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const { data: actions = [] } = useQuery<BuilderAction[]>({
    queryKey: ["/api/builder/actions"],
    refetchInterval: 30000,
  });

  const draftMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/builder/draft", { prompt, mode })).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/builder/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/builder/actions"] });
      toast({ title: "Builder drafted actions", description: data.message });
    },
  });

  const searchMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/builder/search", { query: searchQuery })).json(),
    onSuccess: (data) => setSearchResult(data),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/builder/actions/${id}/approve`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/builder/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/builder/actions"] });
      toast({ title: "Approved", description: "Action is ready to execute." });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/builder/actions/${id}/reject`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/builder/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/builder/actions"] });
      toast({ title: "Rejected", description: "Action was stopped." });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/builder/actions/${id}/execute`, {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/builder/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/builder/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Executed", description: `${data.title} finished and was logged.` });
    },
    onError: (err: Error) => toast({ title: "Execution failed", description: err.message, variant: "destructive" }),
  });

  const pending = useMemo(() => actions.filter(a => ["pending_approval", "approved", "draft"].includes(a.status)), [actions]);
  const history = useMemo(() => actions.filter(a => !["pending_approval", "approved", "draft"].includes(a.status)), [actions]);

  return (
    <>
      <PageHeader
        eyebrow="AI Builder Mode"
        title="Let the app build itself, with owner control"
        description="A powerful in-app AI operator that can inspect live data, draft app changes, queue approvals, execute safe tools, and log every move."
        actions={
          <div className="flex items-center gap-2">
            <Badge className="h-9 gap-1.5 px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-300" data-testid="status-builder-live">
              <Sparkles className="h-3.5 w-3.5" />
              Builder live
            </Badge>
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => refetch()} data-testid="button-refresh-builder">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="premium-hero rounded-xl border border-card-border bg-card p-5 md:p-6 mb-5 overflow-hidden">
        <div className="relative z-10 grid md:grid-cols-5 gap-3">
          <Signal icon={Database} label="CRM Sheet" value={isLoading ? "Syncing" : String(status?.signals.crmRows ?? 0)} sub={status?.signals.liveSheetsConnected ? "live connected" : "fallback mode"} />
          <Signal icon={Clock3} label="Open leads" value={String(status?.signals.openLeads ?? 0)} sub="live pipeline" />
          <Signal icon={ShieldCheck} label="Pending approvals" value={String(status?.signals.pendingApprovals ?? 0)} sub="owner gated" />
          <Signal icon={History} label="Executed actions" value={String(status?.signals.executedActions ?? 0)} sub="logged" />
          <Signal icon={LockKeyhole} label="Environment" value="Protected" sub="prod writes gated" />
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-4 mb-4">
        <section className="rounded-xl border border-card-border bg-card p-4 md:p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <BrainCircuit className="h-4 w-4 text-accent" />
                Command builder
              </div>
              <h2 className="font-display font-bold text-lg mt-1">Tell it what to build or operate</h2>
            </div>
            <Select value={mode} onValueChange={(v) => setMode(v as keyof typeof MODE_COPY)}>
              <SelectTrigger className="w-[200px]" data-testid="select-builder-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="suggest_only">Suggest Only</SelectItem>
                <SelectItem value="draft_changes">Draft Changes</SelectItem>
                <SelectItem value="apply_with_approval">Apply With Approval</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[142px] text-sm"
            placeholder="Example: clean up my CRM source names, create a better job closeout flow, or draft a new receipt workflow."
            data-testid="textarea-builder-prompt"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "Clean the CRM and show me every affected row before changing anything.",
              "Build a closeout workflow that captures expenses, receipt, review request, and profit.",
              "Analyze live Sheets and tell me what the app should improve next.",
              "Draft a code plan for a Rollback Center and staging deploy system.",
            ].map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs hover-elevate"
                data-testid={`button-builder-preset-${p.slice(0, 10).replace(/\W/g, "")}`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Mode: <span className="text-foreground">{MODE_COPY[mode]}</span>. Dangerous actions become approval cards before execution.
            </div>
            <Button
              className="gap-2 premium-button"
              onClick={() => draftMutation.mutate()}
              disabled={!prompt.trim() || draftMutation.isPending}
              data-testid="button-draft-builder-actions"
            >
              {draftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
              Draft actions
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-card-border bg-card p-4 md:p-5">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            <Search className="h-4 w-4 text-accent" />
            Live data search
          </div>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search CRM, jobs, receipts, settings..."
              data-testid="input-builder-search"
            />
            <Button
              variant="outline"
              onClick={() => searchMutation.mutate()}
              disabled={searchMutation.isPending}
              data-testid="button-builder-search"
            >
              {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background/60 p-3 min-h-[180px]" data-testid="panel-builder-search-result">
            {searchResult ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed">{searchResult.answer}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Lead matches" value={searchResult.context.matches.leads.length} />
                  <MiniStat label="Job matches" value={searchResult.context.matches.jobs.length} />
                  <MiniStat label="Receipts" value={searchResult.context.matches.receipts.length} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Top lead: {searchResult.context.matches.leads[0]?.name ?? "none"} · Sheet rows: {searchResult.context.sheets.crmRows ?? "n/a"}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                Search is live against CRM, jobs, receipts, settings, memory, and Sheets sync context.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="rounded-xl border border-card-border bg-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Approval queue
              </div>
              <h2 className="font-display font-bold text-lg mt-1">Changes waiting for control</h2>
            </div>
            <Badge variant="outline" data-testid="status-pending-count">{pending.length} active</Badge>
          </div>
          <div className="space-y-3" data-testid="list-builder-pending">
            {pending.length === 0 && <Empty text="No pending actions. Draft something powerful above." />}
            {pending.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={() => approveMutation.mutate(action.id)}
                onReject={() => rejectMutation.mutate(action.id)}
                onExecute={() => executeMutation.mutate(action.id)}
                busy={approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending}
              />
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-card-border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
              <Zap className="h-4 w-4 text-accent" />
              Tool registry
            </div>
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1" data-testid="list-builder-tools">
              {(status?.tools ?? []).map((tool) => (
                <div key={tool.name} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{tool.label}</div>
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{tool.description}</div>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0", riskClass(tool.riskLevel))}>{tool.riskLevel}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {tool.canExecuteNow ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <LockKeyhole className="h-3.5 w-3.5 text-amber-300" />}
                    {tool.canExecuteNow ? "Executable now" : "Registered, locked until infrastructure is connected"}
                    {tool.approvalRequired && <span>· approval required</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
              <History className="h-4 w-4 text-accent" />
              Execution history
            </div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1" data-testid="list-builder-history">
              {history.length === 0 && <Empty text="Executed and rejected actions will appear here." />}
              {history.map((action) => (
                <div key={action.id} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">{action.title}</div>
                    <Badge variant="outline" className={cn(statusClass(action.status))}>{action.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{action.toolName}</div>
                  {action.result && <pre className="mt-2 max-h-28 overflow-auto rounded bg-black/20 p-2 text-[10px] text-muted-foreground">{pretty(action.result)}</pre>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Signal({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/55 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="font-display font-bold text-xl num" data-testid={`builder-signal-${label.toLowerCase().replace(/\W/g, "-")}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <div className="font-display font-bold num">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
  onReject,
  onExecute,
  busy,
}: {
  action: BuilderAction;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
  busy: boolean;
}) {
  const canExecute = action.status === "approved" || (!action.approvalRequired && ["draft", "pending_approval"].includes(action.status));
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4" data-testid={`card-builder-action-${action.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-base">{action.title}</h3>
            <Badge variant="outline" className={cn(riskClass(action.riskLevel))}>{action.riskLevel}</Badge>
            <Badge variant="outline" className={cn(statusClass(action.status))}>{action.status.replace("_", " ")}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2">
            <span>{action.toolName}</span>
            <span>·</span>
            <span>{MODE_COPY[action.mode as keyof typeof MODE_COPY] ?? action.mode}</span>
            {action.approvalRequired && <span>· approval required</span>}
          </div>
        </div>
        <ToolIcon tool={action.toolName} />
      </div>

      <p className="mt-3 text-sm leading-relaxed">{action.humanSummary}</p>

      <div className="mt-3 grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">Preview</div>
          <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-card/60 p-3 text-[10.5px] leading-relaxed text-muted-foreground">{pretty(action.preview)}</pre>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">Rollback</div>
          <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-card/60 p-3 text-[10.5px] leading-relaxed text-muted-foreground">{pretty(action.rollback)}</pre>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {["draft", "pending_approval"].includes(action.status) && action.approvalRequired && (
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onReject} disabled={busy} data-testid={`button-reject-${action.id}`}>
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button size="sm" className="gap-1.5 premium-button" onClick={onApprove} disabled={busy} data-testid={`button-approve-${action.id}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Approve
            </Button>
          </>
        )}
        {canExecute && (
          <Button size="sm" className="gap-1.5" onClick={onExecute} disabled={busy} data-testid={`button-execute-${action.id}`}>
            <Play className="h-3.5 w-3.5" />
            Execute
          </Button>
        )}
      </div>
    </div>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const Icon = tool.includes("code") ? Code2 : tool.includes("deploy") ? Rocket : tool.includes("pull") ? GitPullRequest : tool.includes("sync") || tool.includes("data") ? Database : tool.includes("task") ? CheckCircle2 : Bot;
  return (
    <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center text-accent">
      <Icon className="h-5 w-5" />
    </div>
  );
}
