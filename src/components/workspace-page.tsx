import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WorkspacePageWidth = "narrow" | "default" | "wide" | "full";

const widthClass: Record<WorkspacePageWidth, string> = {
	narrow: "max-w-3xl",
	default: "max-w-5xl",
	wide: "max-w-6xl",
	full: "max-w-7xl",
};

export function WorkspacePage({
	kicker,
	title,
	description,
	width = "default",
	actions,
	children,
	className,
}: {
	kicker?: string;
	title: string;
	description?: string;
	width?: WorkspacePageWidth;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8",
				widthClass[width],
				className,
			)}
		>
			<header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex min-w-0 flex-col gap-2">
					{kicker ? <div className="section-kicker">{kicker}</div> : null}
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
						{title}
					</h1>
					{description ? (
						<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						{actions}
					</div>
				) : null}
			</header>
			{children}
		</div>
	);
}
