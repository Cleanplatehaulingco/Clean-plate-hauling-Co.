import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { FollowUp, Lead, Settings as SettingsT } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Sparkles,
  TimerReset,
  UserRoundCheck,
} from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  quote_sent: "Quote sent",
  missed_call: "Missed call",
  post_job_review: "Post-job review",
  no_show: "No-show / no-answer",
  next_day_check: "Day-before check",
};

const CHANNEL_ICON: Record<string, React.ElementType> = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
};

const QUICK_TEMPLATES = [
  {
    key: "photo_request",
    label: "Photo request",
    channel: "text",
    body: "Hi {{name}}, this is {{owner}} with Clean Plate Hauling Co. If you can text a few photos of the {{jobType}} in {{city}}, I can lock in a clean quote and timing for you.",
  },
  {
    key: "quote_follow_up",
    label: "Quote follow-up",
    channel: "text",
    body: "Hi {{name}}, just checking in on the {{jobType}} quote from Clean Plate Hauling Co. Want me to hold a spot for you this week?",
  },
  {
    key: "booking_confirm",
    label: "Booking confirmation",
    channel: "email",
    body: "Hi {{name}}, confirming Clean Plate Hauling Co. for {{address}} in {{city}}. Your window is {{timeWindow}}. Reply here with any gate codes, photos, or access notes before we arrive.",
  },
  {
    key: "review_ask",
    label: "Review ask",
    channel: "text",
    body: "Hi {{name}}, thanks again for choosing Clean Plate Hauling Co. If the crew earned it, a quick Google review would help us a ton. Thank you!",
  },
];

type LeadFilter = "all" | "today" | "overdue" | "hot" | "quote_sent" | "new";

type CommandLead = Lead & {
  urgency: "overdue" | "today" | "upcoming" | "unscheduled";
  score: number;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function urgencyFor(lead: Lead): CommandLead["urgency"] {
  if (!lead.nextActionDate) return "unscheduled";
  const today = todayIso();
  if (lead.nextActionDate < today) return "overdue";
  if (lead.nextActionDate === today) return "today";
  return "upcoming";
}

function leadScore(lead: Lead) {
  let score = Number(lead.estimatedValue) || 0;
  if (lead.stage === "quote_sent") score += 250;
  if (lead.stage === "follow_up") score += 175;
  if (lead.stage === "new") score += 100;
  if (urgencyFor(lead) === "overdue") score += 300;
  if (urgencyFor(lead) === "today") score += 225;
  return score;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function renderTemplate(body: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), body);
}

export default function FollowUps() {
  const { data: follows = [] } = useQuery<FollowUp[]>({ queryKey: ["/api/follow-ups"] });
  const { data: leads = [], isFetching, refetch } = useQuery<Lead[]>({ queryKey: ["/api/leads"], refetchInterval: 30000 });
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });
  const { toast } = useToast();
  const [activeKind, setActiveKind] = useState<string>("quote_sent");
  const [leadFilter, setLeadFilter] = useState<LeadFilter>("today");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(QUICK_TEMPLATES[0].key);
  const [vars, setVars] = useState({
    name: "Dana",
    owner: "Mike",
    city: "Wixom",
    jobType: "garage cleanout",
    address: "29420 Pontiac Trail",
    timeWindow: "8 – 10 AM",
  });

  const commandLeads = useMemo<CommandLead[]>(() => leads
    .filter((lead) => !["completed", "lost"].includes(lead.stage))
    .map((lead) => ({ ...lead, urgency: urgencyFor(lead), score: leadScore(lead) }))
    .sort((a, b) => b.score - a.score), [leads]);

  const filteredLeads = commandLeads.filter((lead) => {
    if (leadFilter === "all") return true;
    if (leadFilter === "today") return lead.urgency === "today";
    if (leadFilter === "overdue") return lead.urgency === "overdue";
    if (leadFilter === "hot") return lead.score >= 500;
    return lead.stage === leadFilter;
  });

  const selectedLead = commandLeads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? commandLeads[0];
  const selectedTemplate = QUICK_TEMPLATES.find((template) => template.key === selectedTemplateKey) ?? QUICK_TEMPLATES[0];
  const leadVars = selectedLead ? {
    ...vars,
    name: selectedLead.name,
    city: selectedLead.city,
    jobType: selectedLead.jobType,
    address: selectedLead.address || vars.address,
  } : vars;
  const renderedQuickMessage = renderTemplate(selectedTemplate.body, leadVars);
  const overdueCount = commandLeads.filter((lead) => lead.urgency === "overdue").length;
  const todayCount = commandLeads.filter((lead) => lead.urgency === "today").length;
  const hotCount = commandLeads.filter((lead) => lead.score >= 500).length;
  const openValue = commandLeads.reduce((sum, lead) => sum + (Number(lead.estimatedValue) || 0), 0);
  const filteredScripts = follows.filter((follow) => follow.kind === activeKind);
  const kinds = Array.from(new Set(follows.map((follow) => follow.kind)));

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Lead> }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead updated", description: "Follow-up command queue is synced." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update the lead follow-up. Try again.", variant: "destructive" });
    },
  });

  const copyText = async (text: string, description = "Paste it into your phone or email.") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description });
    } catch {
      toast({ title: "Couldn’t copy", description: "Highlight + copy manually." });
    }
  };

  const completeFollowUp = (lead: Lead) => {
    updateLeadMutation.mutate({
      id: lead.id,
      patch: {
        stage: lead.stage === "new" ? "follow_up" : lead.stage,
        nextAction: "Follow up again if no response",
        nextActionDate: addDays(2),
        notes: `${lead.notes ? `${lead.notes}\n` : ""}${new Date().toLocaleString()}: Follow-up completed from command center.`,
      },
    });
  };

  const reschedule = (lead: Lead, days: number) => {
    updateLeadMutation.mutate({
      id: lead.id,
      patch: {
        nextAction: lead.nextAction || "Follow up",
        nextActionDate: addDays(days),
        notes: `${lead.notes ? `${lead.notes}\n` : ""}${new Date().toLocaleString()}: Follow-up rescheduled ${days === 1 ? "tomorrow" : `in ${days} days`}.`,
      },
    });
  };

  const updateSelectedLead = (patch: Partial<Lead>) => {
    if (!selectedLead) return;
    updateLeadMutation.mutate({ id: selectedLead.id, patch });
  };

  return (
    <>
      <PageHeader
        eyebrow="Follow-up command center"
        title="Close the gaps"
        description="Today’s calls, overdue quotes, high-value leads, and proven scripts in one operator dashboard. Work the list, mark it done, reschedule, and keep momentum moving."
        actions={
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-followups">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-4 mb-5">
        <CommandStat icon={AlertTriangle} label="Overdue" value={String(overdueCount)} tone="text-red-300" />
        <CommandStat icon={CalendarClock} label="Due today" value={String(todayCount)} tone="text-amber-300" />
        <CommandStat icon={Sparkles} label="Hot leads" value={String(hotCount)} tone="text-accent" />
        <CommandStat icon={TimerReset} label="Open pipeline" value={fmtMoney(openValue)} tone="text-emerald-300" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border border-card-border bg-card p-4 premium-panel" data-testid="followup-command-queue">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <SectionTitle className="mb-1">Command queue</SectionTitle>
              <p className="text-xs text-muted-foreground">Attack the highest-value follow-ups first. Each action writes back to the CRM lead.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["today", "overdue", "hot", "quote_sent", "new", "all"] as LeadFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLeadFilter(filter)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    leadFilter === filter ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover-elevate",
                  )}
                  data-testid={`filter-leads-${filter}`}
                >
                  {filter.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {filteredLeads.map((lead) => (
              <LeadCommandCard
                key={lead.id}
                lead={lead}
                active={selectedLead?.id === lead.id}
                onSelect={() => setSelectedLeadId(lead.id)}
                onCopy={() => copyText(renderTemplate(selectedTemplate.body, {
                  ...vars,
                  name: lead.name,
                  city: lead.city,
                  jobType: lead.jobType,
                  address: lead.address || vars.address,
                }))}
                onComplete={() => completeFollowUp(lead)}
                onTomorrow={() => reschedule(lead, 1)}
                disabled={updateLeadMutation.isPending}
              />
            ))}
            {filteredLeads.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No leads match this queue. Switch filters or sync the CRM.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-card-border bg-card p-4 premium-panel" data-testid="followup-message-workbench">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionTitle className="mb-1">Message workbench</SectionTitle>
              <p className="text-xs text-muted-foreground">Personalize a proven message, then text, email, or copy it.</p>
            </div>
            {selectedLead && <Badge variant="outline" className="border-accent/40 text-accent">{selectedLead.name}</Badge>}
          </div>

          {selectedLead ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-accent/25 bg-accent/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl font-black">{selectedLead.name}</div>
                    <div className="text-xs text-muted-foreground">{selectedLead.jobType} · {selectedLead.city} · {fmtMoney(Number(selectedLead.estimatedValue) || 0)}</div>
                  </div>
                  <UrgencyBadge urgency={selectedLead.urgency} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <a href={`tel:${selectedLead.phone}`} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><Phone className="mb-1 h-3.5 w-3.5 text-accent" />Call</a>
                  <a href={`sms:${selectedLead.phone}?&body=${encodeURIComponent(renderedQuickMessage)}`} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><MessageSquare className="mb-1 h-3.5 w-3.5 text-accent" />Text</a>
                  <a href={`mailto:${selectedLead.email || ""}?subject=${encodeURIComponent(`Clean Plate Hauling Co. — ${selectedLead.jobType}`)}&body=${encodeURIComponent(renderedQuickMessage)}`} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><Mail className="mb-1 h-3.5 w-3.5 text-accent" />Email</a>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {QUICK_TEMPLATES.map((template) => (
                  <button
                    key={template.key}
                    onClick={() => setSelectedTemplateKey(template.key)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      selectedTemplateKey === template.key ? "border-accent bg-accent/10" : "border-border hover-elevate",
                    )}
                    data-testid={`template-${template.key}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{template.label}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{template.channel}</Badge>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Owner">
                  <Input value={vars.owner} onChange={(event) => setVars({ ...vars, owner: event.target.value })} data-testid="input-message-owner" />
                </Field>
                <Field label="Time window">
                  <Input value={vars.timeWindow} onChange={(event) => setVars({ ...vars, timeWindow: event.target.value })} data-testid="input-message-window" />
                </Field>
              </div>

              <Textarea
                value={renderedQuickMessage}
                readOnly
                className="min-h-[160px] bg-background/50 font-mono text-sm leading-relaxed"
                data-testid="textarea-rendered-message"
              />

              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => copyText(renderedQuickMessage, "Lead message copied.")} data-testid="button-copy-selected-message">
                    <Copy className="h-4 w-4" /> Copy message
                  </Button>
                  <Button variant="secondary" className="gap-2" onClick={() => updateSelectedLead({ nextAction: "Waiting on customer response", nextActionDate: addDays(2) })} disabled={updateLeadMutation.isPending} data-testid="button-set-waiting-response">
                    <TimerReset className="h-4 w-4" /> Wait 2 days
                  </Button>
                </div>
                <Button className="gap-2" onClick={() => completeFollowUp(selectedLead)} disabled={updateLeadMutation.isPending} data-testid="button-complete-selected-followup">
                  <UserRoundCheck className="h-4 w-4" /> Mark followed up
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No active leads yet.</div>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border border-card-border bg-card p-4">
          <SectionTitle>Variables</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(vars) as (keyof typeof vars)[]).map((key) => (
              <label key={key} className="block">
                <div className="mb-1 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">{`{{${key}}}`}</div>
                <Input
                  value={vars[key]}
                  onChange={(event) => setVars({ ...vars, [key]: event.target.value })}
                  data-testid={`input-var-${key}`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
            Business defaults load from settings when available: {settings?.businessName ?? "Clean Plate Hauling Co."}
          </div>
        </section>

        <section className="rounded-xl border border-card-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <SectionTitle className="mb-0">Script library</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {kinds.map((kind) => (
                <button
                  key={kind}
                  onClick={() => setActiveKind(kind)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    activeKind === kind ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover-elevate",
                  )}
                  data-testid={`tab-kind-${kind}`}
                >
                  {KIND_LABELS[kind] || kind}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {filteredScripts.map((follow) => {
              const Icon = CHANNEL_ICON[follow.channel] || MessageSquare;
              const rendered = renderTemplate(follow.body, vars);
              return (
                <div key={follow.id} className="rounded-lg border border-card-border bg-background/30 overflow-hidden" data-testid={`script-${follow.id}`}>
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-accent" />
                      <div className="text-sm font-medium">{follow.title}</div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{follow.channel}</Badge>
                    </div>
                    <button
                      onClick={() => copyText(rendered)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground hover-elevate"
                      data-testid={`button-copy-${follow.id}`}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <div className="p-4 font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{rendered}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Tip title="Work overdue first" body="These are the leads most likely to fall through the cracks. Clear the red queue before adding new work." />
        <Tip title="Copy, text, log" body="Send the message, then mark followed up so the next action date is always current." />
        <Tip title="Book or reschedule" body="Every lead should end the day with a booked job, a lost stage, or a next action date." />
      </div>
    </>
  );
}

function CommandStat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 premium-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className={cn("mt-1 font-display text-2xl font-black num", tone)}>{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function LeadCommandCard({
  lead, active, disabled, onSelect, onCopy, onComplete, onTomorrow,
}: {
  lead: CommandLead;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onComplete: () => void;
  onTomorrow: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background/35 p-4 transition-colors",
        active ? "border-accent/60 shadow-lg shadow-accent/5" : "border-border hover:border-accent/35",
      )}
      data-testid={`followup-lead-${lead.id}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg font-black leading-tight">{lead.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{lead.jobType} · {lead.city} · {lead.phone}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={lead.urgency} />
            <Badge variant="outline" className="capitalize">{lead.stage.replace("_", " ")}</Badge>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Mini label="Value" value={fmtMoney(Number(lead.estimatedValue) || 0)} />
          <Mini label="Next" value={lead.nextAction || "Follow up"} />
          <Mini label="Date" value={lead.nextActionDate || "Set date"} />
        </div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover-elevate"><Phone className="h-3.5 w-3.5" /> Call</a>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onCopy}><ClipboardCheck className="h-3.5 w-3.5" /> Copy text</Button>
        <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={onTomorrow} disabled={disabled}><TimerReset className="h-3.5 w-3.5" /> Tomorrow</Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onComplete} disabled={disabled}><CheckCircle2 className="h-3.5 w-3.5" /> Done</Button>
      </div>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: CommandLead["urgency"] }) {
  const styles = {
    overdue: "border-red-500/40 bg-red-500/10 text-red-300",
    today: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    upcoming: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    unscheduled: "border-muted bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={cn("capitalize", styles[urgency])}>{urgency}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold">{value}</div>
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <CheckCircle2 className="mb-2 h-4 w-4 text-accent" />
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs leading-snug text-muted-foreground">{body}</div>
    </div>
  );
}
