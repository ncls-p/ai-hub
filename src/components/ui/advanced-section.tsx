"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function AdvancedSection({
  children,
  label,
  hint,
  className,
}: {
  children: ReactNode;
  label: string;
  hint?: string;
  /** Kept for API compatibility; advanced sections are intentionally closed by default. */
  storageKey?: string;
  /** Kept for API compatibility; advanced sections are intentionally closed by default. */
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(shouldOpen: boolean) {
    setOpen(shouldOpen);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn("rounded-2xl border bg-card", className)}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium">
        <span>{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {!open && hint ? (
            <span className="hidden sm:inline">{hint}</span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 pb-4 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
