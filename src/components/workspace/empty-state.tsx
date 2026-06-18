import type { ReactNode } from "react";

import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function WorkspaceEmptyState({
	icon,
	title,
	description,
	actions,
	className,
}: {
	icon?: ReactNode;
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<Empty className={cn("min-h-48 w-full border bg-card", className)}>
			<EmptyHeader>
				{icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
				<EmptyTitle>{title}</EmptyTitle>
				{description ? (
					<EmptyDescription>{description}</EmptyDescription>
				) : null}
			</EmptyHeader>
			{actions ? (
				<div className="flex flex-wrap justify-center gap-2">{actions}</div>
			) : null}
		</Empty>
	);
}
