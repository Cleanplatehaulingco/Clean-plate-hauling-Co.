import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Truck, Calculator, FileSpreadsheet,
  MessageSquareText, Settings as SettingsIcon, Sun, Moon, Radio, Sparkles, Hammer, Globe2,
} from "lucide-react";
import { Wordmark } from "./Logo";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";
import type { Job, Lead } from "@shared/schema";

const NAV = [
  { href: "/", label: "Command", icon: LayoutDashboard, testid: "nav-command" },
  { href: "/leads", label: "Pipeline", icon: Users, testid: "nav-leads" },
  { href: "/dispatch", label: "Dispatch", icon: Truck, testid: "nav-dispatch" },
  { href: "/quote", label: "Quote Calc", icon: Calculator, testid: "nav-quote" },
  { href: "/ai-brain", label: "AI Brain", icon: Sparkles, testid: "nav-ai-brain" },
  { href: "/builder", label: "AI Builder", icon: Hammer, testid: "nav-builder" },
  { href: "/sheets", label: "Sheets CRM", icon: FileSpreadsheet, testid: "nav-sheets" },
  { href: "/followups", label: "Follow-ups", icon: MessageSquareText, testid: "nav-followups" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const today = new Date().toISOString().slice(0, 10);
  const todaysJobs = jobs.filter(j => j.scheduledDate === today && j.status !== "completed" && j.status !== "cancelled").length;
  const openLeads = leads.filter(l => l.stage === "new" || l.stage === "quote_sent" || l.stage === "follow_up").length;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* SIDEBAR */}
      <aside
        className="hidden md:flex w-[284px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
        data-testid="sidebar"
      >
        <div className="h-24 flex items-center px-5 border-b border-sidebar-border bg-gradient-to-b from-sidebar-accent/55 to-transparent">
          <Wordmark />
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testid}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] font-medium tracking-tight transition-all duration-300",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover-elevate"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom status block */}
        <div className="m-3 rounded-xl border border-sidebar-primary/25 bg-sidebar-accent/55 p-4 space-y-3 shadow-2xl">
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-sidebar-foreground/60 font-mono">
            <Radio className="h-3 w-3 text-sidebar-primary" />
            <span>CRM command live</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="font-display font-bold text-xl text-sidebar-foreground num" data-testid="text-sidebar-today">{todaysJobs}</div>
              <div className="text-sidebar-foreground/60 leading-tight">jobs today</div>
            </div>
            <div>
              <div className="font-display font-bold text-xl text-sidebar-foreground num" data-testid="text-sidebar-open-leads">{openLeads}</div>
              <div className="text-sidebar-foreground/60 leading-tight">open leads</div>
            </div>
          </div>
        </div>

        <a
          href="https://www.cleanplatehaulingco.com"
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-md border border-sidebar-border text-[12px] text-sidebar-foreground/80 hover-elevate"
        >
          <Globe2 className="h-3.5 w-3.5 text-sidebar-primary" />
          <span>cleanplatehaulingco.com</span>
        </a>

        <button
          onClick={toggle}
          data-testid="button-theme-toggle"
          className="m-3 mt-0 flex items-center gap-2 px-3 py-2 rounded-md border border-sidebar-border text-[12px] text-sidebar-foreground/80 hover-elevate"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span>{theme === "dark" ? "Daylight mode" : "Dispatch mode"}</span>
        </button>
      </aside>

      {/* MOBILE TOP BAR */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex items-center justify-between px-4">
        <Wordmark />
        <button
          onClick={toggle}
          className="p-2 rounded-md hover-elevate"
          data-testid="button-theme-toggle-mobile"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* MAIN */}
      <main className="flex-1 min-w-0 md:pl-0 pt-14 md:pt-0">
        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border grid grid-cols-4 px-1 py-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex flex-col items-center justify-center text-[9px] py-1.5 rounded-md",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/70"
              )}>
                <Icon className="h-4 w-4 mb-0.5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="px-5 lg:px-8 py-6 pb-24 md:pb-8 max-w-[1500px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
