"use client";

import type { ElementType } from "react";
import {
	BanIcon,
	CalendarRangeIcon,
	CheckCircle2Icon,
	ClipboardListIcon,
	DownloadIcon,
	FilterIcon,
	RotateCcwIcon,
	ShieldAlertIcon,
	UserIcon,
	XCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface AuditEvent {
	id: string;
	action: string;
	resourceType: string | null;
	outcome: string;
	actorPrincipalId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	createdAt: string;
}

type AuditOutcome = "success" | "failed" | "denied" | string;

function outcomeMeta(outcome: AuditOutcome) {
	switch (outcome) {
		case "success":
			return {
				label: outcome,
				dot: "bg-success",
				ring: "ring-success/20",
				badge: "default" as const,
				icon: CheckCircle2Icon,
			};
		case "failed":
			return {
				label: outcome,
				dot: "bg-destructive",
				ring: "ring-destructive/20",
				badge: "destructive" as const,
				icon: XCircleIcon,
			};
		case "denied":
			return {
				label: outcome,
				dot: "bg-warning",
				ring: "ring-warning/20",
				badge: "outline" as const,
				icon: BanIcon,
			};
		default:
			return {
				label: outcome,
				dot: "bg-muted-foreground",
				ring: "ring-border",
				badge: "secondary" as const,
				icon: ShieldAlertIcon,
			};
	}
}

function formatAction(action: string) {
	const [scope, verb] = action.split(".");
	if (!verb) return action;
	return { scope, verb };
}

function StatCard({
	label,
	value,
	icon: Icon,
	color,
	accent,
}: {
	label: string;
	value: string | number;
	icon: ElementType;
	color: string;
	accent: string;
}) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
			<div
				className={cn(
					"absolute left-0 top-0 h-full w-1 opacity-60 transition-opacity duration-300 group-hover:opacity-100",
					accent,
				)}
			/>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</span>
					<span className="text-2xl font-bold tracking-tight text-foreground">
						{value}
					</span>
				</div>
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
						color,
					)}
				>
					<Icon className="size-5" aria-hidden="true" />
				</div>
			</div>
		</div>
	);
}

function AuditFilters({
	actionFilter,
	outcomeFilter,
	fromDate,
	toDate,
	busy,
	canExport,
	onActionChange,
	onOutcomeChange,
	onFromChange,
	onToChange,
	onApply,
	onReset,
	onExport,
	t,
}: {
	actionFilter: string;
	outcomeFilter: string;
	fromDate: string;
	toDate: string;
	busy: boolean;
	canExport: boolean;
	onActionChange: (value: string) => void;
	onOutcomeChange: (value: string) => void;
	onFromChange: (value: string) => void;
	onToChange: (value: string) => void;
	onApply: () => void;
	onReset: () => void;
	onExport: () => void;
	t: ReturnType<typeof useTranslations<"admin.audit">>;
}) {
	const hasFilters = Boolean(
		actionFilter.trim() || outcomeFilter !== "all" || fromDate || toDate,
	);

	return (
		<section className="rounded-2xl border bg-card p-4 sm:p-5 animate-in-fade stagger-2">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2 text-sm font-medium text-foreground">
					<FilterIcon
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					{t("filters")}
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={!canExport || busy}
					onClick={onExport}
				>
					<DownloadIcon className="size-4" aria-hidden="true" />
					{t("exportCsv")}
				</Button>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_10rem_10rem_10rem_auto] lg:items-end">
				<div className="grid gap-2">
					<Label htmlFor="audit-action-filter">{t("actionFilter")}</Label>
					<Input
						id="audit-action-filter"
						autoComplete="off"
						placeholder={t("actionPlaceholder")}
						value={actionFilter}
						onChange={(e) => onActionChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") onApply();
						}}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="audit-outcome">{t("outcome")}</Label>
					<Select value={outcomeFilter} onValueChange={onOutcomeChange}>
						<SelectTrigger id="audit-outcome">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">{t("outcomeAll")}</SelectItem>
							<SelectItem value="success">{t("outcomeSuccess")}</SelectItem>
							<SelectItem value="failed">{t("outcomeFailed")}</SelectItem>
							<SelectItem value="denied">{t("outcomeDenied")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="audit-from">{t("from")}</Label>
					<div className="relative">
						<CalendarRangeIcon
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							id="audit-from"
							type="date"
							className="pl-9"
							value={fromDate}
							onChange={(e) => onFromChange(e.target.value)}
						/>
					</div>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="audit-to">{t("to")}</Label>
					<div className="relative">
						<CalendarRangeIcon
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							id="audit-to"
							type="date"
							className="pl-9"
							value={toDate}
							onChange={(e) => onToChange(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 lg:justify-end">
					<Button
						variant="outline"
						disabled={!hasFilters || busy}
						onClick={onReset}
					>
						<RotateCcwIcon className="size-4" aria-hidden="true" />
						{t("resetFilter")}
					</Button>
					<Button disabled={busy} onClick={onApply}>
						{t("applyFilter")}
					</Button>
				</div>
			</div>
		</section>
	);
}

function AuditEventRow({
	event,
	isLast,
	t,
}: {
	event: AuditEvent;
	isLast: boolean;
	t: ReturnType<typeof useTranslations<"admin.audit">>;
}) {
	const meta = outcomeMeta(event.outcome);
	const OutcomeIcon = meta.icon;
	const parsed = formatAction(event.action);
	const actorLabel = event.actorName ?? event.actorEmail ?? t("systemActor");
	const createdAt = new Date(event.createdAt);

	return (
		<div className="relative flex gap-4">
			<div className="flex flex-col items-center">
				<div
					className={cn(
						"mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-background",
						meta.dot,
						meta.ring,
					)}
				/>
				{!isLast ? (
					<div className="my-1 w-px flex-1 bg-border/70" aria-hidden="true" />
				) : null}
			</div>

			<article
				className={cn(
					"min-w-0 flex-1 rounded-xl border border-border/60 bg-background/80 px-4 py-3 transition-colors hover:border-primary/25 hover:bg-muted/20",
					!isLast && "mb-3",
				)}
			>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant={meta.badge}
								className={cn(
									"rounded-md capitalize",
									event.outcome === "denied" &&
										"border-warning/30 bg-warning/10 text-warning",
								)}
							>
								<OutcomeIcon aria-hidden="true" />
								{meta.label}
							</Badge>
							{event.resourceType ? (
								<Badge
									variant="outline"
									className="rounded-md font-mono text-[11px]"
								>
									{event.resourceType}
								</Badge>
							) : null}
						</div>

						<div className="space-y-1">
							{typeof parsed === "object" ? (
								<p className="font-medium leading-snug">
									<span className="text-muted-foreground">{parsed.scope}</span>
									<span className="text-muted-foreground">.</span>
									<span>{parsed.verb}</span>
								</p>
							) : (
								<p className="font-medium leading-snug">{parsed}</p>
							)}
							<p className="font-mono text-xs text-muted-foreground">
								{event.action}
							</p>
						</div>

						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<UserIcon className="size-3.5 shrink-0" aria-hidden="true" />
							<span
								className="truncate"
								title={event.actorPrincipalId ?? undefined}
							>
								{actorLabel}
							</span>
						</div>
					</div>

					<time
						className="shrink-0 text-xs text-muted-foreground sm:text-right"
						dateTime={event.createdAt}
						title={createdAt.toLocaleString()}
					>
						{createdAt.toLocaleString()}
					</time>
				</div>
			</article>
		</div>
	);
}

function computeStats(events: AuditEvent[]) {
	return events.reduce(
		(acc, event) => {
			acc.total += 1;
			if (event.outcome === "success") acc.success += 1;
			if (event.outcome === "failed") acc.failed += 1;
			if (event.outcome === "denied") acc.denied += 1;
			return acc;
		},
		{ total: 0, success: 0, failed: 0, denied: 0 },
	);
}

export function AuditDashboardSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<Skeleton key={index} className="h-24 rounded-2xl" />
				))}
			</div>
			<Skeleton className="h-32 w-full rounded-2xl" />
			<Skeleton className="h-96 w-full rounded-2xl" />
		</div>
	);
}

export function AuditDashboard({
	events,
	busy,
	actionFilter,
	outcomeFilter,
	fromDate,
	toDate,
	onActionChange,
	onOutcomeChange,
	onFromChange,
	onToChange,
	onApply,
	onReset,
	onExport,
}: {
	events: AuditEvent[];
	busy: boolean;
	actionFilter: string;
	outcomeFilter: string;
	fromDate: string;
	toDate: string;
	onActionChange: (value: string) => void;
	onOutcomeChange: (value: string) => void;
	onFromChange: (value: string) => void;
	onToChange: (value: string) => void;
	onApply: () => void;
	onReset: () => void;
	onExport: () => void;
}) {
	const t = useTranslations("admin.audit");
	const stats = computeStats(events);

	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-in-up stagger-1">
				<StatCard
					label={t("totalEvents")}
					value={stats.total}
					icon={ClipboardListIcon}
					color="bg-primary/10 text-primary"
					accent="bg-primary"
				/>
				<StatCard
					label={t("outcomeSuccess")}
					value={stats.success}
					icon={CheckCircle2Icon}
					color="bg-success/10 text-success"
					accent="bg-success"
				/>
				<StatCard
					label={t("outcomeFailed")}
					value={stats.failed}
					icon={XCircleIcon}
					color="bg-destructive/10 text-destructive"
					accent="bg-destructive"
				/>
				<StatCard
					label={t("outcomeDenied")}
					value={stats.denied}
					icon={BanIcon}
					color="bg-warning/10 text-warning"
					accent="bg-warning"
				/>
			</div>

			<AuditFilters
				actionFilter={actionFilter}
				outcomeFilter={outcomeFilter}
				fromDate={fromDate}
				toDate={toDate}
				busy={busy}
				canExport={events.length > 0}
				onActionChange={onActionChange}
				onOutcomeChange={onOutcomeChange}
				onFromChange={onFromChange}
				onToChange={onToChange}
				onApply={onApply}
				onReset={onReset}
				onExport={onExport}
				t={t}
			/>

			<section className="rounded-2xl border bg-card p-5 animate-in-fade stagger-3">
				<div className="mb-5 flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<ClipboardListIcon
							className="size-4 text-primary"
							aria-hidden="true"
						/>
						<h2 className="text-base font-semibold">{t("recentEvents")}</h2>
					</div>
					<p className="text-sm text-muted-foreground">
						{t("recentEventsDescription")}
					</p>
				</div>

				{events.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center">
						<ClipboardListIcon
							className="size-8 text-muted-foreground/60"
							aria-hidden="true"
						/>
						<p className="text-sm font-medium text-foreground">
							{t("emptyTitle")}
						</p>
						<p className="max-w-sm text-sm text-muted-foreground">
							{t("emptyDescription")}
						</p>
					</div>
				) : (
					<div className="max-h-[40rem] overflow-y-auto pr-1">
						{events.map((event, index) => (
							<AuditEventRow
								key={event.id}
								event={event}
								isLast={index === events.length - 1}
								t={t}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
