import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Phone, MapPin, Plus, Database, RefreshCw, Calculator, Pencil, Save, Mail, MessageSquareText, ClipboardCheck, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STAGES = [
  { key: "new", label: "New Lead", tone: "bg-accent text-accent-foreground" },
  { key: "quote_sent", label: "Quote Sent", tone: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  { key: "booked", label: "Booked", tone: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
  { key: "completed", label: "Completed", tone: "bg-muted text-muted-foreground border border-border" },
  { key: "follow_up", label: "Needs Follow-up", tone: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  { key: "lost", label: "Lost", tone: "bg-destructive/10 text-destructive border border-destructive/30" },
];

const JOB_TYPES = ["Garage Cleanout", "Estate", "Hot Tub", "Construction Debris", "Furniture", "Appliance", "Yard", "Full Property"];
const SOURCES = ["Google", "Referral", "Facebook", "Yelp", "Repeat", "Other"];

type PipelineLead = Lead & {
  sheetRowNumber?: number;
  syncSource?: "google_sheet" | "local_fallback";
  syncWarning?: string;
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function Pipeline() {
  const {
    data: leads = [],
    refetch,
    isFetching,
  } = useQuery<PipelineLead[]>({
    queryKey: ["/api/leads"],
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [editingLead, setEditingLead] = useState<PipelineLead | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Lead> }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setEditingLead(null);
      toast({ title: "Lead updated", description: "Pipeline and Google Sheets CRM are synced." });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "The lead update did not write to Google Sheets. Try refresh and update again.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", data.jobEntry ? "/api/leads-with-job-entry" : "/api/leads", data.jobEntry ? data : data.lead ?? data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Saved to Sheets", description: "Lead went to CRM. Job details went to Job Entry when included." });
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (lead: PipelineLead) => {
      const jobRes = await apiRequest("POST", "/api/jobs", {
        leadId: lead.id,
        customerName: lead.name,
        phone: lead.phone,
        address: lead.address || `${lead.city} area`,
        city: lead.city,
        scheduledDate: addDays(1),
        timeWindow: "8:00 AM – 10:00 AM",
        crewId: null,
        truckFillPct: 50,
        jobType: lead.jobType,
        status: "scheduled",
        estimatedRevenue: Number(lead.estimatedValue) || 0,
        notes: lead.notes || "Converted from Lead Profile quick book.",
        checklist: JSON.stringify({ photos: true, callAhead: true, floorProtection: true }),
      });
      const job = await jobRes.json();
      const leadRes = await apiRequest("PATCH", `/api/leads/${lead.id}`, {
        stage: "booked",
        nextAction: "Confirm arrival window and access notes",
        nextActionDate: addDays(1),
      });
      return { job, lead: await leadRes.json() };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setEditingLead(null);
      toast({ title: "Job booked", description: "Lead converted to a scheduled dispatch job for tomorrow." });
    },
    onError: () => {
      toast({ title: "Booking failed", description: "Could not convert this lead to a job. Check required address/city details and try again.", variant: "destructive" });
    },
  });

  const liveSheetRows = leads.filter(l => l.syncSource === "google_sheet").length;
  const isFallback = leads.some(l => l.syncSource === "local_fallback");

  const filtered = leads.filter(l => {
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.jobType.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Lead command"
        description="Live from your Google Sheets CRM. Sheet changes appear here automatically, and stage updates here write back to the CRM tab."
        actions={
          <>
            <Badge variant="outline" className="h-9 gap-1.5 px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-300" data-testid="status-live-sheets">
              <Database className="h-3.5 w-3.5" />
              {isFallback ? "Local fallback" : `${liveSheetRows} live sheet row${liveSheetRows === 1 ? "" : "s"}`}
            </Badge>
            <Button
              variant="outline"
              className="h-9 text-xs gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-sheets"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setView("board")}
                className={cn("px-3 py-1.5 text-xs font-medium", view === "board" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover-elevate")}
                data-testid="button-view-board"
              >Board</button>
              <button
                onClick={() => setView("table")}
                className={cn("px-3 py-1.5 text-xs font-medium", view === "table" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover-elevate")}
                data-testid="button-view-table"
              >Table</button>
            </div>
            <NewLeadDialog onCreate={(d) => createMutation.mutate(d)} />
          </>
        }
      />

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, city, phone, job type"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
            data-testid="input-search-leads"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px] h-9 text-sm" data-testid="select-stage-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground font-mono tracking-wider uppercase" data-testid="text-filtered-count">
          {filtered.length} of {leads.length}
        </div>
        <div className="text-xs text-muted-foreground" data-testid="text-sync-note">
          {isFallback ? "Sheets connection is temporarily unavailable; showing local fallback." : "Auto-refreshes every 30 seconds."}
        </div>
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STAGES.map(stage => {
            const stageLeads = filtered.filter(l => l.stage === stage.key);
            const stageValue = stageLeads.reduce((s, l) => s + l.estimatedValue, 0);
            return (
              <div key={stage.key} className="rounded-lg border border-card-border bg-card p-4" data-testid={`column-${stage.key}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-mono uppercase tracking-wider", stage.tone)}>
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground num">{stageLeads.length}</span>
                  </div>
                  <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground num">{fmtMoney(stageValue)}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.length === 0 && (
                    <div className="text-xs text-muted-foreground italic p-3 text-center rounded-md border border-dashed border-border">
                      Empty
                    </div>
                  )}
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onOpenEdit={() => setEditingLead(lead)} onChangeStage={(stage) => updateMutation.mutate({ id: lead.id, patch: { stage } })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-card-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider font-mono">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell">City</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Job</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Source</th>
                <th className="text-right px-4 py-2.5">Value</th>
                <th className="text-left px-4 py-2.5">Stage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} className="border-t border-border hover-elevate cursor-pointer" onClick={() => setEditingLead(lead)} data-testid={`row-lead-${lead.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-xs text-muted-foreground">{lead.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{lead.city}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{lead.jobType}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{lead.source}</td>
                  <td className="px-4 py-3 text-right num font-medium">{fmtMoney(lead.estimatedValue)}</td>
                  <td className="px-4 py-3">
                    <Select value={lead.stage} onValueChange={(stage) => updateMutation.mutate({ id: lead.id, patch: { stage } })}>
                      <SelectTrigger className="h-8 text-xs w-[150px]" onClick={(e) => e.stopPropagation()} data-testid={`select-stage-${lead.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadEditDialog
        lead={editingLead}
        open={!!editingLead}
        onOpenChange={(open) => !open && setEditingLead(null)}
        onSave={(id, patch) => updateMutation.mutate({ id, patch })}
        onBook={(lead) => bookMutation.mutate(lead)}
        isSaving={updateMutation.isPending}
        isBooking={bookMutation.isPending}
      />
    </>
  );
}

function LeadCard({ lead, onChangeStage, onOpenEdit }: { lead: PipelineLead; onChangeStage: (stage: string) => void; onOpenEdit: () => void }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3 hover-elevate cursor-pointer" onClick={onOpenEdit} data-testid={`card-lead-${lead.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{lead.name}</div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.city}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-bold text-sm num">{fmtMoney(lead.estimatedValue)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{lead.source}</div>
        </div>
      </div>

      <div className="mt-2 text-[11.5px] text-foreground/80 flex items-center gap-1.5">
        <span className="inline-block w-1 h-1 rounded-full bg-accent"></span>
        <span className="truncate">{lead.jobType}</span>
        {lead.nextAction && <span className="text-muted-foreground truncate">· {lead.nextAction}</span>}
      </div>

      {lead.sheetRowNumber && (
        <div className="mt-2 text-[10px] uppercase tracking-wider text-emerald-300/80" data-testid={`text-sheet-row-${lead.id}`}>
          CRM row {lead.sheetRowNumber}
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-border flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-[11px]" onClick={onOpenEdit} data-testid={`button-edit-lead-${lead.id}`}><Pencil className="h-3 w-3" /> Edit</Button>
        <Select value={lead.stage} onValueChange={onChangeStage}>
          <SelectTrigger className="h-7 text-[11px] w-full" data-testid={`select-card-stage-${lead.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}


function LeadEditDialog({
  lead, open, onOpenChange, onSave, onBook, isSaving, isBooking,
}: {
  lead: PipelineLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, patch: Partial<Lead>) => void;
  onBook: (lead: PipelineLead) => void;
  isSaving: boolean;
  isBooking: boolean;
}) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", city: "", address: "",
    source: "Google", jobType: "Garage Cleanout", estimatedValue: 0,
    stage: "new", nextAction: "", nextActionDate: "", notes: "",
  });

  useEffect(() => {
    if (!lead) return;
    setForm({
      name: lead.name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      city: lead.city ?? "",
      address: lead.address ?? "",
      source: lead.source ?? "Google",
      jobType: lead.jobType ?? "Garage Cleanout",
      estimatedValue: lead.estimatedValue ?? 0,
      stage: lead.stage ?? "new",
      nextAction: lead.nextAction ?? "",
      nextActionDate: lead.nextActionDate ?? "",
      notes: lead.notes ?? "",
    });
  }, [lead]);

  const followUpLabel = form.nextActionDate
    ? form.nextActionDate <= new Date().toISOString().slice(0, 10) ? "Due now" : `Due ${form.nextActionDate}`
    : "No date set";
  const quoteText = `Hi ${form.name || "there"}, this is Clean Plate Hauling Co. I wanted to follow up on your ${form.jobType || "junk removal"} request in ${form.city || "your area"}. If you can text a few photos, I can lock in a clean quote and timing.`;
  const smsHref = `sms:${form.phone}?&body=${encodeURIComponent(quoteText)}`;
  const emailHref = `mailto:${form.email || ""}?subject=${encodeURIComponent(`Clean Plate Hauling Co. — ${form.jobType || "junk removal"}`)}&body=${encodeURIComponent(quoteText)}`;

  const save = () => {
    if (!lead) return;
    onSave(lead.id, {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      city: form.city,
      address: form.address || null,
      source: form.source,
      jobType: form.jobType,
      estimatedValue: Number(form.estimatedValue) || 0,
      stage: form.stage,
      nextAction: form.nextAction || null,
      nextActionDate: form.nextActionDate || null,
      notes: form.notes || null,
    } as Partial<Lead>);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-lead">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-accent" /> Lead profile</DialogTitle>
          <DialogDescription>Click any lead card or table row to open this command profile. Edit the CRM row, launch follow-up actions, and keep the next move visible.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
          <aside className="space-y-3">
            <div className="rounded-xl border border-accent/25 bg-accent/10 p-4" data-testid="lead-profile-summary">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xl font-black leading-tight">{form.name || "Unnamed lead"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{form.jobType} · {form.city || "No city"}</div>
                </div>
                <div className="rounded-lg bg-background/70 px-2.5 py-1 text-right">
                  <div className="font-display font-bold num">{fmtMoney(Number(form.estimatedValue) || 0)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">value</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <a href={`tel:${form.phone}`} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><Phone className="mb-1 h-3.5 w-3.5 text-accent" />Call</a>
                <a href={smsHref} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><MessageSquareText className="mb-1 h-3.5 w-3.5 text-accent" />Text quote</a>
                <a href={emailHref} className="rounded-lg border border-border bg-background/60 px-3 py-2 hover-elevate"><Mail className="mb-1 h-3.5 w-3.5 text-accent" />Email</a>
                <button type="button" onClick={() => navigator.clipboard?.writeText(quoteText)} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-left hover-elevate"><ClipboardCheck className="mb-1 h-3.5 w-3.5 text-accent" />Copy script</button>
              </div>
            </div>

            <div className="rounded-xl border border-card-border bg-card p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Next best action</div>
              <div className="mt-2 text-sm font-semibold">{form.nextAction || "Ask for photos and confirm access details"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{followUpLabel}</div>
              <div className="mt-3 rounded-lg border border-border bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">{quoteText}</div>
            </div>

            {lead?.sheetRowNumber && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                Synced to CRM row {lead.sheetRowNumber}. Saving this profile pushes through the same Sheets update path.
              </div>
            )}

            <Button
              type="button"
              className="w-full gap-2"
              disabled={!lead || isBooking || !form.name || !form.phone || !form.city}
              onClick={() => lead && onBook(lead)}
              data-testid="button-convert-lead-job"
            >
              <CalendarCheck className="h-4 w-4" /> {isBooking ? "Booking..." : "Book tomorrow"}
            </Button>
          </aside>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-edit-lead-name" />
              <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-edit-lead-phone" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-edit-lead-email" />
              <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-edit-lead-city" />
            </div>
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-edit-lead-address" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.source} onValueChange={(source) => setForm({ ...form, source })}>
                <SelectTrigger data-testid="select-edit-lead-source"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.jobType} onValueChange={(jobType) => setForm({ ...form, jobType })}>
                <SelectTrigger data-testid="select-edit-lead-job-type"><SelectValue /></SelectTrigger>
                <SelectContent>{JOB_TYPES.map(jobType => <SelectItem key={jobType} value={jobType}>{jobType}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Estimated value" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })} data-testid="input-edit-lead-value" />
              <Select value={form.stage} onValueChange={(stage) => setForm({ ...form, stage })}>
                <SelectTrigger data-testid="select-edit-lead-stage"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map(stage => <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Next action" value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} data-testid="input-edit-lead-next-action" />
              <Input type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} data-testid="input-edit-lead-next-date" />
            </div>
            <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-edit-lead-notes" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={!lead || !form.name || !form.phone || !form.city || isSaving} className="gap-2" data-testid="button-save-lead-edit">
                <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save lead"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewLeadDialog({ onCreate }: { onCreate: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [addJobEntry, setAddJobEntry] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", city: "", address: "",
    source: "Google", jobType: "Garage Cleanout", estimatedValue: 0,
    stage: "new", nextAction: "", nextActionDate: "", notes: "",
  });
  const today = new Date().toISOString().slice(0, 10);
  const [jobEntry, setJobEntry] = useState({
    scheduledDate: today,
    timeWindow: "TBD",
    truckFillPct: 50,
    amountCharged: 0,
    amountPaid: 0,
    paymentStatus: "Unpaid",
    leadSourceCost: 0,
    dumpCost: 0,
    laborCost: 0,
    fuelCost: 0,
    otherCost: 0,
    resaleValue: 0,
    scrapValue: 0,
    recycleCredit: 0,
    donationValue: 0,
    otherRecovery: 0,
    platformReferral: "App pipeline",
    notes: "",
  });

  const totalExpense = Number(jobEntry.leadSourceCost || 0)
    + Number(jobEntry.dumpCost || 0)
    + Number(jobEntry.laborCost || 0)
    + Number(jobEntry.fuelCost || 0)
    + Number(jobEntry.otherCost || 0);
  const totalRecovery = Number(jobEntry.resaleValue || 0)
    + Number(jobEntry.scrapValue || 0)
    + Number(jobEntry.recycleCredit || 0)
    + Number(jobEntry.donationValue || 0)
    + Number(jobEntry.otherRecovery || 0);
  const trueProfit = Number(jobEntry.amountPaid || jobEntry.amountCharged || 0) + totalRecovery - totalExpense;

  const submit = () => {
    if (!form.name || !form.phone || !form.city) return;
    const lead = {
      ...form,
      estimatedValue: Number(form.estimatedValue || jobEntry.amountCharged) || 0,
      stage: addJobEntry ? "booked" : form.stage,
      nextActionDate: form.nextActionDate || null,
    };
    onCreate(addJobEntry ? {
      lead,
      jobEntry: {
        ...jobEntry,
        truckFillPct: Number(jobEntry.truckFillPct) || 50,
        amountCharged: Number(jobEntry.amountCharged || form.estimatedValue) || 0,
        amountPaid: Number(jobEntry.amountPaid) || 0,
        leadSourceCost: Number(jobEntry.leadSourceCost) || 0,
        dumpCost: Number(jobEntry.dumpCost) || 0,
        laborCost: Number(jobEntry.laborCost) || 0,
        fuelCost: Number(jobEntry.fuelCost) || 0,
        otherCost: Number(jobEntry.otherCost) || 0,
        resaleValue: Number(jobEntry.resaleValue) || 0,
        scrapValue: Number(jobEntry.scrapValue) || 0,
        recycleCredit: Number(jobEntry.recycleCredit) || 0,
        donationValue: Number(jobEntry.donationValue) || 0,
        otherRecovery: Number(jobEntry.otherRecovery) || 0,
      },
    } : lead);
    setOpen(false);
    setForm({ ...form, name: "", phone: "", email: "", city: "", address: "", estimatedValue: 0, nextAction: "", nextActionDate: "", notes: "" });
    setAddJobEntry(false);
    setJobEntry({ ...jobEntry, scheduledDate: today, timeWindow: "TBD", amountCharged: 0, amountPaid: 0, leadSourceCost: 0, dumpCost: 0, laborCost: 0, fuelCost: 0, otherCost: 0, resaleValue: 0, scrapValue: 0, recycleCredit: 0, donationValue: 0, otherRecovery: 0, notes: "" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 text-xs gap-1.5" data-testid="button-new-lead">
          <Plus className="h-3.5 w-3.5" /> New lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-background/50 p-3">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Lead info · writes to CRM</div>
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-new-name" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-new-phone" />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-new-city" />
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.jobType} onValueChange={(v) => setForm({ ...form, jobType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{JOB_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input type="number" placeholder="Estimated value" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })} data-testid="input-new-value" />
          <Input placeholder="Next action" value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
          </div>

          <div className="rounded-md border border-border bg-background/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Job Entry + expenses</div>
                <p className="text-xs text-muted-foreground mt-1">Turn this lead into a Job Entry row with payment and cost details for accurate profit.</p>
              </div>
              <Switch checked={addJobEntry} onCheckedChange={setAddJobEntry} data-testid="switch-add-job-entry" />
            </div>

            {addJobEntry && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Job date</Label>
                    <Input type="date" value={jobEntry.scheduledDate} onChange={(e) => setJobEntry({ ...jobEntry, scheduledDate: e.target.value })} data-testid="input-job-date" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time window</Label>
                    <Input placeholder="8:00 AM – 10:00 AM" value={jobEntry.timeWindow} onChange={(e) => setJobEntry({ ...jobEntry, timeWindow: e.target.value })} data-testid="input-job-window" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Amount charged</Label>
                    <Input type="number" value={jobEntry.amountCharged} onChange={(e) => setJobEntry({ ...jobEntry, amountCharged: Number(e.target.value) })} data-testid="input-amount-charged" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount paid</Label>
                    <Input type="number" value={jobEntry.amountPaid} onChange={(e) => setJobEntry({ ...jobEntry, amountPaid: Number(e.target.value) })} data-testid="input-amount-paid" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Payment</Label>
                    <Select value={jobEntry.paymentStatus} onValueChange={(v) => setJobEntry({ ...jobEntry, paymentStatus: v })}>
                      <SelectTrigger data-testid="select-payment-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unpaid">Unpaid</SelectItem>
                        <SelectItem value="Deposit paid">Deposit paid</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <ExpenseInput label="Lead cost" value={jobEntry.leadSourceCost} onChange={(v) => setJobEntry({ ...jobEntry, leadSourceCost: v })} testid="input-lead-cost" />
                  <ExpenseInput label="Dump" value={jobEntry.dumpCost} onChange={(v) => setJobEntry({ ...jobEntry, dumpCost: v })} testid="input-dump-cost" />
                  <ExpenseInput label="Labor" value={jobEntry.laborCost} onChange={(v) => setJobEntry({ ...jobEntry, laborCost: v })} testid="input-labor-cost" />
                  <ExpenseInput label="Fuel/travel" value={jobEntry.fuelCost} onChange={(v) => setJobEntry({ ...jobEntry, fuelCost: v })} testid="input-fuel-cost" />
                  <ExpenseInput label="Other" value={jobEntry.otherCost} onChange={(v) => setJobEntry({ ...jobEntry, otherCost: v })} testid="input-other-cost" />
                </div>

                <div className="rounded-md border border-border bg-card/60 p-3 space-y-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recovered value · resale, scrap, recycle, donation</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <ExpenseInput label="Resale items" value={jobEntry.resaleValue} onChange={(v) => setJobEntry({ ...jobEntry, resaleValue: v })} testid="input-resale-value" />
                    <ExpenseInput label="Scrap metal" value={jobEntry.scrapValue} onChange={(v) => setJobEntry({ ...jobEntry, scrapValue: v })} testid="input-scrap-value" />
                    <ExpenseInput label="Recycle credit" value={jobEntry.recycleCredit} onChange={(v) => setJobEntry({ ...jobEntry, recycleCredit: v })} testid="input-recycle-credit" />
                    <ExpenseInput label="Donation value" value={jobEntry.donationValue} onChange={(v) => setJobEntry({ ...jobEntry, donationValue: v })} testid="input-donation-value" />
                    <ExpenseInput label="Other recovery" value={jobEntry.otherRecovery} onChange={(v) => setJobEntry({ ...jobEntry, otherRecovery: v })} testid="input-other-recovery" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">These credits increase true profit and write into Job Entry notes so resale/scrap value does not disappear.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Truck fill %</Label>
                    <Input type="number" value={jobEntry.truckFillPct} onChange={(e) => setJobEntry({ ...jobEntry, truckFillPct: Number(e.target.value) })} data-testid="input-truck-fill" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Platform / referral</Label>
                    <Input value={jobEntry.platformReferral} onChange={(e) => setJobEntry({ ...jobEntry, platformReferral: e.target.value })} data-testid="input-platform-referral" />
                  </div>
                </div>

                <Textarea placeholder="Job notes, expense details, disposal notes" value={jobEntry.notes} onChange={(e) => setJobEntry({ ...jobEntry, notes: e.target.value })} data-testid="textarea-job-notes" />

                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-300">
                    <Calculator className="h-4 w-4" />
                    True profit preview · {fmtMoney(totalRecovery)} recovered
                  </div>
                  <div className="font-display font-bold num">{fmtMoney(trueProfit)}</div>
                </div>
              </div>
            )}
          </div>

          <Button onClick={submit} className="w-full" data-testid="button-submit-new-lead">Add to pipeline</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseInput({ label, value, onChange, testid }: { label: string; value: number; onChange: (value: number) => void; testid: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testid} />
    </div>
  );
}
