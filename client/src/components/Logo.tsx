import { cn } from "@/lib/utils";

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Clean Plate Hauling Co"
      className={cn("shrink-0", className)}
      data-testid="img-logo"
    >
      <rect x="2" y="2" width="60" height="60" rx="10" fill="hsl(var(--sidebar))" stroke="hsl(var(--sidebar-primary))" strokeWidth="2.5" />
      {/* Stenciled license-plate silhouette */}
      <rect x="9" y="18" width="46" height="28" rx="3" fill="hsl(var(--sidebar-primary))" />
      {/* bolt holes */}
      <circle cx="14" cy="23" r="1.4" fill="hsl(var(--sidebar))" />
      <circle cx="50" cy="23" r="1.4" fill="hsl(var(--sidebar))" />
      <circle cx="14" cy="41" r="1.4" fill="hsl(var(--sidebar))" />
      <circle cx="50" cy="41" r="1.4" fill="hsl(var(--sidebar))" />
      {/* CP wordmark */}
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontFamily="Space Grotesk, Inter, sans-serif"
        fontWeight="800"
        fontSize="18"
        fill="hsl(var(--sidebar))"
        letterSpacing="-1"
      >
        CP
      </text>
      {/* chevron arrows under plate = hauling */}
      <path d="M16 52 L20 55 L24 52" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M28 52 L32 55 L36 52" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M40 52 L44 55 L48 52" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return <Logo size={32} />;
  }
  return (
    <div className="brand-logo-shell flex min-w-0 items-center gap-2" data-testid="img-brand-wordmark">
      <Logo size={34} />
      <div className="min-w-0 leading-none">
        <div className="truncate text-sm font-black tracking-tight text-sidebar-foreground">Clean Plate</div>
        <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/65">Hauling Co</div>
      </div>
    </div>
  );
}
