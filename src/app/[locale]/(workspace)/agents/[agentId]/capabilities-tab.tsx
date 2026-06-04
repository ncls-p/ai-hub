"use client";

import { Link } from "@/i18n/navigation";
import {
	BookOpenIcon,
	ChevronDownIcon,
	PlusIcon,
	SaveIcon,
	ServerIcon,
	WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ListRow } from "@/components/list-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { ConfigSection } from "./config-section";
import type {
	BuiltinTool,
	KnowledgeBase,
	McpServer,
	McpTool,
	ToolBindingState,
} from "./types";
import { getMcpServerState, isMcpToolApprovalForced } from "./utils";

function ToolRow({
	name,
	description,
	enabled,
	onEnabledChange,
}: {
	name: string;
	description?: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
}) {
	return (
		<ListRow className="items-center justify-between gap-4">
			<div className="min-w-0">
				<p className="font-medium">{name}</p>
				{description ? (
					<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			<Switch checked={enabled} onCheckedChange={onEnabledChange} />
		</ListRow>
	);
}

function McpServerCollapsible({
	server,
	mcpTools,
	mcpServers,
	mcpBindings,
	setMcpBindings,
	noMcpToolsSyncedLabel,
	disabledInMcpLabel,
}: {
	server: McpServer;
	mcpTools: McpTool[];
	mcpServers: McpServer[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	noMcpToolsSyncedLabel: string;
	disabledInMcpLabel: string;
}) {
	const serverState = getMcpServerState(
		server.id,
		mcpTools,
		mcpServers,
		mcpBindings,
	);
	const serverTools = mcpTools.filter((tool) => tool.mcpServerId === server.id);

	return (
		<Collapsible
			defaultOpen={false}
			className="rounded-xl border border-border/60 bg-background/45 p-3 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:bg-background/70"
		>
			<div className="flex items-start gap-2">
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label={server.name}
					>
						<ChevronDownIcon
							className="transition-transform data-[state=open]:rotate-180"
							aria-hidden="true"
						/>
					</Button>
				</CollapsibleTrigger>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{server.name}</p>
						<Badge variant="secondary">
							{serverState.selectedCount}/{serverState.bindableTools.length}
						</Badge>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{serverTools.length}{" "}
						{serverTools.length === 1 ? "tool" : "tools"} · {serverState.selectedCount}{" "}
						enabled
					</p>
				</div>
			</div>
			<CollapsibleContent className="flex flex-col gap-2 pt-3">
				{serverTools.length === 0 ? (
					<p className="text-xs text-muted-foreground">{noMcpToolsSyncedLabel}</p>
				) : (
					serverTools.map((tool) => {
						const binding = mcpBindings[tool.id];
						const toolEnabled = tool.enabled && Boolean(binding?.enabled);
						return (
							<ToolRow
								key={tool.id}
								name={tool.name}
								description={
									tool.enabled
										? tool.description ?? undefined
										: disabledInMcpLabel
								}
								enabled={toolEnabled}
								onEnabledChange={(enabled) =>
									setMcpBindings((current) => ({
										...current,
										[tool.id]: {
											enabled: enabled && tool.enabled,
											requireApproval:
												isMcpToolApprovalForced(tool, mcpServers) ||
												(current[tool.id]?.requireApproval ?? false),
										},
									}))
								}
							/>
						);
					})
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function CapabilitiesTab({
	builtinTools,
	builtinBindings,
	setBuiltinBindings,
	mcpServers,
	mcpTools,
	mcpBindings,
	setMcpBindings,
	knowledgeBases,
	selectedKnowledgeIds,
	setSelectedKnowledgeIds,
	saving,
	onSave,
}: {
	builtinTools: BuiltinTool[];
	builtinBindings: ToolBindingState;
	setBuiltinBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	mcpServers: McpServer[];
	mcpTools: McpTool[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	knowledgeBases: KnowledgeBase[];
	selectedKnowledgeIds: string[];
	setSelectedKnowledgeIds: (fn: (prev: string[]) => string[]) => void;
	saving: boolean;
	onSave: () => void;
}) {
	const t = useTranslations("agents.configurePage");
	const tCommon = useTranslations("common");

	return (
		<div className="space-y-4">
			<ConfigSection
				title={t("builtinTools")}
				description={t("builtinToolsHint")}
				icon={WrenchIcon}
				stagger="3"
			>
				{builtinTools.length === 0 ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						{t("noBuiltinTools")}
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{builtinTools.map((tool) => (
							<ToolRow
								key={tool.id}
								name={tool.name}
								description={tool.description}
								enabled={builtinBindings[tool.id]?.enabled ?? false}
								onEnabledChange={(enabled) =>
									setBuiltinBindings((current) => ({
										...current,
										[tool.id]: {
											enabled,
											requireApproval:
												current[tool.id]?.requireApproval ?? false,
										},
									}))
								}
							/>
						))}
					</div>
				)}
			</ConfigSection>

			<ConfigSection
				title={t("mcpTools")}
				description={t("mcpToolsHint")}
				icon={ServerIcon}
				stagger="4"
			>
				{mcpServers.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-6 text-center">
						<p className="text-sm text-muted-foreground">{t("noMcpServers")}</p>
						<Button variant="outline" size="sm" asChild>
							<Link href="/tools?tab=mcp">
								<ServerIcon className="size-4" aria-hidden="true" />
								{t("addMcp")}
							</Link>
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{mcpServers.map((server) => (
							<McpServerCollapsible
								key={server.id}
								server={server}
								mcpTools={mcpTools}
								mcpServers={mcpServers}
								mcpBindings={mcpBindings}
								setMcpBindings={setMcpBindings}
								noMcpToolsSyncedLabel={t("noMcpToolsSynced")}
								disabledInMcpLabel={t("disabledInMcp")}
							/>
						))}
						<Button variant="outline" size="sm" asChild className="w-fit">
							<Link href="/tools?tab=mcp">{t("manageMcp")}</Link>
						</Button>
					</div>
				)}
			</ConfigSection>

			<ConfigSection
				title={t("knowledge")}
				description={t("knowledgeHint")}
				icon={BookOpenIcon}
				stagger="5"
			>
				{knowledgeBases.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-8 text-center">
						<BookOpenIcon
							className="size-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="text-sm text-muted-foreground">{t("noKnowledge")}</p>
						<Button variant="outline" size="sm" asChild>
							<Link href="/knowledge">
								<PlusIcon className="size-4" aria-hidden="true" />
								{t("createKnowledge")}
							</Link>
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{knowledgeBases.map((kb) => (
							<label
								key={kb.id}
								className={cn(
									"ui-list-row flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-primary/25 hover:bg-card/65 hover:shadow-sm",
									selectedKnowledgeIds.includes(kb.id)
										? "border-primary/30 bg-primary/5"
										: "border-border/60",
								)}
							>
								<span className="flex items-center gap-3 font-medium">
									<span
										className={cn(
											"flex size-8 items-center justify-center rounded-lg",
											selectedKnowledgeIds.includes(kb.id)
												? "bg-primary/10 text-primary"
												: "bg-muted text-muted-foreground",
										)}
									>
										<BookOpenIcon className="size-4" aria-hidden="true" />
									</span>
									{kb.name}
								</span>
								<Switch
									checked={selectedKnowledgeIds.includes(kb.id)}
									onCheckedChange={(checked) =>
										setSelectedKnowledgeIds((current) =>
											checked
												? [...current, kb.id]
												: current.filter((id) => id !== kb.id),
										)
									}
								/>
							</label>
						))}
					</div>
				)}
			</ConfigSection>

			<CardFooter className="justify-end px-0 pb-0">
				<Button
					type="button"
					disabled={saving}
					onClick={onSave}
					className="shimmer"
				>
					{saving ? (
						<Spinner data-icon="inline-start" />
					) : (
						<SaveIcon data-icon="inline-start" aria-hidden="true" />
					)}
					{tCommon("save")}
				</Button>
			</CardFooter>
		</div>
	);
}
