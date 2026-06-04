import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ConfigSection({
	title,
	description,
	children,
	icon: Icon,
	className,
	stagger = "3",
}: {
	title: string;
	description?: string;
	children: ReactNode;
	icon?: LucideIcon;
	className?: string;
	/** Animation stagger class suffix (1–6) */
	stagger?: string;
}) {
	return (
		<Card
			className={cn(
				"hover-lift animate-in-up",
				`stagger-${stagger}`,
				className,
			)}
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					{Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
					{title}
				</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
