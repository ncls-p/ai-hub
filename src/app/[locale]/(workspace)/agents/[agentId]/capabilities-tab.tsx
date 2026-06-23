"use client";

import { Link } from "@/i18n/navigation";
import {
	BookMarkedIcon,
	BookOpenIcon,
	ChevronDownIcon,
	PlusIcon,
	SaveIcon,
	ServerIcon,
	ShieldCheckIcon,
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
	CustomTool,
	KnowledgeBase,
	AgentSkill,
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
	requireApproval,
	approvalDisabled,
	onApprovalChange,
	approvalLabel,
}: {
	name: string;
	description?: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	requireApproval?: boolean;
	approvalDisabled?: boolean;
	onApprovalChange?: (checked: boolean) => void;
	approvalLabel?: string;
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
			<div className="flex items-center gap-4">
				{onApprovalChange !== undefined && (
					<label className="flex items-center gap-2 text-xs">
						<ShieldCheckIcon
							className="size-3 text-muted-foreground"
							aria-hidden="true"
						/>
						{approvalLabel}
						<Switch
							checked={requireApproval ?? false}
							disabled={approvalDisabled ?? false}
							onCheckedChange={onApprovalChange}
						/>
					</label>
				)}
				<Switch checked={enabled} onCheckedChange={onEnabledChange} />
			</div>
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
	allToolsLabel,
	extraApprovalLabel,
	approvalLabel,
	partialLabel,
	mixedApprovalLabel,
	forcedLabel,
}: {
	server: McpServer;
	mcpTools: McpTool[];
	mcpServers: McpServer[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	noMcpToolsSyncedLabel: string;
	disabledInMcpLabel: string;
	allToolsLabel: string;
	extraApprovalLabel: string;
	approvalLabel: string;
	partialLabel: string;
	mixedApprovalLabel: string;
	forcedLabel: string;
}) {
	const serverState = getMcpServerState(
		server.id,
		mcpTools,
		mcpServers,
		mcpBindings,
	);
	const serverTools = mcpTools.filter((tool) => tool.mcpServerId === server.id);

	function setServerToolsEnabled(enabled: boolean) {
		const serverTools = mcpTools.filter((t) => t.mcpServerId === server.id);
		setMcpBindings((current) => {
			const next = { ...current };
			for (const tool of serverTools) {
				const cb = current[tool.id];
				next[tool.id] = {
					enabled: enabled && tool.enabled,
					requireApproval:
						isMcpToolApprovalForced(tool, mcpServers) ||
						(cb?.requireApproval ?? false),
				};
			}
			return next;
		});
	}

	function setServerApproval(requireApproval: boolean) {
		const bindableTools = mcpTools
			.filter((t) => t.mcpServerId === server.id && t.enabled)
			.filter((t) => mcpBindings[t.id]?.enabled);
		setMcpBindings((current) => {
			const next = { ...current };
			for (const tool of bindableTools) {
				next[tool.id] = {
					enabled: true,
					requireApproval:
						isMcpToolApprovalForced(tool, mcpServers) || requireApproval,
				};
			}
			return next;
		});
	}

	function setToolEnabled(tool: McpTool, enabled: boolean) {
		setMcpBindings((current) => ({
			...current,
			[tool.id]: {
				enabled: enabled && tool.enabled,
				requireApproval:
					isMcpToolApprovalForced(tool, mcpServers) ||
					(current[tool.id]?.requireApproval ?? false),
			},
		}));
	}

	function setToolApproval(tool: McpTool, requireApproval: boolean) {
		setMcpBindings((current) => ({
			...current,
			[tool.id]: {
				enabled: current[tool.id]?.enabled ?? false,
				requireApproval: tool.enabled
					? isMcpToolApprovalForced(tool, mcpServers) || requireApproval
					: false,
			},
		}));
	}

	return (
		<Collapsible
			defaultOpen={false}
			className="rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/35 hover:bg-muted/40"
		>
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
				<div className="flex min-w-0 gap-2">
					<CollapsibleTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="shrink-0"
						>
							<ChevronDownIcon
								className="transition-transform data-[state=open]:rotate-180"
								aria-hidden="true"
							/>
						</Button>
					</CollapsibleTrigger>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<p className="font-medium">{server.name}</p>
							<Badge variant="secondary">
								{serverState.selectedCount}/{serverState.bindableTools.length}
							</Badge>
							{serverState.someSelected && (
								<Badge variant="outline">{partialLabel}</Badge>
							)}
							{serverState.someApproval && (
								<Badge variant="outline">{mixedApprovalLabel}</Badge>
							)}
							{serverState.forcedApprovalCount > 0 && (
								<Badge variant="secondary">
									{serverState.forcedApprovalCount} {forcedLabel}
								</Badge>
							)}
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{serverTools.length} {serverTools.length === 1 ? "tool" : "tools"}{" "}
							· {serverState.selectedCount} enabled
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-4 text-xs">
					<label className="flex items-center gap-2">
						{allToolsLabel}
						<Switch
							checked={serverState.allSelected}
							disabled={serverState.bindableTools.length === 0}
							onCheckedChange={setServerToolsEnabled}
						/>
					</label>
					<label className="flex items-center gap-2">
						{extraApprovalLabel}
						<Switch
							checked={serverState.allApproval}
							disabled={
								serverState.selectedCount === 0 ||
								serverState.selectedCount === serverState.forcedApprovalCount
							}
							onCheckedChange={setServerApproval}
						/>
					</label>
				</div>
			</div>
			<CollapsibleContent className="flex flex-col gap-2 pt-3">
				{serverTools.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						{noMcpToolsSyncedLabel}
					</p>
				) : (
					serverTools.map((tool) => {
						const binding = mcpBindings[tool.id];
						const toolEnabled = tool.enabled && Boolean(binding?.enabled);
						const approvalForced = isMcpToolApprovalForced(tool, mcpServers);
						return (
							<ToolRow
								key={tool.id}
								name={tool.name}
								description={
									tool.enabled
										? (tool.description ?? undefined)
										: disabledInMcpLabel
								}
								enabled={toolEnabled}
								onEnabledChange={(enabled) => setToolEnabled(tool, enabled)}
								requireApproval={
									toolEnabled &&
									(approvalForced || Boolean(binding?.requireApproval))
								}
								approvalDisabled={!toolEnabled || approvalForced}
								onApprovalChange={(checked) => setToolApproval(tool, checked)}
								approvalLabel={approvalLabel}
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
	setBuiltinBindingsAction: setBuiltinBindings,
	mcpServers,
	mcpTools,
	mcpBindings,
	setMcpBindingsAction: setMcpBindings,
	customTools,
	customBindings,
	setCustomBindingsAction: setCustomBindings,
	knowledgeBases,
	selectedKnowledgeIds,
	setSelectedKnowledgeIdsAction: setSelectedKnowledgeIds,
	skills,
	selectedSkillIds,
	setSelectedSkillIdsAction: setSelectedSkillIds,
	saving,
	readOnly = false,
	onSaveAction: onSave,
}: {
	builtinTools: BuiltinTool[];
	builtinBindings: ToolBindingState;
	setBuiltinBindingsAction: (
		fn: (prev: ToolBindingState) => ToolBindingState,
	) => void;
	mcpServers: McpServer[];
	mcpTools: McpTool[];
	mcpBindings: ToolBindingState;
	setMcpBindingsAction: (
		fn: (prev: ToolBindingState) => ToolBindingState,
	) => void;
	customTools: CustomTool[];
	customBindings: ToolBindingState;
	setCustomBindingsAction: (
		fn: (prev: ToolBindingState) => ToolBindingState,
	) => void;
	knowledgeBases: KnowledgeBase[];
	selectedKnowledgeIds: string[];
	setSelectedKnowledgeIdsAction: (fn: (prev: string[]) => string[]) => void;
	skills: AgentSkill[];
	selectedSkillIds: string[];
	setSelectedSkillIdsAction: (fn: (prev: string[]) => string[]) => void;
	saving: boolean;
	readOnly?: boolean;
	onSaveAction: () => void;
}) {
	const t = useTranslations("agents.configurePage");
	const tCap = useTranslations("agents.capabilities");
	const tCommon = useTranslations("common");

	return (
		<div
			className={cn("space-y-4", readOnly && "pointer-events-none opacity-75")}
		>
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
								allToolsLabel={t("allTools")}
								extraApprovalLabel={t("extraApproval")}
								approvalLabel={t("approval")}
								partialLabel={t("partial")}
								mixedApprovalLabel={t("mixedApproval")}
								forcedLabel={t("forced")}
							/>
						))}
						<Button variant="outline" size="sm" asChild className="w-fit">
							<Link href="/tools?tab=mcp">{t("manageMcp")}</Link>
						</Button>
					</div>
				)}
			</ConfigSection>

			<ConfigSection
				title={tCap("customToolsTitle")}
				description={tCap("customToolsHint")}
				icon={WrenchIcon}
				stagger="5"
			>
				{customTools.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-6 text-center">
						<p className="text-sm text-muted-foreground">
							{tCap("noCustomTools")}
						</p>
						<Button variant="outline" size="sm" asChild>
							<Link href="/custom-tools">{tCap("createCustomTool")}</Link>
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{customTools.map((tool) => (
							<ToolRow
								key={tool.id}
								name={tool.name}
								description={tool.description ?? undefined}
								enabled={customBindings[tool.id]?.enabled ?? false}
								onEnabledChange={(enabled) =>
									setCustomBindings((current) => ({
										...current,
										[tool.id]: {
											enabled,
											requireApproval:
												current[tool.id]?.requireApproval ?? true,
										},
									}))
								}
								requireApproval={
									customBindings[tool.id]?.requireApproval ?? true
								}
								approvalDisabled={!customBindings[tool.id]?.enabled}
								onApprovalChange={(checked) =>
									setCustomBindings((current) => ({
										...current,
										[tool.id]: {
											enabled: current[tool.id]?.enabled ?? false,
											requireApproval: checked,
										},
									}))
								}
								approvalLabel={t("approval")}
							/>
						))}
					</div>
				)}
			</ConfigSection>

			<ConfigSection
				title={tCap("skillsTitle")}
				description={tCap("skillsHint")}
				icon={BookMarkedIcon}
				stagger="5"
			>
				{skills.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-8 text-center">
						<BookMarkedIcon
							className="size-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="text-sm text-muted-foreground">{tCap("noSkills")}</p>
						<Button variant="outline" size="sm" asChild>
							<Link href="/tools?tab=skills">
								<PlusIcon className="size-4" aria-hidden="true" />
								{tCap("installSkill")}
							</Link>
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{skills.map((skill) => (
							<label
								key={skill.id}
								className={cn(
									"ui-list-row flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/25 hover:bg-card/65 hover:shadow-[var(--surface-shadow-hover)]",
									selectedSkillIds.includes(skill.id)
										? "border-primary/30 bg-primary/5"
										: "border-border/60",
								)}
							>
								<span className="min-w-0">
									<span className="flex items-center gap-3 font-medium">
										<span
											className={cn(
												"flex size-8 items-center justify-center rounded-lg",
												selectedSkillIds.includes(skill.id)
													? "bg-primary/10 text-primary"
													: "bg-muted text-muted-foreground",
											)}
										>
											<BookMarkedIcon className="size-4" aria-hidden="true" />
										</span>
										{skill.name}
									</span>
									{skill.description ? (
										<span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">
											{skill.description}
										</span>
									) : null}
								</span>
								<Switch
									checked={selectedSkillIds.includes(skill.id)}
									onCheckedChange={(checked) =>
										setSelectedSkillIds((current) =>
											checked
												? [...current, skill.id]
												: current.filter((id) => id !== skill.id),
										)
									}
								/>
							</label>
						))}
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
									"ui-list-row flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/25 hover:bg-card/65 hover:shadow-[var(--surface-shadow-hover)]",
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

			{readOnly ? null : (
				<CardFooter className="justify-end px-0 pb-0">
					<Button type="button" disabled={saving} onClick={onSave}>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{tCommon("save")}
					</Button>
				</CardFooter>
			)}
		</div>
	);
}
