"use client";

import { useMemo, useState } from "react";
import {
	BinaryIcon,
	BracesIcon,
	BriefcaseIcon,
	CalculatorIcon,
	CalendarIcon,
	ClockIcon,
	Code2Icon,
	DicesIcon,
	FileTextIcon,
	FingerprintIcon,
	GithubIcon,
	GlobeIcon,
	HashIcon,
	LinkIcon,
	ListChecksIcon,
	MailIcon,
	PaletteIcon,
	PenLineIcon,
	PresentationIcon,
	SearchIcon,
	ShieldCheckIcon,
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
	"Work",
	"Data",
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
	code_workspace_create_project: Code2Icon,
	code_workspace_list_files: Code2Icon,
	code_workspace_read_file: Code2Icon,
	code_workspace_write_file: Code2Icon,
	code_workspace_replace_text: Code2Icon,
	code_workspace_delete_file: Code2Icon,
	github_get_publish_status: GithubIcon,
	github_publish_code_workspace: GithubIcon,
	create_slide_deck: PresentationIcon,
	create_business_document: FileTextIcon,
	create_spreadsheet: TableIcon,
	create_meeting_brief: CalendarIcon,
	create_action_plan: ListChecksIcon,
	create_decision_matrix: TableIcon,
	create_email_pack: MailIcon,
	create_project_status_report: ListChecksIcon,
	create_risk_register: ShieldCheckIcon,
	create_raci_matrix: TableIcon,
	create_customer_account_plan: BriefcaseIcon,
	create_competitive_battlecard: BriefcaseIcon,
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

const CATEGORY_STYLES: Record<ToolCategory, { icon: LucideIcon }> = {
	Think: { icon: WrenchIcon },
	Time: { icon: ClockIcon },
	Web: { icon: GlobeIcon },
	Create: { icon: Code2Icon },
	Work: { icon: BriefcaseIcon },
	Data: { icon: TableIcon },
	Code: { icon: BracesIcon },
	Write: { icon: PenLineIcon },
	Design: { icon: PaletteIcon },
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
			className="shrink-0 rounded-full px-2 text-[10px] font-medium"
		>
			{label}
		</Badge>
	);
}

function BuiltinToolCard({
	tool,
	riskLabel,
	approvalLabel,
	categoryLabel,
}: {
	tool: BuiltInToolSummary;
	riskLabel: string;
	approvalLabel: string;
	categoryLabel: string;
}) {
	const ToolIcon = TOOL_ICONS[tool.name] ?? WrenchIcon;
	const needsApproval = requiresApproval(tool.riskLevel);

	return (
		<article className="group min-h-full rounded-2xl border bg-card p-4 transition-colors duration-150 hover:border-input hover:bg-muted/30">
			<div className="flex items-start gap-3.5">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground">
					<ToolIcon className="size-4" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="mb-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								{categoryLabel}
							</p>
							<h4 className="truncate text-sm font-semibold leading-tight tracking-[-0.015em] text-foreground">
								{tool.displayName}
							</h4>
						</div>
						<RiskBadge riskLevel={tool.riskLevel} label={riskLabel} />
					</div>
					<p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
						{tool.description}
					</p>
					<div className="mt-3 flex items-center justify-between gap-3">
						<code className="truncate text-[0.68rem] text-muted-foreground">
							{tool.name}
						</code>
						{needsApproval ? (
							<span className="flex shrink-0 items-center gap-1.5 text-[0.68rem] font-medium text-muted-foreground">
								<ShieldCheckIcon className="size-3.5" aria-hidden="true" />
								{approvalLabel}
							</span>
						) : null}
					</div>
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
		tone === "high"
			? "text-destructive"
			: tone === "medium"
				? "text-amber-700 dark:text-amber-300"
				: tone === "low"
					? "text-emerald-700 dark:text-emerald-300"
					: "text-foreground";

	return (
		<div className="rounded-2xl border bg-card px-3.5 py-3">
			<p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
				{label}
			</p>
			<p
				className={cn(
					"mt-1 text-2xl font-semibold tabular-nums leading-none tracking-[-0.04em]",
					toneClass,
				)}
			>
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
		<div className="flex flex-col gap-5 animate-in-fade">
			<section className="rounded-2xl border bg-card p-5 sm:p-6">
				<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
					<div className="flex max-w-2xl flex-col gap-3">
						<div className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground">
							<WrenchIcon className="size-3.5" aria-hidden="true" />
							<p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em]">
								{t("eyebrow")}
							</p>
						</div>
						<h2 className="max-w-xl text-2xl font-semibold tracking-[-0.045em] text-foreground sm:text-3xl">
							{t("title")}
						</h2>
						<p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
							{t("description")}
						</p>
						<Button variant="outline" size="sm" className="mt-1 w-fit" asChild>
							<Link href="/agents">{t("enableCta")}</Link>
						</Button>
					</div>
					<div className="grid grid-cols-2 gap-2.5">
						<StatCard label={t("stats.total")} value={stats.total} />
						<StatCard label={t("stats.low")} value={stats.low} tone="low" />
						<StatCard
							label={t("stats.medium")}
							value={stats.medium}
							tone="medium"
						/>
						<StatCard label={t("stats.high")} value={stats.high} tone="high" />
					</div>
				</div>
			</section>

			<section className="rounded-2xl border bg-card p-3.5 sm:p-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
					<div className="relative min-w-0 flex-1">
						<SearchIcon
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
							aria-hidden="true"
						/>
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("searchPlaceholder")}
							className="h-10 pl-9"
							aria-label={t("searchPlaceholder")}
						/>
					</div>
					<p className="shrink-0 px-1 text-xs text-muted-foreground lg:text-right">
						{t("resultsCount", { count: filteredTools.length })}
					</p>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
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
						const CategoryIcon = CATEGORY_STYLES[category].icon;
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
										? "border-input bg-muted text-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
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
				<div className="flex flex-col gap-7">
					{groupedTools.map((group) => {
						const CategoryIcon = isToolCategory(group.category)
							? CATEGORY_STYLES[group.category].icon
							: CATEGORY_STYLES.Think.icon;
						const showHeader = categoryFilter === "all";
						const label = categoryLabel(group.category);

						return (
							<section key={group.category} className="flex flex-col gap-3">
								{showHeader ? (
									<div className="flex items-center gap-2.5 px-1">
										<div className="flex size-7 items-center justify-center rounded-xl border bg-background text-muted-foreground">
											<CategoryIcon className="size-3.5" aria-hidden="true" />
										</div>
										<h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
											{label}
										</h3>
										<span className="rounded-full bg-muted/42 px-2 py-0.5 text-[0.68rem] text-muted-foreground">
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
												categoryLabel={label}
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
