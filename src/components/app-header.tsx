import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type AppHeaderBreadcrumb = {
	label: string;
	href?: string;
};

export function AppHeader({
	title,
	subtitle = "Workspace",
	breadcrumbs,
	leading,
	center,
	actions,
	className,
}: {
	title?: string;
	subtitle?: string;
	breadcrumbs?: AppHeaderBreadcrumb[];
	leading?: ReactNode;
	center?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn("app-shell__header gap-2", className)}
			data-slot="app-header"
		>
			<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
				{leading}
				{title || (breadcrumbs && breadcrumbs.length > 0) ? (
					<div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
						{breadcrumbs && breadcrumbs.length > 0 ? (
							<nav
								aria-label="Breadcrumb"
								className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
							>
								{breadcrumbs.map((crumb, index) => (
									<span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
										{index > 0 ? (
											<ChevronRightIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
										) : null}
										{crumb.href ? (
											<Link
												href={crumb.href}
												className="truncate transition-colors hover:text-foreground"
											>
												{crumb.label}
											</Link>
										) : (
											<span className="truncate">{crumb.label}</span>
										)}
									</span>
								))}
							</nav>
						) : null}
						{title ? (
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{title}</p>
								{subtitle ? (
									<p className="truncate text-xs text-muted-foreground">{subtitle}</p>
								) : null}
							</div>
						) : null}
					</div>
				) : null}
				{center ? (
					<div className="flex min-w-0 flex-1 items-center gap-2">{center}</div>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{actions}</div>
			) : null}
		</header>
	);
}
