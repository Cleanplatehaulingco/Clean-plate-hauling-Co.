import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4 mb-6 pb-5 border-b border-border", className)}>
      <div>
        {eyebrow && (
          <div className="font-mono text-[10.5px] tracking-[0.22em] uppercase text-muted-foreground mb-2" data-testid="text-page-eyebrow">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-bold text-2xl md:text-[28px] leading-tight tracking-tight" data-testid="text-page-title">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl" data-testid="text-page-description">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[10.5px] tracking-[0.2em] uppercase text-muted-foreground mb-3", className)}>
      {children}
    </div>
  );
}
