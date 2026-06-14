import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Truck, Users, DollarSign, Target, BarChart3, Flame, TrendingUp,
  Trash2, AlertTriangle, ArrowRight, MapPin, Clock, ShieldCheck, Phone, Globe2, CheckCircle2, Zap,
  CalendarCheck, MessageSquareText, ClipboardList, Radio,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Area, AreaChart, XAxis, YAxis, Tooltip,
} from "recharts";
import type { Lead, Job, Settings as SettingsT } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STAGE_LABEL: Record<string, string> = {
  new: "New Lead",
  quote_sent: "Quote Sent",
  booked: "Booked",
  completed: "Completed",
  follow_up: "Needs Follow-up",
  lost: "Lost",
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function KpiCard({
  label, value, sub, icon: Icon, accent, spark, testid,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  accent?: boolean;
  spark?: number[];
  testid?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card border-card-border p-4 relative overflow-hidden",
        accent && "ring-1 ring-accent/40"
      )}
      data-testid={testid}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", accent ? "text-accent" : "text-muted-foreground")} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="font-display font-bold text-2xl num" data-testid={testid && `${testid}-value`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div className="h-9 -mx-1 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))}>
              <defs>
                <linearGradient id={`grad-${label}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area dataKey="v" stroke="hsl(var(--accent))" strokeWidth={1.5} fill={`url(#grad-${label})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });
  const { data: liveOps } = useQuery<any>({ queryKey: ["/api/live-ops"], refetchInterval: 60000 });

  const today = new Date().toISOString().slice(0, 10);
  const todaysJobs = jobs.filter(j => j.scheduledDate === today);
  const openLeads = leads.filter(l => ["new", "quote_sent", "follow_up"].includes(l.stage));
  const bookedRevenue = jobs
    .filter(j => j.status !== "cancelled")
    .reduce((s, j) => s + j.estimatedRevenue, 0);
  const estimatedPipelineRevenue = openLeads.reduce((s, l) => s + l.estimatedValue, 0);

  const completed = leads.filter(l => l.stage === "completed").length;
  const totalQuoted = leads.filter(l => ["quote_sent", "booked", "completed", "lost"].includes(l.stage)).length;
  const closeRate = totalQuoted > 0 ? Math.round((leads.filter(l => l.stage === "completed" || l.stage === "booked").length / totalQuoted) * 100) : 0;

  const completedJobs = jobs.filter(j => j.status === "completed");
  const avgJob = completedJobs.length > 0
    ? completedJobs.reduce((s, j) => s + j.estimatedRevenue, 0) / completedJobs.length
    : 0;

  // Crew utilization: today's jobs vs total crews
  const crewIds = new Set(todaysJobs.map(j => j.crewId).filter(Boolean));
  const utilization = Math.min(100, Math.round((todaysJobs.length / 4) * 100)); // 4 ideal slots

  // Dump fee estimate today
  const dumpFeeToday = settings ? todaysJobs.reduce((s, j) => {
    const loads = Math.max(1, Math.ceil(j.truckFillPct / 100));
    return s + loads * settings.dumpFeePerLoad;
  }, 0) : 0;

  // Follow-up alerts
  const followUpsDue = leads.filter(l => {
    if (!l.nextActionDate) return false;
    return l.nextActionDate <= today && !["completed", "lost"].includes(l.stage);
  });

  // 7-day revenue trend (fake but plausible from job dates)
  const days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const value = jobs
      .filter(j => j.scheduledDate === key && j.status !== "cancelled")
      .reduce((s, j) => s + j.estimatedRevenue, 0);
    days.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }), value });
  }

  // Stage funnel
  const funnel: { stage: string; count: number }[] = [
    "new", "quote_sent", "booked", "completed", "lost",
  ].map(stage => ({ stage: STAGE_LABEL[stage], count: leads.filter(l => l.stage === stage).length }));

  // Lead sources
  const sourceMap: Record<string, number> = {};
  leads.forEach(l => { sourceMap[l.source] = (sourceMap[l.source] || 0) + l.estimatedValue; });
  const sources = Object.entries(sourceMap).map(([source, value]) => ({ source, value })).sort((a, b) => b.value - a.value);

  const hotLeads = openLeads
    .map(l => ({ ...l, urgencyScore: (l.estimatedValue || 0) + (l.stage === "quote_sent" ? 250 : 0) + (l.nextActionDate && l.nextActionDate <= today ? 300 : 0) }))
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 4);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const tomorrowJobs = jobs.filter(j => j.scheduledDate === tomorrowKey && j.status !== "cancelled");
  const atRiskValue = followUpsDue.reduce((sum, lead) => sum + (lead.estimatedValue || 0), 0);
  const commandActions = [
    {
      title: followUpsDue.length > 0 ? "Clear follow-ups" : "Keep follow-ups clean",
      body: followUpsDue.length > 0 ? `${followUpsDue.length} lead${followUpsDue.length === 1 ? "" : "s"} need action worth ${fmtMoney(atRiskValue)}.` : "No follow-ups due right now. Keep the queue warm.",
      href: "/follow-ups",
      icon: MessageSquareText,
      cta: "Open follow-ups",
      tone: "border-amber-500/30 bg-amber-500/10",
    },
    {
      title: todaysJobs.length > 0 ? "Run today’s jobs" : "Fill today’s board",
      body: todaysJobs.length > 0 ? `${todaysJobs.length} job${todaysJobs.length === 1 ? "" : "s"} scheduled today with ${fmtMoney(todaysJobs.reduce((sum, job) => sum + job.estimatedRevenue, 0))} on deck.` : "No jobs today. Use the pipeline and quote tool to create movement.",
      href: "/dispatch",
      icon: Truck,
      cta: "Open dispatch",
      tone: "border-accent/30 bg-accent/10",
    },
    {
      title: "Convert hot leads",
      body: hotLeads.length > 0 ? `${hotLeads[0].name} is the top open opportunity at ${fmtMoney(hotLeads[0].estimatedValue || 0)}.` : "No hot open leads yet. Add or sync CRM leads.",
      href: "/leads",
      icon: CalendarCheck,
      cta: "Open pipeline",
      tone: "border-emerald-500/30 bg-emerald-500/10",
    },
  ];

  const spark = days.map(d => d.value || 0);

  return (
    <>
      <PageHeader
        eyebrow={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · ${settings?.homeBase || "Wixom, MI"}`}
        title="Command Center"
        description="Live read on jobs rolling today, leads in motion, and what the books look like by end of week."
        actions={
          <Link href="/dispatch" data-testid="button-go-dispatch" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-accent text-accent-foreground hover-elevate active-elevate-2">
            Open Dispatch <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <section className="green-command-hero premium-panel rounded-2xl border border-accent/25 p-5 lg:p-6 mb-6 overflow-hidden" data-testid="section-command-upgrade-hero">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr] items-stretch">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="command-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em]">
                <ShieldCheck className="h-3.5 w-3.5" /> CRM connected
              </span>
              <span className="command-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em]">
                Veteran owned · Wixom + Metro Detroit
              </span>
            </div>
            <div>
              <h2 className="max-w-4xl font-display text-3xl md:text-5xl font-black tracking-[-0.045em] leading-[0.96]">
                Clean Plate revenue cockpit for quotes, crews, follow-ups, and AI-backed owner decisions.
              </h2>
              <p className="mt-4 max-w-2xl text-sm md:text-base text-white/72 leading-relaxed">
                Built around the same promise as the website: photo-first quotes, flat-rate pricing, no hidden fees, and a clean finish on every job. Your CRM now sits inside a sharper command center instead of a plain spreadsheet.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Photo quote speed", "Text photos → firm price"],
                ["Owner control", "No risky automations without approval"],
                ["Green plate brand", "Black/white logo + high-vis green"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-white/[0.055] p-3 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {title}
                  </div>
                  <div className="mt-1 text-[12px] text-white/62">{body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-glow-card rounded-2xl p-4 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/48">Next best actions</div>
                <div className="mt-1 font-display text-xl font-black">Today’s owner stack</div>
              </div>
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <div className="space-y-2">
              <ActionLine label="Call / text" value="734-743-1877" icon={Phone} />
              <ActionLine label="Website" value="cleanplatehaulingco.com" icon={Globe2} />
              <ActionLine label="Follow-ups due" value={`${followUpsDue.length} lead${followUpsDue.length === 1 ? "" : "s"}`} icon={Users} />
              <ActionLine label="Pipeline at risk" value={fmtMoney(estimatedPipelineRevenue)} icon={DollarSign} />
            </div>
            <div className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-xs leading-relaxed text-white/70">
              AI Brain should now be used like an ops partner: score stale leads, draft invoice text, recommend pricing guardrails, and turn CRM patterns into owner-approved Builder actions.
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]" data-testid="section-owner-command-board">
        <div className="rounded-2xl border border-card-border bg-card p-5 premium-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <SectionTitle className="mb-1">Owner command board</SectionTitle>
              <p className="text-xs text-muted-foreground">The next three moves to protect revenue, run the day, and convert the best leads.</p>
            </div>
            <Badge variant="outline" className="gap-1.5 border-accent/40 text-accent">
              <Radio className="h-3.5 w-3.5" /> Live ops
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {commandActions.map((action) => (
              <Link key={action.title} href={action.href} className={cn("block rounded-xl border p-4 hover-elevate", action.tone)} data-testid={`owner-action-${action.title.toLowerCase().replaceAll(" ", "-")}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/70 text-accent">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-4 font-display text-lg font-black leading-tight">{action.title}</div>
                <div className="mt-2 min-h-[48px] text-xs leading-relaxed text-muted-foreground">{action.body}</div>
                <div className="mt-3 text-xs font-semibold text-accent">{action.cta}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-card p-5 premium-panel">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <SectionTitle className="mb-1">AI ops signal</SectionTitle>
              <p className="text-xs text-muted-foreground">Live recommendations from your CRM, dispatch, pricing, and weather context.</p>
            </div>
            <Zap className="h-5 w-5 text-accent" />
          </div>
          <div className="space-y-2">
            {(liveOps?.recommendations?.length ? liveOps.recommendations.slice(0, 3) : [
              { title: "Work the follow-up queue", action: "Use Follow-ups to text every due quote before chasing new leads.", impact: "Higher close rate" },
              { title: "Confirm tomorrow", action: `${tomorrowJobs.length} job${tomorrowJobs.length === 1 ? "" : "s"} currently on tomorrow’s board.`, impact: "Cleaner dispatch" },
            ]).map((item: any, index: number) => (
              <div key={`${item.title}-${index}`} className="rounded-xl border border-border bg-background/45 p-3" data-testid={`ai-ops-signal-${index}`}>
                <div className="flex items-start gap-2">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.action}</div>
                    {item.impact && <div className="mt-1 text-[11px] font-medium text-emerald-300">Impact: {item.impact}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Jobs Today" value={String(todaysJobs.length)} sub={`${crewIds.size} crew${crewIds.size === 1 ? "" : "s"} out`} icon={Truck} accent testid="kpi-jobs-today" />
        <KpiCard label="Open Leads" value={String(openLeads.length)} sub={`${followUpsDue.length} due today`} icon={Users} testid="kpi-open-leads" />
        <KpiCard label="Booked Revenue" value={fmtMoney(bookedRevenue)} sub="All active jobs" icon={DollarSign} testid="kpi-booked-revenue" />
        <KpiCard label="Pipeline Revenue" value={fmtMoney(estimatedPipelineRevenue)} sub="In active leads" icon={TrendingUp} testid="kpi-pipeline-revenue" spark={spark} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <KpiCard label="Close Rate" value={`${closeRate}%`} sub={`${completed} jobs completed`} icon={Target} testid="kpi-close-rate" />
        <KpiCard label="Avg Job" value={fmtMoney(avgJob)} sub="From completed work" icon={BarChart3} testid="kpi-avg-job" />
        <KpiCard label="Crew Utilization" value={`${utilization}%`} sub="vs. 4 daily slots" icon={Flame} testid="kpi-utilization" />
        <KpiCard label="Dump Fees Today" value={fmtMoney(dumpFeeToday)} sub="Est. by truck fill" icon={Trash2} testid="kpi-dump-fees" />
      </div>

      {/* Today’s Run + Follow-up alerts */}
      <div className="grid lg:grid-cols-3 gap-3 mt-6">
        <div className="lg:col-span-2 rounded-lg border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle className="mb-0">Today’s run sheet</SectionTitle>
            <Link href="/dispatch" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" data-testid="link-todays-run-all">
              All dispatch <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {todaysJobs.length === 0 ? (
            <EmptyRow text="No jobs on the books for today. Solid day to chase leads." />
          ) : (
            <div className="space-y-2">
              {todaysJobs.map(j => (
                <div key={j.id} className="flex items-center gap-4 rounded-md border border-border bg-background/50 p-3 hover-elevate" data-testid={`row-todays-job-${j.id}`}>
                  <div className="font-mono text-[11px] tracking-wider text-accent shrink-0 w-[120px]">{j.timeWindow}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{j.customerName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />{j.address}, {j.city}
                    </div>
                  </div>
                  <div className="hidden sm:block text-xs text-muted-foreground">{j.jobType}</div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-sm num">{fmtMoney(j.estimatedRevenue)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{j.truckFillPct}% fill</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-card-border bg-card p-5">
          <SectionTitle>Follow-up alerts</SectionTitle>
          {followUpsDue.length === 0 ? (
            <EmptyRow text="Inbox clean. No follow-ups due." />
          ) : (
            <div className="space-y-2">
              {followUpsDue.slice(0, 6).map(l => (
                <Link
                  key={l.id}
                  href="/leads"
                  data-testid={`row-followup-${l.id}`}
                  className="block rounded-md border border-border bg-background/50 p-3 hover-elevate"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-accent/40 text-accent">
                      {STAGE_LABEL[l.stage]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {l.nextAction || "Action needed"}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{l.nextActionDate} · {l.city}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-2 rounded-lg border border-card-border bg-card p-5">
          <SectionTitle>Booked revenue, 7-day arc</SectionTitle>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any) => [fmtMoney(v as number), "Revenue"]}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--accent))" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-card-border bg-card p-5">
          <SectionTitle>Lead funnel</SectionTitle>
          <div className="h-44 flex flex-col justify-center gap-3">
            {funnel.map(item => {
              const max = Math.max(1, ...funnel.map(f => f.count));
              const width = item.count === 0 ? 8 : Math.max(12, (item.count / max) * 100);
              return (
                <div key={item.stage} className="grid grid-cols-[88px_1fr_24px] items-center gap-2" data-testid={`funnel-row-${item.stage.replace(/\W/g, "-").toLowerCase()}`}>
                  <div className="text-[11px] text-muted-foreground text-right truncate">{item.stage}</div>
                  <div className="h-5 rounded bg-muted/45 overflow-hidden">
                    <div
                      className={cn("h-full rounded-r", item.count === 0 ? "bg-muted-foreground/35" : "bg-accent")}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground num text-right">{item.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className="rounded-lg border border-card-border bg-card p-5">
          <SectionTitle>Where the work comes from</SectionTitle>
          <ul className="space-y-2.5 mt-2">
            {sources.map(s => {
              const max = sources[0]?.value || 1;
              return (
                <li key={s.source} data-testid={`row-source-${s.source}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{s.source}</span>
                    <span className="num text-muted-foreground">{fmtMoney(s.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(s.value / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <SectionTitle className="mb-0">Profit safety check</SectionTitle>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Target margin {settings?.targetMarginPct ?? 55}%</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Quick gut-check on what every truck-load needs to clear after dump fees and labor. Tighten the screws under Settings.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Dump fee / load" value={fmtMoney(settings?.dumpFeePerLoad ?? 0)} />
            <MiniStat label="Labor / hr" value={fmtMoney(settings?.laborHourlyRate ?? 0)} />
            <MiniStat label="Min job" value={fmtMoney(settings?.minimumJobPrice ?? 0)} />
            <MiniStat label="Capacity" value={`${settings?.crewCapacityYards ?? 0} yd³`} />
          </div>
          {followUpsDue.length > 3 && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">{followUpsDue.length} follow-ups overdue</div>
                <div className="text-muted-foreground">Cold leads cost more than dump runs. Hit the Pipeline view and clear the queue.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}


function ActionLine({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-lg shadow-black/20">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/42">{label}</div>
        <div className="truncate text-sm font-semibold text-white/90">{value}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/60 border border-border p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg num mt-1">{value}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground italic p-4 text-center rounded-md border border-dashed border-border">{text}</div>;
}
