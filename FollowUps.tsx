import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FollowUp, Settings as SettingsT } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Copy, Phone, MessageSquare, Mail, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  quote_sent: "Quote sent",
  missed_call: "Missed call",
  post_job_review: "Post-job review",
  no_show: "No-show / no-answer",
  next_day_check: "Day-before check",
};

const CHANNEL_ICON: Record<string, any> = {
  call: Phone, text: MessageSquare, email: Mail,
};

export default function FollowUps() {
  const { data: follows = [] } = useQuery<FollowUp[]>({ queryKey: ["/api/follow-ups"] });
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });
  const { toast } = useToast();
  const [activeKind, setActiveKind] = useState<string>("quote_sent");

  // Variables to substitute
  const [vars, setVars] = useState({
    name: "Dana", owner: "Mike", city: "Wixom",
    jobType: "garage cleanout", address: "29420 Pontiac Trail",
    timeWindow: "8 – 10 AM",
  });

  const filtered = follows.filter(f => f.kind === activeKind);

  const render = (body: string) =>
    body
      .replace(/{{name}}/g, vars.name)
      .replace(/{{owner}}/g, vars.owner)
      .replace(/{{city}}/g, vars.city)
      .replace(/{{jobType}}/g, vars.jobType)
      .replace(/{{address}}/g, vars.address)
      .replace(/{{timeWindow}}/g, vars.timeWindow);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Paste it into your phone or email." });
    } catch {
      toast({ title: "Couldn’t copy", description: "Highlight + copy manually." });
    }
  };

  const kinds = Array.from(new Set(follows.map(f => f.kind)));

  return (
    <>
      <PageHeader
        eyebrow="Follow-up scripts"
        title="The machine"
        description="Pre-written call, text, and email scripts for every gap in the sales process. Personalize the variables, tap copy, paste, send."
      />

      {/* Variable bar */}
      <div className="rounded-lg border border-card-border bg-card p-4 mb-5">
        <SectionTitle>Variables</SectionTitle>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
          {(Object.keys(vars) as (keyof typeof vars)[]).map(k => (
            <label key={k} className="block">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{`{{${k}}}`}</div>
              <input
                value={vars[k]}
                onChange={(e) => setVars({ ...vars, [k]: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm"
                data-testid={`input-var-${k}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {kinds.map(k => (
          <button
            key={k}
            onClick={() => setActiveKind(k)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
              activeKind === k
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border text-muted-foreground hover-elevate"
            )}
            data-testid={`tab-kind-${k}`}
          >
            {KIND_LABELS[k] || k}
          </button>
        ))}
      </div>

      {/* Scripts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {filtered.map(f => {
          const Icon = CHANNEL_ICON[f.channel] || MessageSquare;
          const rendered = render(f.body);
          return (
            <div key={f.id} className="rounded-lg border border-card-border bg-card overflow-hidden" data-testid={`script-${f.id}`}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/30">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" />
                  <div className="text-sm font-medium">{f.title}</div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {f.channel}
                  </Badge>
                </div>
                <button
                  onClick={() => copyText(rendered)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent text-accent-foreground hover-elevate active-elevate-2"
                  data-testid={`button-copy-${f.id}`}
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 font-mono text-[13px]">
                {rendered}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-card-border bg-card p-5">
        <SectionTitle>Why this works</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3 mt-2">
          <Tip
            title="Same-day text after missed call"
            body="80% of missed-call leads call the next guy in 10 minutes. A text in 60 seconds gets you back in the running."
          />
          <Tip
            title="24h check-in on quotes"
            body="If they ghosted the quote, they’re shopping. A casual nudge — not a salesy push — re-opens the conversation."
          />
          <Tip
            title="Review ask while truck is still in the driveway"
            body="The single highest-converting moment for a Google review is the second the job is done. Don’t wait for the email."
          />
        </div>
      </div>
    </>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <CheckCircle2 className="h-4 w-4 text-accent mb-2" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 leading-snug">{body}</div>
    </div>
  );
}
