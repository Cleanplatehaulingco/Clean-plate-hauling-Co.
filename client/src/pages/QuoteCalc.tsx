import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead, Estimate, Settings as SettingsT } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Save, Truck, DollarSign, TrendingDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type QuoteResult = {
  estimatedCost: number;
  suggestedPrice: number;
  floorPrice: number;
  profitAtSuggested: number;
  marginAtSuggested: number;
  breakdown: {
    baseFee: number; volumePrice: number; stairsFee: number; heavyFee: number; travelFee: number;
    discount: number; dumpCost: number; laborCost: number; travelCost: number;
    loads: number; yards: number;
  };
  warning: string | null;
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function QuoteCalc() {
  const { toast } = useToast();
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: estimates = [] } = useQuery<Estimate[]>({ queryKey: ["/api/estimates"] });
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });

  const [form, setForm] = useState({
    leadId: null as number | null,
    customerName: "",
    truckFillPct: 50,
    laborMinutes: 90,
    crewSize: 2,
    stairsFlights: 0,
    heavyItems: 0,
    distanceMiles: 8,
    discount: 0,
    notes: "",
  });

  const [result, setResult] = useState<QuoteResult | null>(null);

  // Recalculate whenever form changes
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/calculate-quote", {
          truckFillPct: form.truckFillPct,
          laborMinutes: form.laborMinutes,
          crewSize: form.crewSize,
          stairsFlights: form.stairsFlights,
          heavyItems: form.heavyItems,
          distanceMiles: form.distanceMiles,
          discount: form.discount,
        });
        setResult(await res.json());
      } catch {}
    }, 80);
    return () => clearTimeout(t);
  }, [form.truckFillPct, form.laborMinutes, form.crewSize, form.stairsFlights, form.heavyItems, form.distanceMiles, form.discount]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result) return;
      const res = await apiRequest("POST", "/api/estimates", {
        leadId: form.leadId,
        customerName: form.customerName || "Walk-in",
        truckFillPct: form.truckFillPct,
        laborMinutes: form.laborMinutes,
        crewSize: form.crewSize,
        stairsFlights: form.stairsFlights,
        heavyItems: form.heavyItems,
        distanceMiles: form.distanceMiles,
        discount: form.discount,
        suggestedPrice: result.suggestedPrice,
        floorPrice: result.floorPrice,
        estimatedCost: result.estimatedCost,
        notes: form.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({ title: "Estimate saved", description: "On the books — tie it to a job when you book." });
    },
  });

  const onLeadSelect = (v: string) => {
    if (v === "none") {
      setForm({ ...form, leadId: null });
    } else {
      const lead = leads.find(l => l.id === Number(v));
      if (lead) {
        setForm({ ...form, leadId: lead.id, customerName: lead.name });
      }
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Quote calculator"
        title="Price the job in 60 seconds"
        description="Adjust truck fill, labor, and access — the price recalculates live. Floor price keeps you above margin even when you’re bidding tight."
      />

      <div className="grid lg:grid-cols-5 gap-4">
        {/* LEFT: inputs */}
        <div className="lg:col-span-3 rounded-lg border border-card-border bg-card p-5 space-y-5">
          <div>
            <SectionTitle>Customer</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-2">
              <Select value={form.leadId ? String(form.leadId) : "none"} onValueChange={onLeadSelect}>
                <SelectTrigger data-testid="select-lead"><SelectValue placeholder="Pull from lead..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Walk-in / new</SelectItem>
                  {leads.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} · {l.city}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Customer name"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                data-testid="input-customer-name"
              />
            </div>
          </div>

          <div>
            <SectionTitle>Load size</SectionTitle>
            <SliderField
              label="Truck fill"
              value={form.truckFillPct}
              min={5} max={200} step={5}
              suffix="%"
              hint={`${((form.truckFillPct / 100) * (settings?.crewCapacityYards ?? 15)).toFixed(1)} cubic yards`}
              onChange={(v) => setForm({ ...form, truckFillPct: v })}
              testid="slider-truck-fill"
            />
            <SliderField
              label="Labor on site"
              value={form.laborMinutes}
              min={30} max={480} step={15}
              suffix=" min"
              hint={`${(form.laborMinutes / 60).toFixed(2)} hours`}
              onChange={(v) => setForm({ ...form, laborMinutes: v })}
              testid="slider-labor-minutes"
            />
            <SliderField
              label="Crew size"
              value={form.crewSize}
              min={1} max={4} step={1}
              suffix=" pax"
              hint=""
              onChange={(v) => setForm({ ...form, crewSize: v })}
              testid="slider-crew-size"
            />
          </div>

          <div>
            <SectionTitle>Access &amp; difficulty</SectionTitle>
            <SliderField
              label="Stairs (flights)"
              value={form.stairsFlights}
              min={0} max={5} step={1}
              suffix=""
              hint={`+${fmtMoney((settings?.stairsFee ?? 25) * form.stairsFlights)}`}
              onChange={(v) => setForm({ ...form, stairsFlights: v })}
              testid="slider-stairs"
            />
            <SliderField
              label="Heavy items (hot tubs, pianos, safes)"
              value={form.heavyItems}
              min={0} max={6} step={1}
              suffix=""
              hint={`+${fmtMoney((settings?.heavyItemFee ?? 35) * form.heavyItems)}`}
              onChange={(v) => setForm({ ...form, heavyItems: v })}
              testid="slider-heavy"
            />
            <SliderField
              label="Distance from home base"
              value={form.distanceMiles}
              min={0} max={45} step={1}
              suffix=" mi"
              hint={`Round trip travel fee`}
              onChange={(v) => setForm({ ...form, distanceMiles: v })}
              testid="slider-distance"
            />
          </div>

          <div>
            <SectionTitle>Discount</SectionTitle>
            <div className="grid grid-cols-4 gap-2">
              {[0, 25, 50, 100].map(d => (
                <button
                  key={d}
                  onClick={() => setForm({ ...form, discount: d })}
                  className={cn(
                    "py-2 rounded-md border text-xs font-medium",
                    form.discount === d
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border hover-elevate"
                  )}
                  data-testid={`button-discount-${d}`}
                >
                  {d === 0 ? "None" : `−${fmtMoney(d)}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Quote notes</Label>
            <Textarea
              placeholder="Anything the crew needs to know..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              data-testid="input-quote-notes"
              className="mt-1"
            />
          </div>
        </div>

        {/* RIGHT: result */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-lg border border-card-border bg-card p-5">
            <SectionTitle>Live quote</SectionTitle>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-border pb-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-accent">Quote to customer</div>
                  <div className="font-display font-bold text-4xl num text-foreground" data-testid="text-suggested-price">
                    {result ? fmtMoney(result.suggestedPrice) : "—"}
                  </div>
                </div>
                <DollarSign className="h-6 w-6 text-accent" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">Floor price</div>
                  <div className="font-display font-bold text-lg num" data-testid="text-floor-price">{result ? fmtMoney(result.floorPrice) : "—"}</div>
                  <div className="text-[10px] text-muted-foreground">Don’t go below</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">Est. cost</div>
                  <div className="font-display font-bold text-lg num">{result ? fmtMoney(result.estimatedCost) : "—"}</div>
                  <div className="text-[10px] text-muted-foreground">Dump + labor + fuel</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">Profit</div>
                  <div className={cn(
                    "font-display font-bold text-lg num",
                    result && result.profitAtSuggested < 0 && "text-destructive"
                  )} data-testid="text-profit">{result ? fmtMoney(result.profitAtSuggested) : "—"}</div>
                  <div className="text-[10px] text-muted-foreground">At quoted price</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">Margin</div>
                  <div className="font-display font-bold text-lg num" data-testid="text-margin">{result ? `${result.marginAtSuggested}%` : "—"}</div>
                  <div className="text-[10px] text-muted-foreground">Target {settings?.targetMarginPct ?? 55}%</div>
                </div>
              </div>

              {result?.warning && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-destructive">Profit warning</div>
                    <div className="text-muted-foreground">{result.warning}</div>
                  </div>
                </div>
              )}

              {result && !result.warning && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-emerald-500">Cleared margin</div>
                    <div className="text-muted-foreground">This price keeps the truck honest.</div>
                  </div>
                </div>
              )}

              <Button onClick={() => saveMutation.mutate()} disabled={!result} className="w-full mt-1" data-testid="button-save-estimate">
                <Save className="h-4 w-4 mr-1.5" /> Save estimate
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-card-border bg-card p-5">
              <SectionTitle>Breakdown</SectionTitle>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                <BL label="Base truck fee" value={result.breakdown.baseFee} />
                <BL label={`Volume (${result.breakdown.yards} yd³)`} value={result.breakdown.volumePrice} />
                {result.breakdown.stairsFee > 0 && <BL label="Stairs" value={result.breakdown.stairsFee} />}
                {result.breakdown.heavyFee > 0 && <BL label="Heavy items" value={result.breakdown.heavyFee} />}
                {result.breakdown.travelFee > 0 && <BL label="Travel fee (round-trip)" value={result.breakdown.travelFee} />}
                {result.breakdown.discount > 0 && <BL label="Discount" value={-result.breakdown.discount} />}
                <li className="border-t border-border pt-1.5 mt-1.5 flex justify-between font-medium text-foreground">
                  <span>Quote</span>
                  <span className="num">{fmtMoney(result.suggestedPrice)}</span>
                </li>
                <li className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-2">Costs</li>
                <BL label={`Dump fees (${result.breakdown.loads} load${result.breakdown.loads === 1 ? "" : "s"})`} value={result.breakdown.dumpCost} />
                <BL label="Labor" value={result.breakdown.laborCost} />
                <BL label="Fuel (≈40% of travel)" value={result.breakdown.travelCost} />
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Recent estimates */}
      {estimates.length > 0 && (
        <div className="mt-6 rounded-lg border border-card-border bg-card p-5">
          <SectionTitle>Recent estimates</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Customer</th>
                  <th className="text-left py-2">Load</th>
                  <th className="text-left py-2">Labor</th>
                  <th className="text-right py-2">Cost</th>
                  <th className="text-right py-2">Floor</th>
                  <th className="text-right py-2">Quote</th>
                </tr>
              </thead>
              <tbody>
                {estimates.slice(0, 6).map(e => (
                  <tr key={e.id} className="border-t border-border" data-testid={`row-estimate-${e.id}`}>
                    <td className="py-2.5">{e.customerName}</td>
                    <td className="py-2.5 text-muted-foreground">{e.truckFillPct}%</td>
                    <td className="py-2.5 text-muted-foreground">{(e.laborMinutes / 60).toFixed(1)} hr</td>
                    <td className="py-2.5 text-right num text-muted-foreground">{fmtMoney(e.estimatedCost)}</td>
                    <td className="py-2.5 text-right num text-muted-foreground">{fmtMoney(e.floorPrice)}</td>
                    <td className="py-2.5 text-right num font-medium">{fmtMoney(e.suggestedPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function SliderField({ label, value, min, max, step, suffix, hint, onChange, testid }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string; hint: string;
  onChange: (v: number) => void; testid?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <Label className="text-xs">{label}</Label>
        <span className="font-display font-bold text-sm num" data-testid={testid && `${testid}-value`}>{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} data-testid={testid} />
      {hint && <div className="text-[10.5px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function BL({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between">
      <span>{label}</span>
      <span className="num">{fmtMoney(value)}</span>
    </li>
  );
}
