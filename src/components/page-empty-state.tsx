import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function PageEmptyState({
	icon: Icon,
	title,
	description,
	children,
	className,
}: {
	icon?: LucideIcon;
	title: string;
	description?: string;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<Empty className={cn("min-h-[12rem]", className)}>
			<EmptyHeader>
				{Icon ? (
					<EmptyMedia variant="icon">
						<Icon aria-hidden="true" />
					</EmptyMedia>
				) : null}
				<EmptyTitle>{title}</EmptyTitle>
				{description ? <EmptyDescription>{description}</EmptyDescription> : null}
			</EmptyHeader>
			{children ? <EmptyContent>{children}</EmptyContent> : null}
		</Empty>
	);
}
