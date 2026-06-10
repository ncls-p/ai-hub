"use client";

import { useMemo, useState } from "react";
import {
	BinaryIcon,
	BracesIcon,
	CalculatorIcon,
	CalendarIcon,
	ClockIcon,
	Code2Icon,
	DicesIcon,
	FileTextIcon,
	FingerprintIcon,
	GlobeIcon,
	HashIcon,
	LinkIcon,
	PaletteIcon,
	PenLineIcon,
	SearchIcon,
	ShieldCheckIcon,
	SparklesIcon,
	TableIcon,
	WrenchIcon,
	type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { PageEmptyState } from "@/components/page-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
	listBuiltInToolSummaries,
	type BuiltInToolSummary,
	type ToolRiskLevel,
} from "@/modules/tool/builtin-tools-catalog";

const builtinTools = listBuiltInToolSummaries();

const CATEGORY_ORDER = [
	"Think",
	"Time",
	"Web",
	"Create",
	"Code",
	"Write",
	"Design",
] as const;

type ToolCategory = (typeof CATEGORY_ORDER)[number];

const TOOL_ICONS: Record<string, LucideIcon> = {
	calculator: CalculatorIcon,
	current_time: ClockIcon,
	http_fetch: GlobeIcon,
	web_search: SearchIcon,
	render_html_artifact: Code2Icon,
	random_number: DicesIcon,
	uuid_generator: FingerprintIcon,
	date_math: CalendarIcon,
	json_tool: BracesIcon,
	text_stats: FileTextIcon,
	base64_tool: BinaryIcon,
	hash_text: HashIcon,
	unit_converter: CalculatorIcon,
	slugify_text: LinkIcon,
	color_converter: PaletteIcon,
	markdown_table: TableIcon,
};

const CATEGORY_STYLES: Record<
	ToolCategory,
	{ icon: LucideIcon; chip: string; tile: string }
> = {
	Think: {
		icon: SparklesIcon,
		chip: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
		tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
	},
	Time: {
		icon: ClockIcon,
		chip: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
		tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
	},
	Web: {
		icon: GlobeIcon,
		chip: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
		tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
	},
	Create: {
		icon: SparklesIcon,
		chip: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		tile: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
	},
	Code: {
		icon: BracesIcon,
		chip: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
		tile: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
	},
	Write: {
		icon: PenLineIcon,
		chip: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
		tile: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
	},
	Design: {
		icon: PaletteIcon,
		chip: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
		tile: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
	},
};

function isToolCategory(value: string): value is ToolCategory {
	return (CATEGORY_ORDER as readonly string[]).includes(value);
}

function requiresApproval(riskLevel: ToolRiskLevel) {
	return riskLevel === "high" || riskLevel === "critical";
}

function riskBadgeVariant(riskLevel: ToolRiskLevel) {
	if (riskLevel === "high" || riskLevel === "critical") return "destructive";
	if (riskLevel === "medium") return "secondary";
	return "outline";
}

function RiskBadge({
	riskLevel,
	label,
}: {
	riskLevel: ToolRiskLevel;
	label: string;
}) {
	return (
		<Badge
			variant={riskBadgeVariant(riskLevel)}
			className="shrink-0 rounded-full px-2 text-[10px] font-medium uppercase tracking-wide"
		>
			{label}
		</Badge>
	);
}

function BuiltinToolCard({
	tool,
	riskLabel,
	approvalLabel,
}: {
	tool: BuiltInToolSummary;
	riskLabel: string;
	approvalLabel: string;
}) {
	const categoryStyle = isToolCategory(tool.category)
		? CATEGORY_STYLES[tool.category]
		: CATEGORY_STYLES.Think;
	const ToolIcon = TOOL_ICONS[tool.name] ?? WrenchIcon;
	const needsApproval = requiresApproval(tool.riskLevel);

	return (
		<article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/85 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
			<div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
			<div className="flex gap-3">
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10",
						categoryStyle.tile,
					)}
				>
					<ToolIcon className="size-4.5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<h4 className="text-sm font-semibold leading-tight">
							{tool.displayName}
						</h4>
						<RiskBadge riskLevel={tool.riskLevel} label={riskLabel} />
					</div>
					<p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
						{tool.description}
					</p>
					{needsApproval ? (
						<p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
							<ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
							{approvalLabel}
						</p>
					) : null}
				</div>
			</div>
		</article>
	);
}

function StatCard({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone?: "default" | "low" | "medium" | "high";
}) {
	const toneClass =
		tone === "low"
			? "border-emerald-500/20 bg-emerald-500/[0.06]"
			: tone === "medium"
				? "border-amber-500/20 bg-amber-500/[0.06]"
				: tone === "high"
					? "border-destructive/25 bg-destructive/[0.06]"
					: "border-border/70 bg-muted/25";

	return (
		<div
			className={cn(
				"rounded-xl border px-3 py-2.5 transition-colors",
				toneClass,
			)}
		>
			<p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
				{label}
			</p>
			<p className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">
				{value}
			</p>
		</div>
	);
}

export function BuiltinToolsPanel() {
	const t = useTranslations("tools.builtin");
	const [search, setSearch] = useState("");
	const [categoryFilter, setCategoryFilter] = useState<string>("all");

	const riskLabels: Record<ToolRiskLevel, string> = {
		low: t("risk.low"),
		medium: t("risk.medium"),
		high: t("risk.high"),
		critical: t("risk.critical"),
	};

	const stats = useMemo(() => {
		const byRisk = { low: 0, medium: 0, high: 0, critical: 0 };
		for (const tool of builtinTools) {
			byRisk[tool.riskLevel] += 1;
		}
		return {
			total: builtinTools.length,
			low: byRisk.low,
			medium: byRisk.medium,
			high: byRisk.high + byRisk.critical,
		};
	}, []);

	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const tool of builtinTools) set.add(tool.category);
		return CATEGORY_ORDER.filter((category) => set.has(category));
	}, []);

	const filteredTools = useMemo(() => {
		const query = search.trim().toLowerCase();
		return builtinTools.filter((tool) => {
			if (categoryFilter !== "all" && tool.category !== categoryFilter) {
				return false;
			}
			if (!query) return true;
			return (
				tool.displayName.toLowerCase().includes(query) ||
				tool.name.toLowerCase().includes(query) ||
				tool.description.toLowerCase().includes(query) ||
				tool.category.toLowerCase().includes(query)
			);
		});
	}, [search, categoryFilter]);

	const groupedTools = useMemo(() => {
		if (categoryFilter !== "all") {
			return [{ category: categoryFilter, tools: filteredTools }];
		}
		const groups = new Map<string, BuiltInToolSummary[]>();
		for (const tool of filteredTools) {
			const list = groups.get(tool.category) ?? [];
			list.push(tool);
			groups.set(tool.category, list);
		}
		return CATEGORY_ORDER.filter((category) => groups.has(category)).map(
			(category) => ({
				category,
				tools: groups.get(category) ?? [],
			}),
		);
	}, [filteredTools, categoryFilter]);

	function categoryLabel(category: string) {
		return isToolCategory(category) ? t(`categories.${category}`) : category;
	}

	return (
		<div className="space-y-5 animate-in-up">
			<section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/[0.04] p-5 shadow-sm sm:p-6">
				<div
					className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-primary/10 blur-3xl"
					aria-hidden="true"
				/>
				<div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-2xl space-y-2">
						<div className="flex items-center gap-2 text-primary">
							<div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
								<WrenchIcon className="size-4" aria-hidden="true" />
							</div>
							<p className="text-xs font-semibold uppercase tracking-[0.16em]">
								{t("eyebrow")}
							</p>
						</div>
						<h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
							{t("title")}
						</h2>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t("description")}
						</p>
					</div>
					<Button variant="outline" size="sm" className="w-fit shrink-0" asChild>
						<Link href="/agents">{t("enableCta")}</Link>
					</Button>
				</div>
				<div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatCard label={t("stats.total")} value={stats.total} />
					<StatCard label={t("stats.low")} value={stats.low} tone="low" />
					<StatCard label={t("stats.medium")} value={stats.medium} tone="medium" />
					<StatCard label={t("stats.high")} value={stats.high} tone="high" />
				</div>
			</section>

			<section className="space-y-3 rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm sm:p-5">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
					<div className="relative min-w-0 flex-1">
						<SearchIcon
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("searchPlaceholder")}
							className="h-10 rounded-xl border-border/70 bg-background/80 pl-9"
							aria-label={t("searchPlaceholder")}
						/>
					</div>
					<p className="shrink-0 text-xs text-muted-foreground lg:text-right">
						{t("resultsCount", { count: filteredTools.length })}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						variant={categoryFilter === "all" ? "default" : "outline"}
						className="h-8 rounded-full px-3 text-xs"
						onClick={() => setCategoryFilter("all")}
					>
						{t("allCategories")}
					</Button>
					{categories.map((category) => {
						const style = CATEGORY_STYLES[category];
						const CategoryIcon = style.icon;
						const active = categoryFilter === category;
						return (
							<Button
								key={category}
								type="button"
								size="sm"
								variant="outline"
								className={cn(
									"h-8 gap-1.5 rounded-full border px-3 text-xs",
									active
										? style.chip
										: "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
								)}
								onClick={() => setCategoryFilter(category)}
							>
								<CategoryIcon className="size-3.5" aria-hidden="true" />
								{categoryLabel(category)}
							</Button>
						);
					})}
				</div>
			</section>

			{filteredTools.length === 0 ? (
				<PageEmptyState
					icon={SearchIcon}
					title={t("noResults")}
					description={t("noResultsHint")}
				/>
			) : (
				<div className="space-y-6">
					{groupedTools.map((group) => {
						const style = isToolCategory(group.category)
							? CATEGORY_STYLES[group.category]
							: CATEGORY_STYLES.Think;
						const CategoryIcon = style.icon;
						const showHeader = categoryFilter === "all";

						return (
							<section key={group.category} className="space-y-3">
								{showHeader ? (
									<div className="flex items-center gap-2.5 px-1">
										<div
											className={cn(
												"flex size-7 items-center justify-center rounded-lg",
												style.tile,
											)}
										>
											<CategoryIcon className="size-3.5" aria-hidden="true" />
										</div>
										<h3 className="text-sm font-semibold">
											{categoryLabel(group.category)}
										</h3>
										<span className="text-xs text-muted-foreground">
											{group.tools.length}
										</span>
									</div>
								) : null}
								<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{group.tools.map((tool) => (
										<li key={tool.id}>
											<BuiltinToolCard
												tool={tool}
												riskLabel={riskLabels[tool.riskLevel]}
												approvalLabel={t("requiresApproval")}
											/>
										</li>
									))}
								</ul>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
