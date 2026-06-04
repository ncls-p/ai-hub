import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusKind = "ready" | "warning" | "error" | "pending";

const styles: Record<StatusKind, string> = {
	ready: "border-success/30 bg-success/10 text-success",
	warning: "border-warning/30 bg-warning/10 text-warning",
	error: "border-destructive/25 bg-destructive/10 text-destructive",
	pending: "border-border bg-muted/50 text-muted-foreground",
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
