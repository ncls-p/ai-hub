import { Link } from "@/i18n/navigation";
import {
	ChevronDownIcon,
	SaveIcon,
	ServerIcon,
	ShieldCheckIcon,
	WrenchIcon,
} from "lucide-react";

import { ListRow } from "@/components/list-row";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type {
	BuiltinTool,
	McpServer,
	McpTool,
	ToolBindingState,
	ToolFilter,
} from "./types";
import { getMcpServerState, isMcpToolApprovalForced } from "./utils";
import { InfoCallout, Toolbar } from "./shared";

/* ─── Built-in Tools Section ──────────────────────────────────────── */

function toolRiskVariant(riskLevel: string) {
	if (riskLevel === "high" || riskLevel === "critical") return "destructive";
	if (riskLevel === "medium") return "secondary";
	return "outline";
}

function setBuiltinToolEnabled(
	tool: BuiltinTool,
	enabled: boolean,
	setBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void,
) {
	setBindings((current) => ({
		...current,
		[tool.id]: {
			enabled,
			requireApproval:
				current[tool.id]?.requireApproval ??
				(tool.riskLevel === "high" || tool.riskLevel === "critical"),
		},
	}));
}

function BuiltinToolsSection({
	tools,
	bindings,
	setBindings,
	searchQuery,
	filter,
}: {
	tools: BuiltinTool[];
	bindings: ToolBindingState;
	setBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	searchQuery: string;
	filter: ToolFilter;
}) {
	const filtered = tools.filter((tool) => {
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			if (
				!tool.name.toLowerCase().includes(q) &&
				!tool.displayName.toLowerCase().includes(q) &&
				!tool.description.toLowerCase().includes(q) &&
				!(tool.category ?? "").toLowerCase().includes(q)
			)
				return false;
		}
		if (filter === "enabled" && !bindings[tool.id]?.enabled) return false;
		if (filter === "disabled" && bindings[tool.id]?.enabled) return false;
		return true;
	});
	const selectedCount = tools.filter(
		(tool) => bindings[tool.id]?.enabled,
	).length;

	return (
		<Card className="animate-in-up stagger-3 overflow-hidden border-border/70 bg-card/80 shadow-sm">
			<CardHeader className="gap-2 border-b border-border/60 bg-muted/20">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2 text-base">
							<WrenchIcon className="size-4" aria-hidden="true" />
							Built-in tools
						</CardTitle>
						<CardDescription className="mt-1">
							Enable useful native capabilities. Advanced approval stays hidden
							by default.
						</CardDescription>
					</div>
					<Badge variant="secondary" className="w-fit rounded-full">
						{selectedCount}/{tools.length} enabled
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-3 sm:p-4">
				{filtered.length === 0 ? (
					<div className="py-8 text-center">
						<WrenchIcon
							className="mx-auto size-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="mt-2 text-sm font-medium">
							{tools.length === 0
								? "No built-in tools available"
								: "No tools match your filters"}
						</p>
					</div>
				) : (
					<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{filtered.map((tool) => {
							const binding = bindings[tool.id];
							const enabled = Boolean(binding?.enabled);
							return (
								<div
									key={tool.id}
									className="rounded-2xl border border-border/60 bg-background/70 p-3 transition-colors hover:border-primary/30 hover:bg-muted/30"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-1.5">
												<p className="truncate text-sm font-medium">
													{tool.displayName}
												</p>
												{tool.category ? (
													<Badge variant="outline" className="text-[10px]">
														{tool.category}
													</Badge>
												) : null}
											</div>
											<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
												{tool.description}
											</p>
										</div>
										<Switch
											checked={enabled}
											onCheckedChange={(checked) =>
												setBuiltinToolEnabled(tool, checked, setBindings)
											}
											aria-label={`Enable ${tool.displayName}`}
										/>
									</div>
									<AdvancedSection
										label="Advanced"
										hint="Approval"
										className="mt-3 border-border/50 bg-muted/10"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<p className="text-sm font-medium">Require approval</p>
												<p className="text-xs text-muted-foreground">
													Ask before this tool runs.
												</p>
											</div>
											<Switch
												checked={binding?.requireApproval ?? false}
												disabled={!enabled}
												onCheckedChange={(checked) =>
													setBindings((current) => ({
														...current,
														[tool.id]: {
															enabled: current[tool.id]?.enabled ?? false,
															requireApproval: checked,
														},
													}))
												}
											/>
										</div>
										<Badge
											variant={toolRiskVariant(tool.riskLevel)}
											className="mt-3 text-[10px]"
										>
											{tool.riskLevel} risk
										</Badge>
									</AdvancedSection>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/* ─── MCP Server Row ──────────────────────────────────────────────── */

function McpServerRow({
	server,
	mcpTools,
	mcpServers,
	mcpBindings,
	setMcpBindings,
}: {
	server: McpServer;
	mcpTools: McpTool[];
	mcpServers: McpServer[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
}) {
	const serverState = getMcpServerState(
		server.id,
		mcpTools,
		mcpServers,
		mcpBindings,
	);

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
								data-icon="inline-start"
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
								<Badge variant="outline">Partial</Badge>
							)}
							{serverState.someApproval && (
								<Badge variant="outline">Mixed approval</Badge>
							)}
							{serverState.forcedApprovalCount > 0 && (
								<Badge variant="secondary">
									{serverState.forcedApprovalCount} forced
								</Badge>
							)}
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{serverState.bindableTools.length} available{" "}
							{serverState.bindableTools.length !== 1 ? "tools" : "tool"}
							{" · "}
							{serverState.selectedCount} bound to this assistant
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-4 text-xs">
					<label className="flex items-center gap-2">
						All tools
						<Switch
							checked={serverState.allSelected}
							disabled={serverState.bindableTools.length === 0}
							onCheckedChange={setServerToolsEnabled}
						/>
					</label>
					<label className="flex items-center gap-2">
						Extra approval
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
				{serverState.allTools.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No tools synced yet. Sync this MCP server before binding it to an
						assistant.
					</p>
				) : (
					serverState.allTools.map((tool) => {
						const binding = mcpBindings[tool.id];
						const toolSelected = tool.enabled && Boolean(binding?.enabled);
						const approvalForced = isMcpToolApprovalForced(tool, mcpServers);
						return (
							<ListRow
								key={tool.id}
								className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium">{tool.name}</p>
										{!tool.enabled && (
											<Badge variant="outline">Disabled in MCP</Badge>
										)}
										{approvalForced && (
											<Badge variant="secondary">Approval forced</Badge>
										)}
									</div>
									{tool.description && (
										<p className="mt-1 text-xs text-muted-foreground line-clamp-1">
											{tool.description}
										</p>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-4 text-xs">
									<label className="flex items-center gap-2">
										<ShieldCheckIcon
											className="size-3 text-muted-foreground"
											aria-hidden="true"
										/>
										Approval
										<Switch
											checked={
												tool.enabled &&
												(approvalForced || Boolean(binding?.requireApproval))
											}
											disabled={!toolSelected || approvalForced}
											onCheckedChange={(checked) =>
												setToolApproval(tool, checked)
											}
										/>
									</label>
									<label className="flex items-center gap-2">
										Use
										<Switch
											checked={toolSelected}
											disabled={!tool.enabled}
											onCheckedChange={(checked) =>
												setToolEnabled(tool, checked)
											}
										/>
									</label>
								</div>
							</ListRow>
						);
					})
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

/* ─── MCP Tools Section ───────────────────────────────────────────── */

function McpToolsSection({
	mcpServers,
	mcpTools,
	mcpBindings,
	setMcpBindings,
	searchQuery,
}: {
	mcpServers: McpServer[];
	mcpTools: McpTool[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	searchQuery: string;
}) {
	const filteredServers = searchQuery.trim()
		? mcpServers.filter((server) => {
				const q = searchQuery.toLowerCase();
				if (server.name.toLowerCase().includes(q)) return true;
				return mcpTools
					.filter((t) => t.mcpServerId === server.id)
					.some(
						(t) =>
							t.name.toLowerCase().includes(q) ||
							(t.description ?? "").toLowerCase().includes(q),
					);
			})
		: mcpServers;

	return (
		<Card className="animate-in-up stagger-4">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ServerIcon className="size-5" aria-hidden="true" />
					MCP Tools
				</CardTitle>
				<CardDescription>
					External tools via MCP servers. Configure per-server and per-tool.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{filteredServers.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
						<ServerIcon
							className="mx-auto size-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="mt-2 text-sm font-medium">
							{mcpServers.length === 0
								? "No MCP servers configured"
								: "No servers match your search"}
						</p>
						{mcpServers.length === 0 && (
							<>
								<p className="mt-1 text-sm text-muted-foreground">
									Connect an MCP server to give your assistant access to
									external tools.
								</p>
								<Button variant="outline" size="sm" asChild className="mt-3">
									<Link href="/tools?tab=mcp">Add MCP server</Link>
								</Button>
							</>
						)}
					</div>
				) : (
					filteredServers.map((server) => (
						<McpServerRow
							key={server.id}
							server={server}
							mcpTools={mcpTools}
							mcpServers={mcpServers}
							mcpBindings={mcpBindings}
							setMcpBindings={setMcpBindings}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

/* ─── Main Tools Tab ──────────────────────────────────────────────── */

export function ToolsTab({
	builtinTools,
	builtinBindings,
	setBuiltinBindings,
	mcpServers,
	mcpTools,
	mcpBindings,
	setMcpBindings,
	toolSearch,
	setToolSearch,
	toolFilter,
	setToolFilter,
	saving,
	onSave,
}: {
	builtinTools: BuiltinTool[];
	builtinBindings: ToolBindingState;
	setBuiltinBindings: (
		fn: (prev: ToolBindingState) => ToolBindingState,
	) => void;
	mcpServers: McpServer[];
	mcpTools: McpTool[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	toolSearch: string;
	setToolSearch: (v: string) => void;
	toolFilter: ToolFilter;
	setToolFilter: (v: ToolFilter) => void;
	saving: boolean;
	onSave: () => void;
}) {
	const selectedBuiltinCount = builtinTools.filter(
		(tool) => builtinBindings[tool.id]?.enabled,
	).length;
	const selectedMcpCount = mcpTools.filter(
		(tool) => mcpBindings[tool.id]?.enabled,
	).length;
	const selectedCount = selectedBuiltinCount + selectedMcpCount;

	return (
		<div className="space-y-4">
			<InfoCallout title="Choose capabilities" icon={WrenchIcon}>
				Turn on the tools this assistant can use. Keep it simple: enable a tool,
				then use Advanced only when approval needs to change.
			</InfoCallout>

			<Toolbar
				searchValue={toolSearch}
				onSearchChange={setToolSearch}
				filterValue={toolFilter}
				onFilterChange={(v) => setToolFilter(v as ToolFilter)}
				filterOptions={[
					{ value: "all", label: "All tools" },
					{ value: "enabled", label: "Enabled" },
					{ value: "disabled", label: "Disabled" },
				]}
				addButton={
					<Button onClick={onSave} disabled={saving}>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Save {selectedCount > 0 ? `${selectedCount} tools` : "tools"}
					</Button>
				}
			/>

			<BuiltinToolsSection
				tools={builtinTools}
				bindings={builtinBindings}
				setBindings={setBuiltinBindings}
				searchQuery={toolSearch}
				filter={toolFilter}
			/>

			<McpToolsSection
				mcpServers={mcpServers}
				mcpTools={mcpTools}
				mcpBindings={mcpBindings}
				setMcpBindings={setMcpBindings}
				searchQuery={toolSearch}
			/>
		</div>
	);
}
