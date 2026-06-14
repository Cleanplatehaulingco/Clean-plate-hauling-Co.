import { useMutation, useQuery } from "@tanstack/react-query";
import type { ElementType } from "react";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertCircle, CheckCircle2, DatabaseZap, Download, ExternalLink,
  FileSpreadsheet, Loader2, Radio, RefreshCw, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SheetsStatus = {
  connected: boolean;
  spreadsheetId: string;
  spreadsheetName: string;
  url: string;
  crm?: { sheetName: string; headers: string[]; rowCount: number };
  jobs?: { sheetName: string; headers: string[]; rowCount: number };
  aiLogExists: boolean;
  checkedAt?: string;
};

type SheetsPreview = {
  spreadsheetName: string;
  crm: { headers: string[]; rows: Record<string, any>[]; rowCount: number };
  jobs: { headers: string[]; rows: Record<string, any>[]; rowCount: number };
  mapping: Record<string, string>;
};

type SyncReport = {
  ok: boolean;
  checkedAt: string;
  dashboardUrl: string;
  counts: { appLeads: number; sheetCrmRows: number; appJobs: number; sheetJobRows: number };
  mismatches: {
    missingInSheetLeads: any[];
    missingInAppLeads: any[];
    missingInSheetJobs: any[];
    missingInAppJobs: any[];
    missingFields: { crm: any[]; jobs: any[] };
  };
};

export default function SheetsCRM() {
  const { toast } = useToast();
  const {
    data: status,
    isFetching: statusLoading,
    refetch: refetchStatus,
    error: statusError,
  } = useQuery<SheetsStatus>({ queryKey: ["/api/sheets/status"], retry: false, staleTime: 15_000 });
  const {
    data: preview,
    isFetching: previewLoading,
    refetch: refetchPreview,
    error: previewError,
  } = useQuery<SheetsPreview>({ queryKey: ["/api/sheets/preview"], retry: false, staleTime: 15_000 });
  const { data: report, refetch: refetchReport, isFetching: reportLoading } = useQuery<SyncReport>({ queryKey: ["/api/sync/report"], retry: false, staleTime: 15_000 });

  const importMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/sheets/import-crm", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-ops"] });
      toast({
        title: "CRM import complete",
        description: `Scanned ${data.scanned} CRM rows and added ${data.imported} new lead${data.imported === 1 ? "" : "s"} by phone match.`,
      });
    },
  });

  const importJobsMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/sheets/import-jobs", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live-ops"] });
      toast({
        title: "Job Entry import complete",
        description: `Scanned ${data.scanned} job rows and added ${data.imported} new job${data.imported === 1 ? "" : "s"} by phone/date/type match.`,
      });
    },
  });

  const refreshSyncMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/sync/refresh", {})).json(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync/report"] });
      refetchReport();
      toast({
        title: "Two-way sync refresh complete",
        description: `Imported ${data.crmImport.imported} CRM lead${data.crmImport.imported === 1 ? "" : "s"} and ${data.jobImport.imported} job${data.jobImport.imported === 1 ? "" : "s"} from Google Sheets.`,
      });
    },
  });

  const refresh = () => {
    refetchStatus();
    refetchPreview();
    refetchReport();
  };

  const connected = !!status?.connected && !!preview;
  const apiBase = (typeof window !== "undefined" && (window as any).__API_BASE__) || "";

  return (
    <>
      <PageHeader
        eyebrow="Google Sheets CRM"
        title={connected ? "Live CRM connected" : "Checking CRM connection"}
        description="This page is wired to your real Junk Removal Business Tracker. New app leads write to CRM, new app jobs write to Job Entry, and AI quotes/receipts write to AI App Log."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refresh} disabled={statusLoading || previewLoading} className="gap-2" data-testid="button-refresh-sheets">
              {(statusLoading || previewLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test live
            </Button>
            {status?.url && (
              <a href={status.url} target="_blank" rel="noreferrer">
                <Button className="gap-2 premium-button" data-testid="button-open-live-sheet">
                  <ExternalLink className="h-4 w-4" /> Open CRM
                </Button>
              </a>
            )}
          </div>
        }
      />

      <div className={`rounded-xl border p-5 mb-5 ${connected ? "border-accent/35 bg-accent/10" : "border-destructive/35 bg-destructive/10"}`}>
        <div className="flex items-start gap-3">
          {connected ? <CheckCircle2 className="h-5 w-5 text-accent mt-0.5" /> : <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />}
          <div className="flex-1">
            <div className="font-display font-bold text-base" data-testid="text-sheets-connection-status">
              {connected ? `Connected to ${status?.spreadsheetName}` : "CRM connection is not live in this browser session"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {connected
                ? `Two-way sync is enabled: app-created leads → CRM, app-created jobs → Job Entry, AI photo quotes/receipts → ${status?.aiLogExists ? "existing" : "new"} AI App Log.`
                : `${(statusError as Error)?.message || (previewError as Error)?.message || "Press Test live. If it still fails, the deployed server needs the Sheets credential refreshed."}`}
            </div>
          </div>
          <Badge variant="outline" className={connected ? "border-accent/50 text-accent" : "border-destructive/50 text-destructive"}>
            <Radio className="h-3 w-3 mr-1.5" />
            {connected ? "Live" : "Needs test"}
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4 mb-5">
        <Metric label="Spreadsheet" value={status?.spreadsheetName ?? "—"} icon={FileSpreadsheet} />
        <Metric label="CRM rows" value={String(preview?.crm.rowCount ?? status?.crm?.rowCount ?? "—")} icon={DatabaseZap} />
        <Metric label="Job rows" value={String(preview?.jobs.rowCount ?? status?.jobs?.rowCount ?? "—")} icon={DatabaseZap} />
        <Metric label="AI App Log" value={status?.aiLogExists ? "Ready" : "Creates on first push"} icon={ShieldCheck} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <SyncCard title="App lead → CRM" body="Every new lead created in the app appends a row to the CRM tab with APP-L ID, phone, status, source, next follow-up, and notes." ok />
        <SyncCard title="App job → Job Entry" body="Every new job created by the app appends a row to Job Entry with APP-J ID, date, customer, phone, job type, amount, and notes." ok />
        <SyncCard title="AI quote/receipt → AI App Log" body="AI photo quotes and receipt/proof records write to a separate AI App Log tab so the main tracker stays clean." ok />
      </div>

      <section className="rounded-xl border border-card-border bg-card p-5 premium-panel mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <SectionTitle className="mb-1">Sync health</SectionTitle>
            <p className="text-sm text-muted-foreground">Checks both directions, flags missing rows, and highlights required fields missing from your sheet.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => refetchReport()} disabled={reportLoading} className="gap-2" data-testid="button-sync-report">
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Check mismatches
            </Button>
            <Button onClick={() => refreshSyncMutation.mutate()} disabled={refreshSyncMutation.isPending} className="gap-2 premium-button" data-testid="button-refresh-two-way-sync">
              {refreshSyncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              Pull Sheet rows into app
            </Button>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <Metric label="App leads" value={String(report?.counts.appLeads ?? "—")} icon={DatabaseZap} />
          <Metric label="Sheet CRM" value={String(report?.counts.sheetCrmRows ?? "—")} icon={FileSpreadsheet} />
          <Metric label="App jobs" value={String(report?.counts.appJobs ?? "—")} icon={DatabaseZap} />
          <Metric label="Sheet jobs" value={String(report?.counts.sheetJobRows ?? "—")} icon={FileSpreadsheet} />
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Mismatch label="App leads missing in Sheet" items={report?.mismatches.missingInSheetLeads ?? []} />
          <Mismatch label="Sheet leads missing in app" items={report?.mismatches.missingInAppLeads ?? []} />
          <Mismatch label="App jobs missing in Sheet" items={report?.mismatches.missingInSheetJobs ?? []} />
          <Mismatch label="Sheet jobs missing in app" items={report?.mismatches.missingInAppJobs ?? []} />
          <Mismatch label="CRM missing fields" items={report?.mismatches.missingFields.crm ?? []} />
          <Mismatch label="Job Entry missing fields" items={report?.mismatches.missingFields.jobs ?? []} />
        </div>
      </section>

      <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-4 mb-5">
        <section className="rounded-xl border border-card-border bg-card p-5 premium-panel">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle className="mb-0">Live CRM preview</SectionTitle>
            <div className="flex gap-2">
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!connected || importMutation.isPending}
              className="gap-2 premium-button"
              data-testid="button-import-live-crm"
            >
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              Import CRM
            </Button>
            <Button
              onClick={() => importJobsMutation.mutate()}
              disabled={!connected || importJobsMutation.isPending}
              variant="secondary"
              className="gap-2"
              data-testid="button-import-live-jobs"
            >
              {importJobsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              Import Jobs
            </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Import only adds rows missing from the app by phone/date/type matching. It does not overwrite, delete, or rearrange your Google Sheet.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Customer Name", "Phone", "Lead Source", "Status", "Next Follow-Up", "Total Revenue"].map(h => (
                    <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview?.crm.rows ?? []).slice(0, 8).map((row, i) => (
                  <tr key={i} className="border-t border-border" data-testid={`row-live-crm-${i}`}>
                    <td className="px-3 py-2 font-medium">{row["Customer Name"] || "—"}</td>
                    <td className="px-3 py-2 font-mono">{row["Phone"] || "—"}</td>
                    <td className="px-3 py-2">{row["Lead Source"] || "—"}</td>
                    <td className="px-3 py-2">{row["Status"] || "—"}</td>
                    <td className="px-3 py-2">{row["Next Follow-Up"] || "—"}</td>
                    <td className="px-3 py-2 font-mono">{row["Total Revenue"] || "—"}</td>
                  </tr>
                ))}
                {!preview?.crm.rows?.length && (
                  <tr><td className="px-3 py-6 text-muted-foreground text-center" colSpan={6}>Press Test live to read the CRM tab.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-card-border bg-card p-5 premium-panel">
          <SectionTitle>Detected column mapping</SectionTitle>
          <div className="space-y-2 mt-3">
            {Object.entries(preview?.mapping ?? {}).map(([appField, sheetColumn]) => (
              <div key={appField} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/50 px-3 py-2" data-testid={`row-live-map-${appField}`}>
                <span className="font-mono text-[11px] text-muted-foreground">{appField}</span>
                <span className="text-sm font-medium text-right">{sheetColumn}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-accent/25 bg-accent/10 p-3 text-xs text-muted-foreground">
            Your CRM sheet stays the source of truth. The app reads it live, imports safe copies, writes new app leads/jobs to the correct main tabs, and writes AI quote/receipt records to the separate log tab.
          </div>
        </section>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-5 premium-panel">
        <div className="flex items-center justify-between gap-4 mb-4">
          <SectionTitle className="mb-0">Exports still available</SectionTitle>
          <Badge variant="outline">Backup workflow</Badge>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <ExportRow href={`${apiBase}/api/export/leads.csv`} label="Leads CSV" filename="cphc-leads.csv" />
          <ExportRow href={`${apiBase}/api/export/jobs.csv`} label="Jobs CSV" filename="cphc-jobs.csv" />
          <ExportRow href={`${apiBase}/api/export/estimates.csv`} label="Estimates CSV" filename="cphc-estimates.csv" />
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: ElementType }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 premium-panel" data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="font-display font-bold text-xl truncate">{value}</div>
    </div>
  );
}

function SyncCard({ title, body, ok }: { title: string; body: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 premium-panel" data-testid={`sync-card-${title.toLowerCase().replaceAll(" ", "-").replaceAll("→", "to")}`}>
      <div className="flex items-center gap-2 mb-2">
        {ok ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        <div className="font-display font-bold text-sm">{title}</div>
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function Mismatch({ label, items }: { label: string; items: any[] }) {
  const clean = items.filter(Boolean);
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3" data-testid={`mismatch-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <Badge variant="outline" className={clean.length ? "border-destructive/40 text-destructive" : "border-accent/40 text-accent"}>
          {clean.length}
        </Badge>
      </div>
      {clean.length ? (
        <div className="space-y-1 max-h-24 overflow-auto">
          {clean.slice(0, 4).map((item, i) => (
            <div key={i} className="text-xs text-muted-foreground truncate">
              {item.name || item.id || `Row ${item.rowNumber || i + 1}`} {item.missing ? `· missing ${item.missing.join(", ")}` : ""}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No issue found.</div>
      )}
    </div>
  );
}

function ExportRow({ href, label, filename }: { href: string; label: string; filename: string }) {
  return (
    <a href={href} download={filename} className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3 hover-elevate" data-testid={`link-export-${filename}`}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground font-mono">{filename}</div>
      </div>
      <Download className="h-4 w-4 text-accent" />
    </a>
  );
}
