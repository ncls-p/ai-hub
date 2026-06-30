"use client";

import { Link } from "@/i18n/navigation";
import { AlertTriangleIcon, BarChart3Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuotaBanner({ used, limit }: { used: number; limit: number }) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  if (percent < 80) return null;

  const isCritical = percent >= 100;
  const isWarning = percent >= 90;

  const barColor = isCritical
    ? "bg-destructive"
    : isWarning
      ? "bg-warning"
      : "bg-info";

  const borderColor = isCritical
    ? "border-destructive/30"
    : isWarning
      ? "border-warning/30"
      : "border-info/30";

  const bgColor = isCritical
    ? "bg-destructive/[0.04]"
    : isWarning
      ? "bg-warning/[0.06]"
      : "bg-info/[0.04]";

  const iconColor = isCritical
    ? "text-destructive"
    : isWarning
      ? "text-warning"
      : "text-info";

  return (
    <div className={cn("border-b px-4 py-3 text-sm", borderColor, bgColor)}>
      <div className="mx-auto flex max-w-4xl items-center gap-4">
        {/* Icon */}
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            isCritical
              ? "bg-destructive/10"
              : isWarning
                ? "bg-warning/10"
                : "bg-info/10",
          )}
        >
          <AlertTriangleIcon
            className={cn("size-4", iconColor)}
            aria-hidden="true"
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {isCritical
                ? "Monthly token limit reached"
                : isWarning
                  ? "Approaching token limit rapidly"
                  : "Approaching monthly token limit"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
                  barColor,
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                iconColor,
              )}
            >
              {percent}%
            </span>
          </div>
        </div>

        {/* Action */}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
        >
          <Link href="/usage">
            <BarChart3Icon className="size-3.5" aria-hidden="true" />
            View usage
          </Link>
        </Button>
      </div>
    </div>
  );
}
