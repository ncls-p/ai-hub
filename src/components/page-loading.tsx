import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
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

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}
