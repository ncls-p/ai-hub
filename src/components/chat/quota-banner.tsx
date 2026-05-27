"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function QuotaBanner({
	used,
	limit,
}: {
	used: number;
	limit: number;
}) {
	const percent = Math.min(100, Math.round((used / limit) * 100));
	if (percent < 80) return null;

	return (
		<div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-foreground">
			<div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<AlertTriangleIcon
						className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
						aria-hidden="true"
					/>
					<span>
						{percent >= 100
							? "Monthly token limit reached."
							: `Approaching monthly token limit (${percent}%).`}
					</span>
				</div>
				<Button asChild size="sm" variant="outline">
					<Link href="/usage">View usage</Link>
				</Button>
			</div>
		</div>
	);
}
