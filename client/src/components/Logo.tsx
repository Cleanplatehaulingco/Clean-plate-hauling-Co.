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
      className={cn("shrink-0 drop-shadow-[0_0_18px_hsl(var(--accent)/0.25)]", className)}
      data-testid="img-logo"
    >
      <rect x="4" y="4" width="56" height="56" rx="12" fill="#050806" stroke="hsl(var(--accent))" strokeWidth="3" />
      <path d="M13 25C18 20 25 18 32 18C39 18 46 20 51 25V43H13V25Z" fill="hsl(var(--accent))" />
      <path d="M18 31H46" stroke="#050806" strokeWidth="3" strokeLinecap="round" />
      <text x="32" y="41" textAnchor="middle" fontFamily="Impact, Space Grotesk, Arial Black, sans-serif" fontSize="18" fontWeight="900" fill="#050806" letterSpacing="-1.5">CP</text>
      <path d="M14 50H50" stroke="hsl(var(--accent))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function FullWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 168"
      role="img"
      aria-label="Clean Plate Hauling Co."
      className={cn("brand-wordmark-svg", className)}
      data-testid="img-brand-wordmark-svg"
    >
      <defs>
        <filter id="logoShadow" x="-8%" y="-20%" width="116%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity="0.32" />
        </filter>
      </defs>
      <g filter="url(#logoShadow)">
        <path d="M32 88C96 67 424 67 488 88" fill="none" stroke="hsl(var(--accent))" strokeWidth="8" strokeLinecap="round" opacity="0.9" />
        <text
          x="260"
          y="78"
          textAnchor="middle"
          fontFamily="Impact, Haettenschweiler, 'Arial Black', Space Grotesk, sans-serif"
          fontSize="72"
          fontWeight="900"
          letterSpacing="5"
          fill="currentColor"
          transform="skewX(-4)"
        >
          CLEAN PLATE
        </text>
        <path d="M88 106C126 94 394 94 432 106V140H88V106Z" fill="currentColor" />
        <path d="M86 122H22L86 112V122Z" fill="currentColor" />
        <path d="M434 122H498L434 112V122Z" fill="currentColor" />
        <text
          x="260"
          y="132"
          textAnchor="middle"
          fontFamily="JetBrains Mono, Space Grotesk, monospace"
          fontSize="32"
          fontWeight="900"
          letterSpacing="24"
          fill="hsl(var(--accent))"
        >
          HAULING CO.
        </text>
      </g>
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return <Logo size={32} />;
  }
  return (
    <div className="brand-logo-shell text-sidebar-foreground" data-testid="img-brand-wordmark">
      <FullWordmark />
    </div>
  );
}
