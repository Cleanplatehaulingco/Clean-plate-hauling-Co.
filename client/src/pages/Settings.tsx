import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings as SettingsT } from "@shared/schema";
import { PageHeader, SectionTitle } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { data: settings } = useQuery<SettingsT>({ queryKey: ["/api/settings"] });
  const [form, setForm] = useState<Partial<SettingsT> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SettingsT>) => {
      const res = await apiRequest("PATCH", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Saved", description: "Pricing dialed in." });
    },
  });

  if (!form) return null;

  const update = (k: keyof SettingsT, v: any) => setForm({ ...form, [k]: v });

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Owner controls"
        description="Set the pricing variables that drive every quote, every margin calculation, every dispatch decision."
        actions={
          <Button onClick={() => saveMutation.mutate(form)} className="gap-1.5" data-testid="button-save-settings">
            <Save className="h-4 w-4" /> Save changes
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Identity">
          <Field label="Business name" testid="input-business-name">
            <Input value={form.businessName ?? ""} onChange={(e) => update("businessName", e.target.value)} data-testid="input-business-name" />
          </Field>
          <Field label="Home base">
            <Input value={form.homeBase ?? ""} onChange={(e) => update("homeBase", e.target.value)} data-testid="input-home-base" />
          </Field>
        </Card>

        <Card title="Pricing variables">
          <MoneyField label="Base truck fee" value={form.baseTruckFee} onChange={(v) => update("baseTruckFee", v)} testid="input-base-truck-fee" hint="Charged on every job regardless of volume." />
          <MoneyField label="Price per cubic yard" value={form.pricePerYard} onChange={(v) => update("pricePerYard", v)} testid="input-price-per-yard" hint="Drives volume-based pricing." />
          <MoneyField label="Minimum job price" value={form.minimumJobPrice} onChange={(v) => update("minimumJobPrice", v)} testid="input-min-price" hint="Quote never goes below this." />
          <NumField label="Target margin %" value={form.targetMarginPct} onChange={(v) => update("targetMarginPct", v)} testid="input-target-margin" hint="Floor price is calculated from this." />
        </Card>

        <Card title="Costs">
          <MoneyField label="Dump fee per load" value={form.dumpFeePerLoad} onChange={(v) => update("dumpFeePerLoad", v)} testid="input-dump-fee" hint="What the transfer station charges per truck-load." />
          <MoneyField label="Labor hourly rate" value={form.laborHourlyRate} onChange={(v) => update("laborHourlyRate", v)} testid="input-labor-rate" hint="Per crew member. Used to estimate cost on quotes." />
          <MoneyField label="Travel fee per mile" value={form.travelFeePerMile} onChange={(v) => update("travelFeePerMile", v)} testid="input-travel-fee" hint="Charged round-trip on quotes beyond home base." />
        </Card>

        <Card title="Add-ons & capacity">
          <MoneyField label="Stairs fee (per flight)" value={form.stairsFee} onChange={(v) => update("stairsFee", v)} testid="input-stairs-fee" />
          <MoneyField label="Heavy item fee" value={form.heavyItemFee} onChange={(v) => update("heavyItemFee", v)} testid="input-heavy-fee" hint="Hot tubs, pianos, safes — anything that bends backs." />
          <NumField label="Crew truck capacity (yd³)" value={form.crewCapacityYards} onChange={(v) => update("crewCapacityYards", v)} testid="input-capacity" hint="Used to translate truck-fill % into yards." />
        </Card>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-5">
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-3 mt-1">{children}</div>
    </div>
  );
}

function Field({ label, children, hint, testid }: { label: string; children: React.ReactNode; hint?: string; testid?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function MoneyField({ label, value, onChange, hint, testid }: { label: string; value: number | undefined; onChange: (v: number) => void; hint?: string; testid?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input
          type="number"
          step="0.01"
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="pl-7"
          data-testid={testid}
        />
      </div>
    </Field>
  );
}

function NumField({ label, value, onChange, hint, testid }: { label: string; value: number | undefined; onChange: (v: number) => void; hint?: string; testid?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testid}
      />
    </Field>
  );
}
