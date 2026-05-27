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
	return (
		<div
			className={cn(
				"flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/60",
				className,
			)}
			aria-live="polite"
			aria-busy="true"
		>
			<Loader2 className="size-5 animate-spin text-muted-foreground" />
			<p className="text-sm text-muted-foreground">{label}</p>
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
