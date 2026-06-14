import { useEffect, useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { apiRequest, queryClient, setAuthToken } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Shell } from "@/components/Shell";
import { ShieldCheck, Loader2, LockKeyhole } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Pipeline from "@/pages/Pipeline";
import Dispatch from "@/pages/Dispatch";
import QuoteCalc from "@/pages/QuoteCalc";
import SheetsCRM from "@/pages/SheetsCRM";
import FollowUps from "@/pages/FollowUps";
import SettingsPage from "@/pages/Settings";
import AIBrain from "@/pages/AIBrain";
import BuilderMode from "@/pages/BuilderMode";

function AppRouter() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Pipeline} />
        <Route path="/dispatch" component={Dispatch} />
        <Route path="/quote" component={QuoteCalc} />
        <Route path="/ai-brain" component={AIBrain} />
        <Route path="/builder" component={BuilderMode} />
        <Route path="/sheets" component={SheetsCRM} />
        <Route path="/followups" component={FollowUps} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("__PORT_5000__".startsWith("__") ? "/api/auth/status" : "__PORT_5000__/api/auth/status")
      .then((res) => res.json())
      .then((status) => {
        setLoginRequired(!!status.loginRequired);
        setAuthed(!status.loginRequired);
      })
      .catch(() => {
        setLoginRequired(true);
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async () => {
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/auth/login", { password });
      const data = await res.json();
      setAuthToken(data.token ?? null);
      queryClient.clear();
      setAuthed(true);
    } catch (err: any) {
      setError(err.message || "Login failed.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Checking owner access...
        </div>
      </div>
    );
  }

  if (!loginRequired || authed) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.16),transparent_30%),radial-gradient(circle_at_80%_80%,hsl(150_55%_22%/0.32),transparent_34%)]" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-card-border bg-card p-6 shadow-2xl premium-panel" data-testid="panel-owner-login">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-xl font-bold">Owner Access</div>
            <div className="text-xs text-muted-foreground">Clean Plate Command Center is locked.</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-xs text-muted-foreground">
            Live CRM, Gmail invoices, AI Builder Mode, customer memory, and pricing tools require owner login before anything loads.
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") login();
            }}
            placeholder="Owner password"
            className="min-h-11"
            autoFocus
            data-testid="input-owner-password"
          />
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" data-testid="text-login-error">{error}</div>}
          <Button onClick={login} disabled={!password.trim() || submitting} className="w-full gap-2 premium-button min-h-11" data-testid="button-owner-login">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            Unlock app
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            For maximum protection on a real host, also set the outer Basic Auth username and password in the hosting secret manager.
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AuthGate>
              <AppRouter />
            </AuthGate>
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
