import type { ElementType, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SettingsSection({
	icon: Icon,
	title,
	description,
	badge,
	children,
	className,
	stagger,
}: {
	icon: ElementType;
	title: string;
	description: string;
	badge?: ReactNode;
	children: ReactNode;
	className?: string;
	stagger?: string;
}) {
	return (
		<section
			className={cn(
				"overflow-hidden rounded-2xl border bg-card p-0 animate-in-fade",
				stagger,
				className,
			)}
		>
			<div className="border-b px-5 py-5 sm:px-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Icon className="size-4 shrink-0" aria-hidden="true" />
							<h2 className="text-sm font-semibold uppercase tracking-wider">
								{title}
							</h2>
						</div>
						<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
							{description}
						</p>
					</div>
					{badge ? <div className="shrink-0">{badge}</div> : null}
				</div>
			</div>
			<div className="p-5 sm:p-6">{children}</div>
		</section>
	);
}

export function SettingsStatusBadge({
	label,
	tone = "muted",
}: {
	label: string;
	tone?: "success" | "warning" | "destructive" | "muted" | "primary";
}) {
	const className = {
		success: "border-success/30 bg-success/10 text-success",
		warning: "border-warning/30 bg-warning/10 text-warning",
		destructive: "border-destructive/30 bg-destructive/10 text-destructive",
		primary: "border-primary/30 bg-primary/10 text-primary",
		muted: "",
	}[tone];

	return (
		<Badge
			variant="outline"
			className={cn("rounded-full px-3 py-1 capitalize", className)}
		>
			{label}
		</Badge>
	);
}

export function SettingsToggleRow({
	id,
	label,
	description,
	checked,
	onCheckedChange,
}: {
	id: string;
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
			<div className="min-w-0">
				<Label htmlFor={id}>{label}</Label>
				<p className="mt-1 text-xs text-muted-foreground">{description}</p>
			</div>
			<Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

export function SettingsFeatureToggle({
	label,
	description,
	checked,
	onCheckedChange,
	icon: Icon,
}: {
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	icon?: ElementType;
}) {
	return (
		<label className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-input">
			<span className="min-w-0">
				<span className="flex items-center gap-2 text-sm font-medium">
					{Icon ? (
						<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
					) : null}
					{label}
				</span>
				<span className="mt-1 block text-xs text-muted-foreground">
					{description}
				</span>
			</span>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</label>
	);
}

export function SettingsDisabledNotice({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm">
			<p className="font-medium text-foreground">{title}</p>
			<p className="mt-1 text-muted-foreground">{description}</p>
		</div>
	);
}

export function SettingsMetricRow({
	label,
	value,
	icon: Icon,
	tone = "muted",
}: {
	label: string;
	value: ReactNode;
	icon?: ElementType;
	tone?: "success" | "warning" | "destructive" | "muted";
}) {
	const valueClass = {
		success: "text-success",
		warning: "text-warning",
		destructive: "text-destructive",
		muted: "text-foreground",
	}[tone];

	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
			<span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
				{Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
				{label}
			</span>
			<span
				className={cn("shrink-0 text-sm font-semibold capitalize", valueClass)}
			>
				{value}
			</span>
		</div>
	);
}

export function SettingsSectionSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card p-0">
			<Skeleton className="h-28 w-full rounded-none" />
			<div className="flex flex-col gap-3 p-5 sm:p-6">
				{Array.from({ length: rows }).map((_, index) => (
					<Skeleton key={index} className="h-14 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}
