import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusKind = "ready" | "warning" | "error" | "pending";

const styles: Record<StatusKind, string> = {
	ready: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	warning: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-400",
	error: "border-destructive/25 bg-destructive/10 text-destructive",
	pending: "border-border/60 bg-muted/50 text-muted-foreground",
};

export function StatusBadge({
	kind,
	label,
	className,
}: {
	kind: StatusKind;
	label: string;
	className?: string;
}) {
	return (
		<Badge variant="outline" className={cn("rounded-lg text-[11px] font-medium", styles[kind], className)}>
			{label}
		</Badge>
	);
}
