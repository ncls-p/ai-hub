import Link from "next/link";
import { ChevronDownIcon, SaveIcon, ServerIcon, ShieldCheckIcon, WrenchIcon } from "lucide-react";

import { ListRow } from "@/components/list-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
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
import { cn } from "@/lib/utils";

import type { BuiltinTool, McpServer, McpTool, ToolBindingState, ToolFilter } from "./types";
import { getMcpServerState, isMcpToolApprovalForced } from "./utils";
import { InfoCallout, Toolbar } from "./shared";

/* ─── Built-in Tools Section ──────────────────────────────────────── */

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
	const filtered = tools.filter((t) => {
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			if (
				!t.name.toLowerCase().includes(q) &&
				!t.description.toLowerCase().includes(q)
			)
				return false;
		}
		if (filter === "enabled" && !bindings[t.id]?.enabled) return false;
		if (filter === "disabled" && bindings[t.id]?.enabled) return false;
		return true;
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<WrenchIcon className="size-5" aria-hidden="true" />
					Built-in Tools
				</CardTitle>
				<CardDescription>
					Platform-provided tools. Toggle to enable and set approval requirements.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
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
						{tools.length > 0 && (
							<p className="mt-1 text-xs text-muted-foreground">
								Try adjusting your search or filter
							</p>
						)}
					</div>
				) : (
					filtered.map((tool) => (
						<ListRow
							key={tool.id}
							className="items-center justify-between"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<p className="font-medium">{tool.name}</p>
									<Badge
										variant={
											tool.riskLevel === "high"
												? "destructive"
												: tool.riskLevel === "medium"
													? "secondary"
													: "outline"
										}
										className="text-[10px]"
									>
										{tool.riskLevel} risk
									</Badge>
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
									{tool.description}
								</p>
							</div>
							<div className="flex items-center gap-4">
								<label className="flex items-center gap-2 text-xs">
									<ShieldCheckIcon
										className="size-3 text-muted-foreground"
										aria-hidden="true"
									/>
									Approval
									<Switch
										checked={bindings[tool.id]?.requireApproval ?? false}
										disabled={!bindings[tool.id]?.enabled}
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
								</label>
								<Switch
									checked={bindings[tool.id]?.enabled ?? false}
									onCheckedChange={(checked) =>
										setBindings((current) => ({
											...current,
											[tool.id]: {
												enabled: checked,
												requireApproval: current[tool.id]?.requireApproval ?? false,
											},
										}))
									}
								/>
							</div>
						</ListRow>
					))
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
						isMcpToolApprovalForced(tool, mcpServers) || (cb?.requireApproval ?? false),
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
			className="rounded-xl border border-border/60 p-3"
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
						No tools synced yet. Sync this MCP server before binding it to an assistant.
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
											onCheckedChange={(checked) => setToolApproval(tool, checked)}
										/>
									</label>
									<label className="flex items-center gap-2">
										Use
										<Switch
											checked={toolSelected}
											disabled={!tool.enabled}
											onCheckedChange={(checked) => setToolEnabled(tool, checked)}
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
	onSave,
	saving,
}: {
	mcpServers: McpServer[];
	mcpTools: McpTool[];
	mcpBindings: ToolBindingState;
	setMcpBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
	searchQuery: string;
	onSave: () => void;
	saving: boolean;
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
		<Card>
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
									Connect an MCP server to give your assistant access to external tools.
								</p>
								<Button variant="outline" size="sm" asChild className="mt-3">
									<Link href="/mcp">Add MCP server</Link>
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
			<CardFooter className="justify-end">
				<Button onClick={onSave} disabled={saving}>
					{saving ? (
						<Spinner data-icon="inline-start" />
					) : (
						<SaveIcon data-icon="inline-start" aria-hidden="true" />
					)}
					Save tools
				</Button>
			</CardFooter>
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
	setBuiltinBindings: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
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
	return (
		<div className="space-y-4">
			<InfoCallout title="About tools" icon={WrenchIcon}>
				Tools give your assistant the ability to perform actions beyond text
				generation. Built-in tools are provided by the platform. MCP (Model
				Context Protocol) tools connect to external services. Enable
				&quot;Approval&quot; to require user confirmation before a tool runs.
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
				onSave={onSave}
				saving={saving}
			/>
		</div>
	);
}
