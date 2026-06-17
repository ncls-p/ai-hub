import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { KIND_ICONS, kindAccent } from "./constants";
import type { ProviderKind } from "./types";
import { formatNumber, timeAgo } from "./utils";

function CapabilityBadge({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
			{label}
		</span>
	);
}

export function ModelCapabilities({
	capabilities,
	contextWindow,
	maxOutputTokens,
	inputTokenCost,
	outputTokenCost,
	hostedBy,
	enabled,
}: {
	capabilities?: Record<string, boolean> | null;
	contextWindow?: number | null;
	maxOutputTokens?: number | null;
	inputTokenCost?: string | null;
	outputTokenCost?: string | null;
	hostedBy?: string | null;
	enabled?: boolean;
}) {
	const t = useTranslations("providers.manager");
	const caps = capabilities ?? {};
	const contextLabel = formatNumber(contextWindow);
	const maxOutLabel = formatNumber(maxOutputTokens);

	const hasAny =
		enabled === false ||
		hostedBy ||
		contextLabel ||
		maxOutLabel ||
		inputTokenCost ||
		outputTokenCost ||
		Object.values(caps).some(Boolean);

	if (!hasAny) return null;

	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5">
			{enabled === false ? (
				<Badge variant="secondary" className="text-xs">
					{t("disabled")}
				</Badge>
			) : null}
			{hostedBy ? (
				<Badge variant="secondary" className="text-xs">
					{hostedBy}
				</Badge>
			) : null}
			{contextLabel ? (
				<span className="text-xs text-muted-foreground">
					{t("contextWindow", { value: contextLabel })}
				</span>
			) : null}
			{maxOutLabel ? (
				<span className="text-xs text-muted-foreground">
					{t("maxOutput", { value: maxOutLabel })}
				</span>
			) : null}
			{inputTokenCost ? (
				<span className="text-xs text-muted-foreground">
					↗ {inputTokenCost}
				</span>
			) : null}
			{outputTokenCost ? (
				<span className="text-xs text-muted-foreground">
					↘ {outputTokenCost}
				</span>
			) : null}
			{caps.text ? <CapabilityBadge label="text" /> : null}
			{caps.vision ? <CapabilityBadge label="vision" /> : null}
			{caps.tools ? <CapabilityBadge label="tools" /> : null}
			{caps.reasoning ? <CapabilityBadge label="reasoning" /> : null}
			{caps.embeddings ? <CapabilityBadge label="embeddings" /> : null}
			{caps.audio ? <CapabilityBadge label="audio" /> : null}
		</div>
	);
}

export function HealthIndicator({
	status,
	lastChecked,
}: {
	status: string | null;
	lastChecked: string | null;
}) {
	const t = useTranslations("providers.manager");
	const dotColor =
		status === "healthy"
			? "bg-success"
			: status === "unhealthy"
				? "bg-destructive"
				: "bg-muted-foreground/40";
	const label =
		status === "healthy"
			? t("healthOnline")
			: status === "unhealthy"
				? t("healthFailed")
				: t("healthUnknown");

	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<span
				className={cn("size-2 shrink-0 rounded-full", dotColor)}
				aria-hidden="true"
			/>
			{label}
			{lastChecked ? (
				<span className="hidden text-muted-foreground/70 sm:inline">
					· {timeAgo(lastChecked)}
				</span>
			) : null}
		</span>
	);
}

export function ProviderTypeIcon({
	kind,
	className,
}: {
	kind: ProviderKind;
	className?: string;
}) {
	const Icon = KIND_ICONS[kind];
	const colors = kindAccent(kind);
	return (
		<div
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-lg",
				colors.iconBg,
				colors.text,
				className,
			)}
		>
			<Icon className="size-4" aria-hidden="true" />
		</div>
	);
}

export function ProviderCardSkeleton() {
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<Skeleton className="size-8 rounded-lg" />
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-3 w-64" />
			</div>
		</div>
	);
}
