"use client";

import { useEffect, useState, type ReactNode } from "react";
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
	storageKey,
	defaultOpen = false,
	className,
}: {
	children: ReactNode;
	label: string;
	hint?: string;
	/** Persist open state for power users */
	storageKey?: string;
	defaultOpen?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(defaultOpen);

	useEffect(() => {
		if (!storageKey) return;
		const stored = window.localStorage.getItem(storageKey);
		if (stored === "true") setOpen(true);
	}, [storageKey]);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (storageKey) {
			window.localStorage.setItem(storageKey, String(next));
		}
	}

	return (
		<Collapsible
			open={open}
			onOpenChange={handleOpenChange}
			className={cn(
				"rounded-xl border border-border/60 bg-background/45",
				className,
			)}
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
			<CollapsibleContent className="border-t border-border/50 px-4 pb-4 pt-3">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
