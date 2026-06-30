import { Wrench } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { TRANSPORT_ICONS, transportAccent } from "./transport";

export function TransportTypeIcon({
  transport,
  className,
}: {
  transport: string;
  className?: string;
}) {
  const Icon = TRANSPORT_ICONS[transport] ?? Wrench;
  const colors = transportAccent(transport);
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        colors.iconBg,
        colors.text,
        className,
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}

export function ServerCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-8 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}
