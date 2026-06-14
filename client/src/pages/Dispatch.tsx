import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Job, Crew } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck, MapPin, ClipboardCheck, Phone, ChevronLeft, ChevronRight, ReceiptText, Mail, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS = [
  { key: "scheduled", label: "Scheduled", tone: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  { key: "en_route", label: "En route", tone: "bg-accent text-accent-foreground" },
  { key: "on_site", label: "On site", tone: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  { key: "completed", label: "Completed", tone: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
  { key: "cancelled", label: "Cancelled", tone: "bg-destructive/10 text-destructive border border-destructive/30" },
];

const CHECKLIST_ITEMS = [
  { key: "dolly", label: "Dolly + appliance cart" },
  { key: "straps", label: "Ratchet straps" },
  { key: "blankets", label: "Moving blankets" },
  { key: "sawzall", label: "Sawzall + battery" },
  { key: "gloves", label: "Cut-resistant gloves" },
  { key: "dumpRunReserved", label: "Dump run slot reserved" },
];

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function shortDate(d: string) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function Dispatch() {
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: crews = [] } = useQuery<Crew[]>({ queryKey: ["/api/crews"] });
  const { toast } = useToast();
  const [offset, setOffset] = useState(0); // day offset from today

  const updateJob = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }),
  });

  const receiptMutation = useMutation({
    mutationFn: async (job: Job) => {
      const res = await apiRequest("POST", "/api/receipts", {
        jobId: job.id,
        customerName: job.customerName,
        phone: job.phone,
        address: job.address,
        city: job.city,
        amount: Number(job.estimatedRevenue) || 0,
        paymentMethod: "Pending",
        dumpFee: 85,
        laborCost: 90,
        resaleValue: 0,
        scrapValue: 0,
        recycleCredit: 0,
        donationValue: 0,
        otherRecovery: 0,
        beforePhotoName: "before-photo-pending",
        afterPhotoName: "after-photo-pending",
        proofNotes: `Completed ${job.jobType}. Truck fill ${job.truckFillPct}%. Area swept and cleared before departure.`,
      });
      return res.json();
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Branded receipt created", description: `${receipt.receiptNumber} is ready in AI Brain proof records.` });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: async (job: Job) => {
      const res = await apiRequest("POST", "/api/invoices", {
        customerName: job.customerName,
        email: "",
        phone: job.phone,
        address: job.address,
        city: job.city,
        jobId: job.id,
        lineItems: [{ description: `${job.jobType} hauling service`, quantity: 1, unitPrice: Number(job.estimatedRevenue) || 0 }],
        tax: 0,
        dueDate: addDays(7),
        notes: `Thank you for choosing Clean Plate Hauling Co. Job date: ${shortDate(job.scheduledDate)}.`,
      });
      return res.json();
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: "Invoice draft created", description: `${invoice.invoiceNumber} is ready for owner review and Gmail approval.` });
    },
  });

  const today = new Date();
  const days = useMemo(() => {
    const arr: { date: string; label: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset + i);
      arr.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) });
    }
    return arr;
  }, [offset]);

  const totalRevenue = jobs
    .filter(j => days.some(d => d.date === j.scheduledDate) && j.status !== "cancelled")
    .reduce((s, j) => s + j.estimatedRevenue, 0);

  return (
    <>
      <PageHeader
        eyebrow="Dispatch"
        title="Run sheet"
        description="Day-by-day route board. Reassign crews, flag truck fill, run the readiness checklist before each crew rolls."
        actions={
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{fmtMoney(totalRevenue)} on the board</div>
            <button className="rounded-md border border-border p-1.5 hover-elevate" onClick={() => setOffset(o => o - 5)} data-testid="button-prev-days"><ChevronLeft className="h-4 w-4" /></button>
            <button className="rounded-md border border-border p-1.5 hover-elevate" onClick={() => setOffset(o => o + 5)} data-testid="button-next-days"><ChevronRight className="h-4 w-4" /></button>
          </div>
        }
      />

      <div className="space-y-4">
        {days.map(day => {
          const dayJobs = jobs.filter(j => j.scheduledDate === day.date).sort((a, b) => a.timeWindow.localeCompare(b.timeWindow));
          const dayRevenue = dayJobs.filter(j => j.status !== "cancelled").reduce((s, j) => s + j.estimatedRevenue, 0);
          const isToday = day.date === today.toISOString().slice(0, 10);
          return (
            <div key={day.date} className={cn("rounded-lg border bg-card p-4", isToday ? "border-accent/40" : "border-card-border")} data-testid={`day-${day.date}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "font-display font-bold text-sm uppercase tracking-wider",
                    isToday ? "text-accent" : "text-foreground"
                  )}>
                    {isToday ? "Today · " : ""}{day.label}
                  </div>
                  <span className="text-xs text-muted-foreground num">{dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}</span>
                </div>
                <div className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase num">{fmtMoney(dayRevenue)}</div>
              </div>

              {dayJobs.length === 0 ? (
                <div className="text-xs text-muted-foreground italic p-4 text-center rounded-md border border-dashed border-border">
                  Open day. Push leads from the Pipeline.
                </div>
              ) : (
                <div className="space-y-2">
                  {dayJobs.map(job => (
                    <JobRow
                      key={job.id}
                      job={job}
                      crews={crews}
                      onChange={(data) => updateJob.mutate({ id: job.id, data })}
                      onCreateReceipt={() => receiptMutation.mutate(job)}
                      onCreateInvoice={() => invoiceMutation.mutate(job)}
                      isCreatingReceipt={receiptMutation.isPending}
                      isCreatingInvoice={invoiceMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function JobRow({
  job, crews, onChange, onCreateReceipt, onCreateInvoice, isCreatingReceipt, isCreatingInvoice,
}: {
  job: Job;
  crews: Crew[];
  onChange: (data: any) => void;
  onCreateReceipt: () => void;
  onCreateInvoice: () => void;
  isCreatingReceipt: boolean;
  isCreatingInvoice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS.find(s => s.key === job.status) || STATUS[0];
  let checklist: Record<string, boolean> = {};
  try { checklist = job.checklist ? JSON.parse(job.checklist) : {}; } catch {}

  const totalChecks = CHECKLIST_ITEMS.length;
  const doneChecks = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length;
  const ready = doneChecks === totalChecks;

  const toggleCheck = (key: string) => {
    const next = { ...checklist, [key]: !checklist[key] };
    onChange({ checklist: JSON.stringify(next) });
  };

  return (
    <div className="rounded-md border border-border bg-background/40 overflow-hidden" data-testid={`job-${job.id}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="font-mono text-[11.5px] text-accent shrink-0 w-[120px]" data-testid={`text-time-${job.id}`}>{job.timeWindow}</div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-medium flex items-center gap-2">
            {job.customerName}
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider", status.tone)}>
              {status.label}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.address}, {job.city}</span>
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{job.phone}</span>
          </div>
        </div>
        <div className="hidden md:block text-[11px] text-muted-foreground">{job.jobType}</div>
        <div className="text-center shrink-0 w-[90px]">
          <div className="font-display font-bold text-sm num">{job.truckFillPct}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Truck fill</div>
        </div>
        <div className="text-right shrink-0 w-[90px]">
          <div className="font-display font-bold text-sm num">{fmtMoney(job.estimatedRevenue)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">est.</div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Select value={String(job.crewId ?? "")} onValueChange={(v) => onChange({ crewId: Number(v) })}>
            <SelectTrigger className="h-8 text-xs w-[130px]" data-testid={`select-crew-${job.id}`}><SelectValue placeholder="Assign crew" /></SelectTrigger>
            <SelectContent>
              {crews.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={job.status} onValueChange={(v) => onChange({ status: v })}>
            <SelectTrigger className="h-8 text-xs w-[120px]" data-testid={`select-status-${job.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border",
            ready
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-muted text-muted-foreground border-border hover-elevate"
          )}
          data-testid={`button-checklist-${job.id}`}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {doneChecks}/{totalChecks} ready
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background/30 px-4 py-3">
          <SectionTitle>Dispatch readiness</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mt-2">
            {CHECKLIST_ITEMS.map(item => (
              <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`checklist-${job.id}-${item.key}`}>
                <Checkbox checked={!!checklist[item.key]} onCheckedChange={() => toggleCheck(item.key)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-accent/25 bg-accent/10 p-3" data-testid={`closeout-${job.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Closeout documents</div>
                <div className="text-xs text-muted-foreground">Generate branded proof and invoice drafts from this run-sheet job.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="gap-2" onClick={onCreateReceipt} disabled={isCreatingReceipt} data-testid={`button-job-receipt-${job.id}`}>
                  <ReceiptText className="h-3.5 w-3.5" /> {isCreatingReceipt ? "Creating..." : "Create receipt"}
                </Button>
                <Button size="sm" className="gap-2" onClick={onCreateInvoice} disabled={isCreatingInvoice} data-testid={`button-job-invoice-${job.id}`}>
                  <Mail className="h-3.5 w-3.5" /> {isCreatingInvoice ? "Drafting..." : "Draft invoice"}
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => onChange({ status: "completed" })} data-testid={`button-job-complete-${job.id}`}>
                  <FileCheck2 className="h-3.5 w-3.5" /> Mark complete
                </Button>
              </div>
            </div>
          </div>

          {job.notes && (
            <div className="mt-3 pt-3 border-t border-border text-xs">
              <span className="font-mono uppercase tracking-wider text-muted-foreground">Notes:</span>{" "}
              <span className="text-foreground/80">{job.notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
