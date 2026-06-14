import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Truck, Users, DollarSign, Target, BarChart3, Flame, TrendingUp,
  Trash2, AlertTriangle, ArrowRight, MapPin, Clock,
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
