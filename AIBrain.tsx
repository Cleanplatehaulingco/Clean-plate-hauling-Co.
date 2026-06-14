import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { Job, Lead, Receipt, Settings as SettingsT } from "@shared/schema";
import {
  Brain, Camera, CheckCircle2, Clipboard, CloudSun, FileCheck2,
  Gauge, Loader2, Mail, Network, Radio, ReceiptText, Search, Send, ShieldCheck, Sparkles, TrendingUp, Wand2, Bot,
  MessageSquare, Maximize2, PanelLeft, Plus, UserRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LiveOps = {
  now: string;
  location: string;
  weather: { source: string; tempF: number | null; precipitationIn: number | null; windMph: number | null; rainChancePct: number | null };
  signals: {
    openLeads: number; dueFollowUps: number; todaysJobs: number; bookedRevenue: number;
    underFloorEstimates: number; autoOptimizeMode: boolean; lastOptimizedAt: string | null;
  };
  recommendations: { kind: string; title: string; action: string; impact: string; autonomy: string }[];
  guardrails: string[];
};

type PhotoQuote = {
  mode: string;
  confidence: number;
  imageRead: string;
  truckFillPct: number;
  laborMinutes: number;
  heavyItems: number;
  stairsFlights: number;
  suggestedRange: { low: number; high: number };
  quote: { suggestedPrice: number; floorPrice: number; estimatedCost: number; marginAtSuggested: number; warning: string | null };
  reasoning: string[];
  nextBestAction: string;
};

type SheetsStatus = {
  connected: boolean;
  spreadsheetName: string;
  url: string;
  crm?: { sheetName: string; headers: string[]; rowCount: number };
  jobs?: { sheetName: string; headers: string[]; rowCount: number };
  aiLogExists: boolean;
};

type SheetsPreview = {
  spreadsheetName: string;
  crm: { headers: string[]; rows: Record<string, any>[]; rowCount: number };
  jobs: { headers: string[]; rows: Record<string, any>[]; rowCount: number };
  mapping: Record<string, string>;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatTone = "human" | "operator" | "builder";
type ChatThread = {
  id: string;
  title: string;
  subtitle: string;
  tone: ChatTone;
  updatedAt: string;
  messages: ChatMessage[];
};
type ExpandedReader = { title: string; body: string };

let tapTracker = { id: "", count: 0, last: 0 };

function isTripleTap(id: string) {
  const now = Date.now();
  const isSameTarget = tapTracker.id === id && now - tapTracker.last < 700;
  tapTracker = { id, count: isSameTarget ? tapTracker.count + 1 : 1, last: now };
  return tapTracker.count >= 3;
}

function dispatchReader(title: string, body: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ai-reader-open", { detail: { title, body } }));
}

type MemoryDashboard = {
  recent: {
    seven: { leads: number; jobs: number; receipts: number; appActions: number; memories: number };
    thirty: { leads: number; jobs: number; receipts: number; appActions: number; memories: number };
    ninety: { leads: number; jobs: number; receipts: number; appActions: number; memories: number };
  };
  recentMemories: any[];
  importantLessons: any[];
  pricingLessons: any[];
  customerInsights: any[];
  suggestedAppImprovements: any[];
  pendingApprovals: any[];
  learnedThisWeek: any[];
  agents: any[];
  invoices: any[];
  brandContext?: { websiteUrl?: string; facebookUrl?: string; serviceAreas?: string[] };
  safetyRules: string[];
};

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function AIBrain() {
  const { toast } = useToast();
  const { data: liveOps, isLoading } = useQuery<LiveOps>({ queryKey: ["/api/live-ops"], staleTime: 60_000 });
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: receipts = [] } = useQuery<Receipt[]>({ queryKey: ["/api/receipts"] });
  const { data: memoryDashboard } = useQuery<MemoryDashboard>({ queryKey: ["/api/ai-memory/dashboard"], refetchInterval: 120_000 });
  const { data: sheetsStatus, refetch: refetchSheetsStatus, isFetching: isTestingSheets } = useQuery<SheetsStatus>({ queryKey: ["/api/sheets/status"], retry: false });
  const { data: sheetsPreview, refetch: refetchSheetsPreview } = useQuery<SheetsPreview>({ queryKey: ["/api/sheets/preview"], retry: false });
  const initialAssistantMessage: ChatMessage = {
    role: "assistant",
    content: "I’m your Clean Plate AI Brain and Builder in one chat.\n\nI can read live business context, search memory, draft owner-approved app changes, create disabled AI agents, prep invoices, and learn from completed jobs.\n\nTell me what you want to improve, and I’ll give you the next clean move without changing anything permanent unless you approve it.",
  };
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([
    {
      id: "main-ai-brain",
      title: "Main AI Brain",
      subtitle: "Operations, CRM, pricing, invoices",
      tone: "human",
      updatedAt: "Now",
      messages: [initialAssistantMessage],
    },
    {
      id: "builder-agents",
      title: "Builder + Agents",
      subtitle: "App changes and AI agents",
      tone: "builder",
      updatedAt: "Ready",
      messages: [
        {
          role: "assistant",
          content: "This thread is for building the app itself and drafting AI agents.\n\nI can turn ideas into owner-approved tickets, screen changes, settings, agent definitions, and rollback-safe build plans.",
        },
      ],
    },
    {
      id: "deep-search-notes",
      title: "Deep Search Notes",
      subtitle: "Live market and competitor research",
      tone: "operator",
      updatedAt: "Ready",
      messages: [
        {
          role: "assistant",
          content: "Use this thread when you want live research added to the business brain.\n\nAsk about local pricing, competitors, dump fees, marketing ideas, or lead-source research, then save the useful findings into memory.",
        },
      ],
    },
  ]);
  const [activeThreadId, setActiveThreadId] = useState("main-ai-brain");
  const [chatTone, setChatTone] = useState<ChatTone>("human");
  const [expandedReader, setExpandedReader] = useState<ExpandedReader | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryResult, setMemoryResult] = useState<any | null>(null);
  const [deepSearchQuery, setDeepSearchQuery] = useState("");
  const [deepSearchResult, setDeepSearchResult] = useState<any | null>(null);

  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeThreadId) ?? chatThreads[0],
    [activeThreadId, chatThreads],
  );
  const chatMessages = activeThread?.messages ?? [];

  useEffect(() => {
    const handler = (event: Event) => setExpandedReader((event as CustomEvent<ExpandedReader>).detail);
    const clickHandler = (event: MouseEvent) => {
      if (event.detail < 3) return;
      const target = (event.target as HTMLElement | null)?.closest("[data-reader-body]") as HTMLElement | null;
      if (!target) return;
      setExpandedReader({
        title: target.dataset.readerTitle || "Reader mode",
        body: target.dataset.readerBody || target.innerText,
      });
    };
    window.addEventListener("ai-reader-open", handler);
    document.addEventListener("click", clickHandler);
    return () => {
      window.removeEventListener("ai-reader-open", handler);
      document.removeEventListener("click", clickHandler);
    };
  }, []);

  const [photoForm, setPhotoForm] = useState({
    customerName: "",
    phone: "",
    city: "",
    photoName: "",
    photoSize: 0,
    jobType: "Mixed Junk",
    visibleLoad: "medium",
    access: "garage",
    notes: "",
    distanceMiles: 8,
  });
  const [photoResult, setPhotoResult] = useState<PhotoQuote | null>(null);

  const [receiptForm, setReceiptForm] = useState({
    jobId: "none",
    customerName: "",
    phone: "",
    address: "",
    city: "",
    amount: 0,
    paymentMethod: "Cash",
    dumpFee: 85,
    laborCost: 90,
    beforePhotoName: "",
    afterPhotoName: "",
    proofNotes: "",
    resaleValue: 0,
    scrapValue: 0,
    recycleCredit: 0,
    donationValue: 0,
    otherRecovery: 0,
  });

  const [invoiceForm, setInvoiceForm] = useState({
    customerName: "",
    email: "",
    phone: "",
    city: "",
    description: "Junk removal / hauling service",
    quantity: 1,
    unitPrice: 0,
    tax: 0,
    dueDate: "",
    notes: "",
  });

  const selectedJob = useMemo(() => jobs.find(j => String(j.id) === receiptForm.jobId), [jobs, receiptForm.jobId]);

  const settingsMutation = useMutation({
    mutationFn: async (data: Partial<SettingsT>) => (await apiRequest("PATCH", "/api/settings", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-ops"] });
      toast({ title: "AI guardrails updated", description: "Auto-Optimize is still inside owner-safe limits." });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auto-optimize", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-ops"] });
      toast({ title: data.applied ? "Auto-Optimize ran" : "No changes applied", description: data.changes?.[0] ?? data.message });
    },
  });

  const photoMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/photo-quote", photoForm)).json(),
    onSuccess: (data: PhotoQuote) => setPhotoResult(data),
  });

  const importCrmMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/sheets/import-crm", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-ops"] });
      toast({ title: "CRM imported", description: `Scanned ${data.scanned} rows and added ${data.imported} new lead${data.imported === 1 ? "" : "s"}.` });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({ message, history, tone }: { message: string; history: ChatMessage[]; tone: ChatTone; threadId: string }) => {
      const res = await apiRequest("POST", "/api/ai-chat", { message, history, tone });
      return res.json();
    },
    onSuccess: (data, variables) => {
      setChatThreads((threads) => threads.map((thread) => (
        thread.id === variables.threadId
          ? { ...thread, updatedAt: "Just now", messages: [...thread.messages, { role: "assistant", content: data.answer }] }
          : thread
      )));
      if (data.draftedActions?.length) {
        queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
        toast({ title: "Builder actions drafted", description: `${data.draftedActions.length} owner-approved action${data.draftedActions.length === 1 ? "" : "s"} added to the queue.` });
      }
    },
    onError: (err: Error, variables) => {
      setChatThreads((threads) => threads.map((thread) => (
        thread.id === variables.threadId
          ? { ...thread, messages: [...thread.messages, { role: "assistant", content: `AI chat hit a server issue: ${err.message}. The Sheets tools and rules-based AI Brain still work, but the advanced model needs the server credential refreshed.` }] }
          : thread
      )));
    },
  });

  const memorySearchMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/ai-memory/search", { query: memoryQuery })).json(),
    onSuccess: (data) => setMemoryResult(data),
  });

  const learnJobMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/ai-memory/learn-job", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: "AI Brain learned from jobs", description: `${data.learned} lesson${data.learned === 1 ? "" : "s"} added to memory.` });
    },
  });

  const deepSearchMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/ai-deep-search", { query: deepSearchQuery, saveToMemory: true })).json(),
    onSuccess: (data) => {
      setDeepSearchResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: data.liveSearch ? "Deep search complete" : "Deep search used fallback", description: data.memoryEvent ? "Useful finding saved into AI memory." : "Review the result before acting." });
    },
  });

  const logPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!photoResult) return null;
      return (await apiRequest("POST", "/api/sheets/log-photo-quote", {
        customerName: photoForm.customerName,
        phone: photoForm.phone,
        city: photoForm.city,
        jobType: photoForm.jobType,
        priceLow: photoResult.suggestedRange.low,
        priceHigh: photoResult.suggestedRange.high,
        photoName: photoForm.photoName,
        notes: `${photoResult.reasoning.join(" ")} ${photoForm.notes}`,
      })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheets/status"] });
      toast({ title: "Logged to Google Sheets", description: "Photo quote was added to the AI App Log tab." });
    },
  });

  const logReceiptMutation = useMutation({
    mutationFn: async (receipt: Receipt) => (await apiRequest("POST", "/api/sheets/log-receipt", {
      receiptId: receipt.id,
      customerName: receipt.customerName,
      phone: receipt.phone ?? "",
      city: receipt.city ?? "",
      amount: receipt.amount,
      paymentMethod: receipt.paymentMethod,
      receiptNumber: receipt.receiptNumber,
      proof: [receipt.beforePhotoName, receipt.afterPhotoName].filter(Boolean).join(" → "),
      notes: `${receipt.proofNotes ?? ""} Recovered value: resale $${receipt.resaleValue ?? 0}, scrap $${receipt.scrapValue ?? 0}, recycle $${receipt.recycleCredit ?? 0}, donation $${receipt.donationValue ?? 0}, other $${receipt.otherRecovery ?? 0}.`,
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheets/status"] });
      toast({ title: "Receipt logged", description: "Proof record was added to your Google Sheet." });
    },
  });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...receiptForm,
        jobId: receiptForm.jobId === "none" ? null : Number(receiptForm.jobId),
        amount: Number(receiptForm.amount),
        dumpFee: Number(receiptForm.dumpFee),
        laborCost: Number(receiptForm.laborCost),
        resaleValue: Number(receiptForm.resaleValue),
        scrapValue: Number(receiptForm.scrapValue),
        recycleCredit: Number(receiptForm.recycleCredit),
        donationValue: Number(receiptForm.donationValue),
        otherRecovery: Number(receiptForm.otherRecovery),
      };
      return (await apiRequest("POST", "/api/receipts", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Receipt and proof saved", description: "Ready to export back into your CRM workflow." });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/invoices", {
      customerName: invoiceForm.customerName,
      email: invoiceForm.email,
      phone: invoiceForm.phone,
      city: invoiceForm.city,
      lineItems: [{ description: invoiceForm.description, quantity: Number(invoiceForm.quantity) || 1, unitPrice: Number(invoiceForm.unitPrice) || 0 }],
      tax: Number(invoiceForm.tax) || 0,
      dueDate: invoiceForm.dueDate,
      notes: invoiceForm.notes,
    })).json(),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: "Invoice draft created", description: `${invoice.invoiceNumber} is ready for owner approval before Gmail send.` });
    },
  });

  const approveInvoiceMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/invoices/${id}/approve-send`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: "Invoice send approved", description: "Now press Send with Gmail to email the client." });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/invoices/${id}/send-gmail`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-memory/dashboard"] });
      toast({ title: "Invoice sent through Gmail", description: "The invoice send was logged into AI memory." });
    },
  });

  const applyJobToReceipt = (jobId: string) => {
    if (jobId === "none") {
      setReceiptForm({ ...receiptForm, jobId });
      return;
    }
    const job = jobs.find(j => String(j.id) === jobId);
    if (!job) return;
    setReceiptForm({
      ...receiptForm,
      jobId,
      customerName: job.customerName,
      phone: job.phone,
      address: job.address,
      city: job.city,
      amount: job.estimatedRevenue,
      proofNotes: `Completed ${job.jobType} removal. Truck fill estimated at ${job.truckFillPct}%. Area swept and cleared before departure.`,
    });
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Ready to paste into a text, quote, or CRM note." });
  };

  const receiptRecovered = Number(receiptForm.resaleValue || 0)
    + Number(receiptForm.scrapValue || 0)
    + Number(receiptForm.recycleCredit || 0)
    + Number(receiptForm.donationValue || 0)
    + Number(receiptForm.otherRecovery || 0);
  const receiptNet = Number(receiptForm.amount || 0) + receiptRecovered - Number(receiptForm.dumpFee || 0) - Number(receiptForm.laborCost || 0);
  const latestInvoice = memoryDashboard?.invoices?.[0];

  const createNewChat = () => {
    const id = `clean-plate-chat-${Date.now()}`;
    setChatThreads((threads) => [
      {
        id,
        title: "New AI build chat",
        subtitle: "Fresh business operating chat",
        tone: chatTone,
        updatedAt: "Now",
        messages: [
          {
            role: "assistant",
            content: "Fresh chat started.\n\nTalk to me like your business operator. I can help with leads, pricing, app improvements, invoices, follow-ups, agents, and owner-approved build plans.",
          },
        ],
      },
      ...threads,
    ]);
    setActiveThreadId(id);
  };

  const sendChat = () => {
    const message = chatInput.trim();
    if (!message || chatMutation.isPending || !activeThread) return;
    const userMessage: ChatMessage = { role: "user", content: message };
    const threadId = activeThread.id;
    const history = [...chatMessages, userMessage].slice(-10);
    setChatThreads((threads) => threads.map((thread) => (
      thread.id === threadId
        ? { ...thread, tone: chatTone, updatedAt: "Just now", messages: [...thread.messages, userMessage] }
        : thread
    )));
    setChatInput("");
    chatMutation.mutate({ message, history, tone: chatTone, threadId });
  };

  return (
    <>
      {expandedReader && <ReaderOverlay reader={expandedReader} onClose={() => setExpandedReader(null)} />}
      <PageHeader
        eyebrow="AI live operations brain"
        title="Let the app enhance the business, not replace your CRM"
        description="Live-time context, draft photo pricing, owner-safe auto-optimization, and proof-ready receipts built around your existing Google Sheets CRM."
        actions={
          <Button
            onClick={() => optimizeMutation.mutate()}
            disabled={optimizeMutation.isPending}
            className="gap-2 premium-button"
            data-testid="button-run-auto-optimize"
          >
            {optimizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Run Auto-Optimize
          </Button>
        }
      />

      <div className="premium-hero rounded-xl border border-card-border bg-card p-5 md:p-6 mb-5 overflow-hidden">
        <div className="relative z-10 grid lg:grid-cols-4 gap-4">
          <SignalCard icon={Radio} label="Live source" value={isLoading ? "Syncing" : "Internet time"} sub={liveOps?.location ?? "Wixom, MI"} />
          <SignalCard icon={CloudSun} label="Weather" value={liveOps?.weather.tempF ? `${liveOps.weather.tempF}°F` : "Live"} sub={`${liveOps?.weather.rainChancePct ?? "—"}% rain risk`} />
          <SignalCard icon={Gauge} label="Due follow-ups" value={String(liveOps?.signals.dueFollowUps ?? 0)} sub={`${liveOps?.signals.openLeads ?? 0} open leads`} />
          <SignalCard icon={TrendingUp} label="Booked today" value={money(liveOps?.signals.bookedRevenue ?? 0)} sub={`${liveOps?.signals.todaysJobs ?? 0} jobs on board`} />
        </div>
      </div>

      <div className="grid xl:grid-cols-4 gap-4 mb-5">
        <Panel title="AI Brain training dashboard" icon={Brain}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="7 day memory" value={String(memoryDashboard?.recent.seven.memories ?? 0)} />
              <MiniStat label="30 day jobs" value={String(memoryDashboard?.recent.thirty.jobs ?? 0)} />
              <MiniStat label="90 day actions" value={String(memoryDashboard?.recent.ninety.appActions ?? 0)} />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">What it learned this week</div>
              {(memoryDashboard?.learnedThisWeek ?? []).slice(0, 3).map((m: any) => (
                <div key={m.id} className="text-xs py-1 border-b border-border/50 last:border-0" data-testid={`memory-week-${m.id}`}>
                  <span className="font-medium">{m.title}</span>
                  <span className="text-muted-foreground"> · {m.category}</span>
                </div>
              ))}
              {(!memoryDashboard?.learnedThisWeek || memoryDashboard.learnedThisWeek.length === 0) && <div className="text-xs text-muted-foreground">Complete jobs or run learning to build lessons.</div>}
            </div>
            <Button variant="secondary" className="w-full gap-2" onClick={() => learnJobMutation.mutate()} disabled={learnJobMutation.isPending} data-testid="button-learn-from-jobs">
              {learnJobMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Learn from completed jobs
            </Button>
          </div>
        </Panel>

        <Panel title="Searchable memory" icon={Search}>
          <div className="space-y-3">
            <Input value={memoryQuery} onChange={(e) => setMemoryQuery(e.target.value)} placeholder="What quote mistakes have we made?" data-testid="input-memory-search" />
            <Button className="w-full gap-2" onClick={() => memorySearchMutation.mutate()} disabled={!memoryQuery.trim() || memorySearchMutation.isPending} data-testid="button-memory-search">
              {memorySearchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search memory
            </Button>
            <div className="rounded-lg border border-border bg-background/50 p-3 min-h-24 text-xs whitespace-pre-wrap" data-testid="text-memory-search-result">
              {memoryResult ? (
                <div>
                  <div className="font-medium mb-2">{memoryResult.answer}</div>
                  {(memoryResult.events ?? []).slice(0, 3).map((event: any) => <div key={event.id} className="text-muted-foreground mb-1">{event.title}</div>)}
                </div>
              ) : "Ask about follow-ups, profit, quote mistakes, repeat customers, or what to build next."}
            </div>
          </div>
        </Panel>

        <Panel title="Deep live search" icon={Network}>
          <div className="space-y-3">
            <Textarea value={deepSearchQuery} onChange={(e) => setDeepSearchQuery(e.target.value)} placeholder="Search competitors, dump fees, scrap prices, local junk removal pricing, disposal rules..." data-testid="input-deep-search" />
            <Button className="w-full gap-2 premium-button" onClick={() => deepSearchMutation.mutate()} disabled={!deepSearchQuery.trim() || deepSearchMutation.isPending} data-testid="button-deep-search">
              {deepSearchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              Run deep search
            </Button>
            <div className="rounded-lg border border-border bg-background/50 p-3 max-h-36 overflow-y-auto text-xs whitespace-pre-wrap" data-testid="text-deep-search-result">
              {deepSearchResult?.answer ?? "Live public search for real market data, then save useful findings into memory."}
            </div>
          </div>
        </Panel>

        <Panel title="AI agents + approvals" icon={Bot}>
          <div className="space-y-2 text-xs">
            <MiniStat label="Draft agents" value={String(memoryDashboard?.agents?.length ?? 0)} />
            <MiniStat label="Pending approvals" value={String(memoryDashboard?.pendingApprovals?.length ?? 0)} />
            {(memoryDashboard?.agents ?? []).slice(0, 3).map((agent: any) => (
              <div key={agent.id} className="rounded-md border border-border p-2" data-testid={`card-ai-agent-${agent.id}`}>
                <div className="font-medium">{agent.name}</div>
                <div className="text-muted-foreground">{agent.status} · owner-approved tools only</div>
              </div>
            ))}
            <div className="rounded-lg bg-accent/10 border border-accent/25 p-3 text-muted-foreground">
              The main AI can draft specialist agents, but agents start disabled and cannot send, delete, price-change, sync, or build without approval.
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Panel title="Advanced AI chat builder" icon={Sparkles}>
            <div className="rounded-2xl border border-border bg-background/60 overflow-hidden">
              <div className="grid xl:grid-cols-[280px_minmax(0,1fr)] min-h-[660px]">
                <aside className="border-b xl:border-b-0 xl:border-r border-border bg-card/55 p-3 space-y-3" aria-label="AI chat history">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display font-bold text-sm flex items-center gap-2">
                        <PanelLeft className="h-4 w-4 text-accent" /> Chat history
                      </div>
                      <div className="text-[11px] text-muted-foreground">Like a real AI workspace, not one messy thread.</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={createNewChat} className="h-9 w-9 p-0" aria-label="Start new AI chat" data-testid="button-new-ai-chat">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2" data-testid="list-ai-chat-history">
                    {chatThreads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => {
                          setActiveThreadId(thread.id);
                          setChatTone(thread.tone);
                        }}
                        className={cn(
                          "w-full text-left rounded-xl border p-3 transition-all",
                          thread.id === activeThreadId
                            ? "border-accent/45 bg-accent/12 shadow-sm"
                            : "border-border bg-background/45 hover:bg-background/80"
                        )}
                        data-testid={`button-chat-thread-${thread.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{thread.title}</div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2">{thread.subtitle}</div>
                          </div>
                          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          <span>{thread.tone}</span>
                          <span>{thread.updatedAt}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-xs text-muted-foreground">
                    <div className="font-display font-bold text-foreground mb-1">Reader mode</div>
                    Triple tap or triple click any AI answer to pop it out full screen and read it clearly.
                  </div>
                </aside>

                <div className="flex min-h-[660px] flex-col">
                  <div className="border-b border-border p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-display font-bold text-base" data-testid="text-active-ai-thread-title">{activeThread?.title}</div>
                          <div className="text-xs text-muted-foreground">Clean Plate AI uses CRM context, memory, invoices, agents, and owner-safe Builder Mode.</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="AI response style">
                      {(["human", "operator", "builder"] as ChatTone[]).map((tone) => (
                        <button
                          key={tone}
                          onClick={() => setChatTone(tone)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium capitalize",
                            chatTone === tone ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                          data-testid={`button-chat-tone-${tone}`}
                        >
                          {tone === "human" ? "Human chat" : tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-[540px] flex-1 overflow-y-auto p-4 md:p-5 space-y-4 bg-background/35" data-testid="chat-ai-builder-thread">
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (m.role === "assistant" && (event.detail >= 3 || isTripleTap(`chat-message-${i}`))) {
                          setExpandedReader({ title: "Clean Plate AI response", body: m.content });
                        }
                      }}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        if (m.role === "assistant" && isTripleTap(`chat-message-${i}`)) {
                          setExpandedReader({ title: "Clean Plate AI response", body: m.content });
                        }
                      }}
                      className={cn(
                        "group rounded-2xl px-4 py-4 max-w-[94%] md:max-w-[88%] leading-relaxed",
                        m.role === "user"
                          ? "ml-auto bg-accent text-accent-foreground"
                          : "bg-card border border-border text-card-foreground shadow-sm cursor-zoom-in"
                      )}
                      data-reader-title={m.role === "assistant" ? "Clean Plate AI response" : undefined}
                      data-reader-body={m.role === "assistant" ? m.content : undefined}
                      data-testid={`chat-message-${i}`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center", m.role === "user" ? "bg-white/15" : "bg-accent/12 text-accent")}>
                            {m.role === "user" ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{m.role === "user" ? "Owner" : "Clean Plate AI"}</div>
                            {m.role === "assistant" && <div className="text-[10px] text-muted-foreground">CRM + memory + builder brain</div>}
                          </div>
                        </div>
                        {m.role === "assistant" && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedReader({ title: "Clean Plate AI response", body: m.content });
                            }}
                            className="opacity-70 group-hover:opacity-100 rounded-full border border-border bg-background/70 p-1.5 text-muted-foreground hover:text-foreground"
                            aria-label="Open AI response in reader"
                            data-testid={`button-expand-chat-message-${i}`}
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {m.role === "assistant" ? <AssistantText content={m.content} /> : <div className="text-[15px] leading-7 whitespace-pre-wrap">{m.content}</div>}
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="rounded-2xl px-4 py-3 text-sm bg-card border border-border inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-accent" /> Thinking through your CRM, jobs, and app...
                    </div>
                  )}
                  </div>
                  <div className="border-t border-border p-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        "What should this app build next?",
                        "Analyze my Google Sheet and tell me who to follow up with.",
                        "Make my photo quote flow smarter.",
                        "Create a receipt and review-request workflow.",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setChatInput(prompt)}
                          className="rounded-full border border-border bg-background/60 px-3 py-2 text-xs hover-elevate"
                          data-testid={`button-chat-prompt-${prompt.slice(0, 10).replace(/\W/g, "")}`}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChat();
                          }
                        }}
                        placeholder="Talk naturally: build this, fix my CRM, invoice this client, search live data..."
                        className="min-h-11 text-[15px]"
                        data-testid="input-ai-builder-chat"
                      />
                      <Button onClick={sendChat} disabled={!chatInput.trim() || chatMutation.isPending} className="gap-2 premium-button min-h-11" data-testid="button-send-ai-chat">
                        <Send className="h-4 w-4" /> Send
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Google Sheets live CRM" icon={FileCheck2}>
            <div className="grid lg:grid-cols-[1fr_260px] gap-4">
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-background/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", sheetsStatus?.connected ? "bg-accent shadow-[0_0_18px_hsl(var(--accent))]" : "bg-destructive")} />
                        <h3 className="font-display font-bold text-sm" data-testid="text-sheets-name">
                          {sheetsStatus?.spreadsheetName ?? "Google Sheets CRM"}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        The app is mapped to CRM and Job Entry. AI outputs go to an AI App Log tab so your core tracker stays clean.
                      </p>
                    </div>
                    {sheetsStatus?.url && (
                      <a href={sheetsStatus.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline" data-testid="link-open-google-sheet">
                        Open Sheet
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-2">
                  <MiniStat label="CRM rows" value={String(sheetsPreview?.crm.rowCount ?? sheetsStatus?.crm?.rowCount ?? "—")} />
                  <MiniStat label="Job rows" value={String(sheetsPreview?.jobs.rowCount ?? sheetsStatus?.jobs?.rowCount ?? "—")} />
                  <MiniStat label="AI log tab" value={sheetsStatus?.aiLogExists ? "Ready" : "Creates on push"} />
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Detected mapping</div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(sheetsPreview?.mapping ?? {}).slice(0, 8).map(([appField, sheetField]) => (
                      <div key={appField} className="flex justify-between gap-3" data-testid={`text-sheet-map-${appField}`}>
                        <span className="text-muted-foreground">{appField}</span>
                        <span className="font-medium text-right">{sheetField}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full gap-2 premium-button"
                  onClick={() => importCrmMutation.mutate()}
                  disabled={importCrmMutation.isPending}
                  data-testid="button-import-google-crm"
                >
                  {importCrmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                  Import CRM into app
                </Button>
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => {
                    refetchSheetsStatus();
                    refetchSheetsPreview();
                  }}
                  disabled={isTestingSheets}
                  data-testid="button-test-google-sheets"
                >
                  {isTestingSheets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                  Test live Sheets
                </Button>
                <div className="rounded-lg bg-accent/10 border border-accent/25 p-3 text-xs text-muted-foreground">
                  Importing adds missing rows into this app by phone number. It does not delete or overwrite your Google Sheet.
                </div>
                <div className="rounded-lg border border-border p-3 text-xs">
                  <div className="font-medium mb-1">Sample live row</div>
                  <div className="text-muted-foreground">
                    {sheetsPreview?.crm.rows?.[0]?.["Customer Name"] ?? "No CRM row found"} · {sheetsPreview?.crm.rows?.[0]?.["Lead Source"] ?? "Lead source"}
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Live recommendations" icon={Brain}>
            <div className="space-y-3">
              {(liveOps?.recommendations ?? []).map((r, i) => (
                <div key={`${r.kind}-${i}`} className="group rounded-lg border border-border bg-background/50 p-4 hover-elevate premium-card" data-testid={`card-recommendation-${i}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_hsl(var(--accent))]" />
                        <h3 className="font-display font-bold text-sm">{r.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{r.action}</p>
                    </div>
                    <div className="hidden sm:block text-right">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Impact</div>
                      <div className="text-xs max-w-[170px]">{r.impact}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" /> {r.autonomy}
                  </div>
                </div>
              ))}
              {(!liveOps?.recommendations || liveOps.recommendations.length === 0) && (
                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No urgent moves. Keep quoting, keep proof, keep the truck moving.</div>
              )}
            </div>
          </Panel>

          <Panel title="AI photo quote" icon={Camera}>
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Customer">
                    <Input value={photoForm.customerName} onChange={(e) => setPhotoForm({ ...photoForm, customerName: e.target.value })} placeholder="Optional" data-testid="input-photo-customer" />
                  </Field>
                  <Field label="Phone">
                    <Input value={photoForm.phone} onChange={(e) => setPhotoForm({ ...photoForm, phone: e.target.value })} placeholder="Optional" data-testid="input-photo-phone" />
                  </Field>
                  <Field label="City">
                    <Input value={photoForm.city} onChange={(e) => setPhotoForm({ ...photoForm, city: e.target.value })} placeholder="Wixom" data-testid="input-photo-city" />
                  </Field>
                </div>
                <Field label="Upload junk photo">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPhotoForm({ ...photoForm, photoName: f.name, photoSize: f.size });
                    }}
                    data-testid="input-photo-quote-file"
                  />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Job type">
                    <Input value={photoForm.jobType} onChange={(e) => setPhotoForm({ ...photoForm, jobType: e.target.value })} data-testid="input-photo-job-type" />
                  </Field>
                  <Field label="Distance from Wixom">
                    <Input type="number" value={photoForm.distanceMiles} onChange={(e) => setPhotoForm({ ...photoForm, distanceMiles: Number(e.target.value) })} data-testid="input-photo-distance" />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Visible load">
                    <Select value={photoForm.visibleLoad} onValueChange={(v) => setPhotoForm({ ...photoForm, visibleLoad: v })}>
                      <SelectTrigger data-testid="select-visible-load"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_item">Single item</SelectItem>
                        <SelectItem value="small">Small pile</SelectItem>
                        <SelectItem value="medium">Medium pile</SelectItem>
                        <SelectItem value="large">Large load</SelectItem>
                        <SelectItem value="overflowing">Overflowing</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Access">
                    <Select value={photoForm.access} onValueChange={(v) => setPhotoForm({ ...photoForm, access: v })}>
                      <SelectTrigger data-testid="select-photo-access"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="curbside">Curbside</SelectItem>
                        <SelectItem value="garage">Garage</SelectItem>
                        <SelectItem value="inside">Inside</SelectItem>
                        <SelectItem value="stairs">Stairs</SelectItem>
                        <SelectItem value="basement">Basement</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Photo notes">
                  <Textarea value={photoForm.notes} onChange={(e) => setPhotoForm({ ...photoForm, notes: e.target.value })} placeholder="Mattress, fridge, basement stairs, wet carpet, tight driveway..." data-testid="input-photo-notes" />
                </Field>
                <Button onClick={() => photoMutation.mutate()} disabled={photoMutation.isPending} className="w-full gap-2 premium-button" data-testid="button-generate-photo-quote">
                  {photoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Build draft price from photo
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-background/60 p-4 min-h-[360px]">
                {photoResult ? (
                  <div className="space-y-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-accent">Draft customer range</div>
                      <div className="font-display text-4xl font-bold num" data-testid="text-photo-price-range">
                        {money(photoResult.suggestedRange.low)}–{money(photoResult.suggestedRange.high)}
                      </div>
                      <div className="text-xs text-muted-foreground">Confidence {photoResult.confidence}% · {photoResult.imageRead}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Truck fill" value={`${photoResult.truckFillPct}%`} />
                      <MiniStat label="Labor" value={`${photoResult.laborMinutes}m`} />
                      <MiniStat label="Margin" value={`${photoResult.quote.marginAtSuggested}%`} />
                    </div>
                    <div className="space-y-2">
                      {photoResult.reasoning.map((x, i) => (
                        <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" /> {x}
                        </div>
                      ))}
                    </div>
                    <Button variant="secondary" className="w-full gap-2" onClick={() => copyText(photoResult.nextBestAction)} data-testid="button-copy-photo-quote">
                      <Clipboard className="h-4 w-4" /> Copy customer text
                    </Button>
                    <Button
                      className="w-full gap-2"
                      onClick={() => logPhotoMutation.mutate()}
                      disabled={logPhotoMutation.isPending}
                      data-testid="button-log-photo-quote-sheets"
                    >
                      {logPhotoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                      Log quote to Google Sheets
                    </Button>
                  </div>
                ) : (
                  <EmptyState icon={Camera} title="Drop in a job photo" text="The app will turn the picture plus a few field details into a draft quote range, risk notes, and customer-ready wording." />
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Owner-safe autonomy" icon={ShieldCheck}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Auto-Optimize Mode</div>
                  <div className="text-xs text-muted-foreground">Safe pricing and follow-up tuning only.</div>
                </div>
                <Switch
                  checked={!!settings?.autoOptimizeMode}
                  onCheckedChange={(v) => settingsMutation.mutate({ autoOptimizeMode: v })}
                  data-testid="switch-auto-optimize"
                />
              </div>
              <Field label="Max auto price adjustment %">
                <Input
                  type="number"
                  value={settings?.maxAutoPriceAdjustPct ?? 8}
                  onChange={(e) => settingsMutation.mutate({ maxAutoPriceAdjustPct: Number(e.target.value) })}
                  data-testid="input-max-auto-price"
                />
              </Field>
              <div className="rounded-lg bg-accent/10 border border-accent/25 p-3 text-xs text-muted-foreground">
                The AI can tune price-per-yard and follow-up timing. It cannot send messages, promise prices, delete CRM records, or redeploy code without you.
              </div>
            </div>
          </Panel>

          <Panel title="Receipt + proof builder" icon={ReceiptText}>
            <div className="space-y-3">
              <Field label="Pull from job">
                <Select value={receiptForm.jobId} onValueChange={applyJobToReceipt}>
                  <SelectTrigger data-testid="select-receipt-job"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual receipt</SelectItem>
                    {jobs.map(j => <SelectItem key={j.id} value={String(j.id)}>{j.customerName} · {j.city}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Customer" value={receiptForm.customerName} onChange={(e) => setReceiptForm({ ...receiptForm, customerName: e.target.value })} data-testid="input-receipt-customer" />
                <Input type="number" placeholder="Amount" value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })} data-testid="input-receipt-amount" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Dump fee" value={receiptForm.dumpFee} onChange={(e) => setReceiptForm({ ...receiptForm, dumpFee: Number(e.target.value) })} data-testid="input-receipt-dump-fee" />
                <Input type="number" placeholder="Labor cost" value={receiptForm.laborCost} onChange={(e) => setReceiptForm({ ...receiptForm, laborCost: Number(e.target.value) })} data-testid="input-receipt-labor-cost" />
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Profit recovery</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Resale items" value={receiptForm.resaleValue} onChange={(e) => setReceiptForm({ ...receiptForm, resaleValue: Number(e.target.value) })} data-testid="input-receipt-resale" />
                  <Input type="number" placeholder="Scrap metal" value={receiptForm.scrapValue} onChange={(e) => setReceiptForm({ ...receiptForm, scrapValue: Number(e.target.value) })} data-testid="input-receipt-scrap" />
                  <Input type="number" placeholder="Recycle credit" value={receiptForm.recycleCredit} onChange={(e) => setReceiptForm({ ...receiptForm, recycleCredit: Number(e.target.value) })} data-testid="input-receipt-recycle" />
                  <Input type="number" placeholder="Donation value" value={receiptForm.donationValue} onChange={(e) => setReceiptForm({ ...receiptForm, donationValue: Number(e.target.value) })} data-testid="input-receipt-donation" />
                </div>
                <Input type="number" placeholder="Other recovered value" value={receiptForm.otherRecovery} onChange={(e) => setReceiptForm({ ...receiptForm, otherRecovery: Number(e.target.value) })} data-testid="input-receipt-other-recovery" />
                <div className="rounded-md bg-accent/10 border border-accent/25 p-2 text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">Net after known costs/recovery</span>
                  <span className="font-display font-bold num">{money(receiptNet)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Before photo name" value={receiptForm.beforePhotoName} onChange={(e) => setReceiptForm({ ...receiptForm, beforePhotoName: e.target.value })} data-testid="input-before-photo" />
                <Input placeholder="After photo name" value={receiptForm.afterPhotoName} onChange={(e) => setReceiptForm({ ...receiptForm, afterPhotoName: e.target.value })} data-testid="input-after-photo" />
              </div>
              <Textarea placeholder="Proof notes" value={receiptForm.proofNotes} onChange={(e) => setReceiptForm({ ...receiptForm, proofNotes: e.target.value })} data-testid="input-proof-notes" />
              <Button onClick={() => receiptMutation.mutate()} disabled={!receiptForm.customerName || receiptMutation.isPending} className="w-full gap-2" data-testid="button-create-receipt">
                <FileCheck2 className="h-4 w-4" /> Save receipt proof
              </Button>
              {selectedJob && <div className="text-[11px] text-muted-foreground">Loaded job #{selectedJob.id}: {selectedJob.jobType}, {selectedJob.truckFillPct}% truck fill.</div>}
            </div>
          </Panel>

          <Panel title="Invoice Center" icon={Mail}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Customer" value={invoiceForm.customerName} onChange={(e) => setInvoiceForm({ ...invoiceForm, customerName: e.target.value })} data-testid="input-invoice-customer" />
                <Input placeholder="Client email" value={invoiceForm.email} onChange={(e) => setInvoiceForm({ ...invoiceForm, email: e.target.value })} data-testid="input-invoice-email" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Phone" value={invoiceForm.phone} onChange={(e) => setInvoiceForm({ ...invoiceForm, phone: e.target.value })} data-testid="input-invoice-phone" />
                <Input placeholder="City" value={invoiceForm.city} onChange={(e) => setInvoiceForm({ ...invoiceForm, city: e.target.value })} data-testid="input-invoice-city" />
              </div>
              <Input placeholder="Line item" value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} data-testid="input-invoice-description" />
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" placeholder="Qty" value={invoiceForm.quantity} onChange={(e) => setInvoiceForm({ ...invoiceForm, quantity: Number(e.target.value) })} data-testid="input-invoice-qty" />
                <Input type="number" placeholder="Price" value={invoiceForm.unitPrice} onChange={(e) => setInvoiceForm({ ...invoiceForm, unitPrice: Number(e.target.value) })} data-testid="input-invoice-price" />
                <Input type="number" placeholder="Tax" value={invoiceForm.tax} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax: Number(e.target.value) })} data-testid="input-invoice-tax" />
              </div>
              <Input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} data-testid="input-invoice-due" />
              <Textarea placeholder="Invoice notes" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} data-testid="input-invoice-notes" />
              <Button onClick={() => invoiceMutation.mutate()} disabled={!invoiceForm.customerName || invoiceMutation.isPending} className="w-full gap-2" data-testid="button-create-invoice">
                {invoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                Create invoice draft
              </Button>
              {latestInvoice && (
                <div className="rounded-lg border border-border p-3 space-y-2" data-testid="card-latest-invoice">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{latestInvoice.invoiceNumber}</div>
                      <div className="text-[11px] text-muted-foreground">{latestInvoice.customerName} · {latestInvoice.status}</div>
                    </div>
                    <div className="font-display font-bold num">{money(Number(latestInvoice.total ?? 0))}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => approveInvoiceMutation.mutate(latestInvoice.id)} disabled={approveInvoiceMutation.isPending} data-testid="button-approve-invoice-send">
                      Approve send
                    </Button>
                    <Button size="sm" onClick={() => sendInvoiceMutation.mutate(latestInvoice.id)} disabled={sendInvoiceMutation.isPending || latestInvoice.status !== "pending_approval"} data-testid="button-send-invoice-gmail">
                      Send Gmail
                    </Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-accent/10 border border-accent/25 p-3 text-xs text-muted-foreground">
                Invoice emails are plain-text Gmail sends. The app creates a draft record first, then requires approval before the Send Gmail button unlocks.
              </div>
            </div>
          </Panel>

          <Panel title="Recent proof" icon={ReceiptText}>
            <div className="space-y-2">
              {receipts.slice(0, 4).map(r => (
                <div key={r.id} className="rounded-md border border-border p-3" data-testid={`card-receipt-${r.id}`}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">{r.customerName}</div>
                      <div className="text-[11px] text-muted-foreground">{r.receiptNumber}</div>
                    </div>
                    <div className="font-display font-bold num">{money(r.amount)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full mt-3 gap-2"
                    onClick={() => logReceiptMutation.mutate(r)}
                    disabled={logReceiptMutation.isPending}
                    data-testid={`button-log-receipt-sheets-${r.id}`}
                  >
                    <FileCheck2 className="h-3.5 w-3.5" /> Log to Sheet
                  </Button>
                </div>
              ))}
              {receipts.length === 0 && <EmptyState icon={ReceiptText} title="No proof yet" text="Create receipts after each job and feed the clean record back into your Sheet." compact />}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function AssistantText({ content }: { content: string }) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return <div className="text-[15px] leading-7">No response yet.</div>;

  return (
    <div className="space-y-3 text-[15px] leading-7 text-card-foreground">
      {lines.map((line, index) => {
        if (line.startsWith("### ")) {
          return <div key={index} className="pt-1 font-display text-base font-bold text-foreground">{line.replace(/^###\s+/, "")}</div>;
        }
        if (line.startsWith("## ")) {
          return <div key={index} className="pt-2 font-display text-lg font-bold text-foreground">{line.replace(/^##\s+/, "")}</div>;
        }
        if (/^[-•]\s+/.test(line)) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <p className="max-w-none text-foreground/90">{line.replace(/^[-•]\s+/, "")}</p>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const number = line.match(/^\d+/)?.[0] ?? "";
          return (
            <div key={index} className="flex gap-3">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[11px] font-bold text-accent">{number}</span>
              <p className="max-w-none text-foreground/90">{line.replace(/^\d+\.\s+/, "")}</p>
            </div>
          );
        }
        return <p key={index} className="max-w-none text-foreground/90">{line}</p>;
      })}
    </div>
  );
}

function ReaderOverlay({ reader, onClose }: { reader: ExpandedReader; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md p-3 md:p-8" role="dialog" aria-modal="true" aria-label={reader.title} data-testid="modal-ai-reader">
      <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div>
            <div className="font-display text-lg font-bold">{reader.title}</div>
            <div className="text-xs text-muted-foreground">Large reader mode for dense AI answers and app notes.</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} className="gap-2" data-testid="button-close-ai-reader">
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 md:p-8">
          <AssistantText content={reader.body} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border border-card-border bg-card p-5 premium-panel"
      onClick={(event) => {
        if (event.detail >= 3 || isTripleTap(`panel-${title}`)) {
          dispatchReader(title, (event.currentTarget as HTMLElement).innerText);
        }
      }}
      onTouchEnd={(event) => {
        if (isTripleTap(`panel-${title}`)) {
          dispatchReader(title, (event.currentTarget as HTMLElement).innerText);
        }
      }}
      data-testid={`panel-${title.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <SectionTitle className="mb-0">{title}</SectionTitle>
      </div>
      {children}
    </section>
  );
}

function SignalCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="font-display font-bold text-2xl num">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="font-display font-bold text-lg num">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, compact = false }: { icon: React.ElementType; title: string; text: string; compact?: boolean }) {
  return (
    <div className={cn("h-full flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border", compact ? "p-4" : "p-8")}>
      <Icon className="h-8 w-8 text-muted-foreground mb-3" />
      <div className="font-display font-bold">{title}</div>
      <div className="text-xs text-muted-foreground max-w-sm mt-1">{text}</div>
    </div>
  );
}
