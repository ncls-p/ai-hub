import type { ReactNode } from "react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { StatusBadge, type StatusKind } from "./status-badge";

export function ResourceCard({
	title,
	description,
	status,
	statusLabel,
	actions,
	children,
	className,
}: {
	title: string;
	description?: string;
	status?: StatusKind;
	statusLabel?: string;
	actions?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<Card className={cn("flex flex-col transition-colors hover:border-primary/35", className)}>
			<CardHeader className="gap-2 pb-2">
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="text-base">{title}</CardTitle>
					{status && statusLabel ? (
						<StatusBadge kind={status} label={statusLabel} />
					) : null}
				</div>
				{description ? (
					<p className="text-sm text-muted-foreground">{description}</p>
				) : null}
			</CardHeader>
			{children ? <CardContent className="pt-0">{children}</CardContent> : null}
			{actions ? (
				<CardFooter className="mt-auto flex flex-wrap gap-2 border-t border-border/50 pt-4">
					{actions}
				</CardFooter>
			) : null}
		</Card>
	);
}
