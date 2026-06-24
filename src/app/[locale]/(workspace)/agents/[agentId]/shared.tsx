import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─── Metric Cell (listing-page style) ────────────────────────────── */

export function MetricCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-2xl font-bold leading-none",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Tab Badge ───────────────────────────────────────────────────── */

export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
      {count}
    </Badge>
  );
}
