import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageLoading({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  const displayLabel = label.endsWith("…") ? label : `${label}…`;

  return (
    <div
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{displayLabel}</p>
    </div>
  );
}
