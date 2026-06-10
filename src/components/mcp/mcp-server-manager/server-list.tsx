"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import {
	ChevronDownIcon,
	MoreHorizontal,
	PencilIcon,
	RefreshCwIcon,
	SearchIcon,
	Share2,
	ShieldAlert,
	Trash2Icon,
	Wrench,
	XIcon,
	ZapIcon,
	PlusIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { serverFormFromServer } from "./form";
import { ServerCardSkeleton, TransportTypeIcon } from "./mcp-shared";
import {
	getHealthColor,
	healthDotClass,
	serverEndpointLabel,
	transportAccent,
	transportLabel,
} from "./transport";
import type { McpServer, McpTool, ServerStatusFilter } from "./types";

type ServerListProps = {
	servers: McpServer[];
	filteredServers: McpServer[];
	toolsByServer: Record<string, McpTool[]>;
	loading: boolean;
	search: string;
	filterStatus: ServerStatusFilter;
	expandedServers: Record<string, boolean>;
	toolSearch: Record<string, string>;
	onSearchChange: (value: string) => void;
	onFilterChange: (value: ServerStatusFilter) => void;
	onAddServer: () => void;
	onExpandedServersChange: Dispatch<SetStateAction<Record<string, boolean>>>;
	onToolSearchChange: Dispatch<SetStateAction<Record<string, string>>>;
	onEditServer: (server: McpServer) => void;
	onDeleteServer: (serverId: string) => void;
	onTestServer: (serverId: string) => void;
	onSyncServer: (serverId: string) => void;
	onShareServer: (server: McpServer) => void;
	onShareTool: (server: McpServer, tool: McpTool) => void;
	onToggleEnabled: (server: McpServer, enabled: boolean) => void;
	onToggleServerApproval: (server: McpServer, requireApproval: boolean) => void;
	onToggleTool: (serverId: string, toolId: string, enabled: boolean) => void;
	onToggleToolApproval: (
		serverId: string,
		toolId: string,
		requireApproval: boolean,
	) => void;
};

export function ServerList(props: ServerListProps) {
	return (
		<section className="rounded-xl border bg-card">
			<ServerListToolbar {...props} />
			<ServerListContent {...props} />
		</section>
	);
}

function ServerListToolbar({
	servers,
	search,
	filterStatus,
	onSearchChange,
	onFilterChange,
}: ServerListProps) {
	return (
		<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 className="text-base font-semibold">Servers</h3>
				<p className="text-sm text-muted-foreground">
					{servers.length} server{servers.length !== 1 ? "s" : ""} configured
				</p>
			</div>
			<div className="flex items-center gap-2">
				{servers.length > 2 ? (
					<div className="relative w-48 sm:w-56">
						<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Filter…"
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							className="h-8 pl-9 text-sm"
						/>
						{search ? (
							<Button
								variant="ghost"
								size="icon-sm"
								className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
								onClick={() => onSearchChange("")}
								aria-label="Clear search"
							>
								<XIcon className="size-3" aria-hidden="true" />
							</Button>
						) : null}
					</div>
				) : null}
				<Select
					value={filterStatus}
					onValueChange={(v) => onFilterChange(v as ServerStatusFilter)}
				>
					<SelectTrigger className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="enabled">Enabled</SelectItem>
						<SelectItem value="disabled">Disabled</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

function ServerListContent(props: ServerListProps) {
	if (props.loading) {
		return (
			<div className="space-y-1 p-2">
				<ServerCardSkeleton />
				<ServerCardSkeleton />
			</div>
		);
	}

	if (props.filteredServers.length === 0 && props.servers.length === 0) {
		return <EmptyServers onAddServer={props.onAddServer} />;
	}

	if (props.filteredServers.length === 0) {
		return (
			<div className="px-5 py-8 text-center text-sm text-muted-foreground">
				No server matches &ldquo;{props.search}&rdquo;.
			</div>
		);
	}

	return (
		<div className="divide-y">
			{props.filteredServers.map((server) => (
				<ServerItem key={server.id} server={server} {...props} />
			))}
		</div>
	);
}

function EmptyServers({ onAddServer }: { onAddServer: () => void }) {
	return (
		<div className="px-5 py-12 text-center">
			<p className="text-sm font-medium">No MCP servers yet</p>
			<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
				Connect an MCP server to give your agents access to external tools.
			</p>
			<Button size="sm" className="mt-4" onClick={onAddServer}>
				<PlusIcon className="size-4" aria-hidden="true" />
				Add first server
			</Button>
		</div>
	);
}

function ServerItem({
	server,
	...props
}: ServerListProps & { server: McpServer }) {
	const tools = props.toolsByServer[server.id] ?? [];
	const isExpanded = props.expandedServers[server.id] ?? false;
	const serverToolSearch = props.toolSearch[server.id] ?? "";
	const filteredTools = serverToolSearch
		? tools.filter(
				(t) =>
					t.name.toLowerCase().includes(serverToolSearch.toLowerCase()) ||
					(t.description ?? "")
						.toLowerCase()
						.includes(serverToolSearch.toLowerCase()),
			)
		: tools;

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={(open) =>
				props.onExpandedServersChange((current) => ({
					...current,
					[server.id]: open,
				}))
			}
		>
			<div
				className={cn(
					"group transition-colors",
					!server.enabled && "opacity-60",
				)}
			>
				<ServerHeader
					server={server}
					tools={tools}
					isExpanded={isExpanded}
					{...props}
				/>
				<MobileServerToggles server={server} {...props} />
				<ToolsPanel
					server={server}
					tools={tools}
					filteredTools={filteredTools}
					serverToolSearch={serverToolSearch}
					{...props}
				/>
			</div>
		</Collapsible>
	);
}

function ServerHeader({
	server,
	tools,
	isExpanded,
	onEditServer,
	onDeleteServer,
	onTestServer,
	onSyncServer,
	onShareServer,
	onToggleEnabled,
	onToggleServerApproval,
}: ServerListProps & {
	server: McpServer;
	tools: McpTool[];
	isExpanded: boolean;
}) {
	const colors = transportAccent(server.transport);

	return (
		<CollapsibleTrigger asChild>
			<div className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none">
				<div
					className={cn(
						"hidden h-8 w-1 shrink-0 rounded-full sm:block",
						colors.bar,
					)}
				/>
				<TransportTypeIcon transport={server.transport} />
				<ServerSummary server={server} tools={tools} />
				<ServerBadges server={server} />
				<DesktopServerToggles
					server={server}
					onToggleEnabled={onToggleEnabled}
					onToggleServerApproval={onToggleServerApproval}
				/>
				<ServerActions
					server={server}
					onEditServer={onEditServer}
					onDeleteServer={onDeleteServer}
					onTestServer={onTestServer}
					onSyncServer={onSyncServer}
					onShareServer={onShareServer}
				/>
				<ChevronDownIcon
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						isExpanded && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</div>
		</CollapsibleTrigger>
	);
}

function ServerSummary({
	server,
	tools,
}: {
	server: McpServer;
	tools: McpTool[];
}) {
	return (
		<div className="min-w-0 flex-1">
			<div className="flex items-center gap-2">
				<p className="truncate text-sm font-medium">{server.name}</p>
				<Badge
					variant="outline"
					className={cn(
						"font-normal",
						server.enabled ? "text-success" : "text-muted-foreground",
					)}
				>
					<span
						className={healthDotClass(getHealthColor(server.healthStatus))}
					/>
					{transportLabel(server.transport)}
				</Badge>
				{tools.length > 0 ? (
					<Badge variant="secondary">
						{tools.length} tool{tools.length === 1 ? "" : "s"}
					</Badge>
				) : null}
			</div>
			<p className="truncate font-mono text-xs text-muted-foreground">
				{serverEndpointLabel(server)}
			</p>
		</div>
	);
}

function ServerBadges({ server }: { server: McpServer }) {
	return (
		<>
			{server.requireApproval ? (
				<Badge variant="secondary" className="hidden lg:inline-flex">
					<ShieldAlert className="size-3" aria-hidden="true" />
					Approval
				</Badge>
			) : null}
			{server.hasHeaders ? (
				<Badge variant="secondary" className="hidden lg:inline-flex">
					API key
				</Badge>
			) : null}
		</>
	);
}

function DesktopServerToggles({
	server,
	onToggleEnabled,
	onToggleServerApproval,
}: Pick<ServerListProps, "onToggleEnabled" | "onToggleServerApproval"> & {
	server: McpServer;
}) {
	return (
		<div
			className="hidden items-center gap-3 sm:flex"
			onClick={(e) => e.stopPropagation()}
		>
			<LabeledSwitch
				label="Enabled"
				ariaLabel={`Enable ${server.name}`}
				checked={server.enabled}
				onCheckedChange={(checked) => onToggleEnabled(server, checked)}
			/>
			<LabeledSwitch
				label="Approval"
				ariaLabel={`Require approval for ${server.name}`}
				checked={server.requireApproval}
				onCheckedChange={(checked) => onToggleServerApproval(server, checked)}
			/>
		</div>
	);
}

function MobileServerToggles({
	server,
	onToggleEnabled,
	onToggleServerApproval,
}: ServerListProps & { server: McpServer }) {
	return (
		<div className="flex items-center gap-4 border-t border-border/30 px-4 pt-2 pb-1 sm:hidden">
			<LabeledSwitch
				label="Enabled"
				ariaLabel={`Enable ${server.name}`}
				checked={server.enabled}
				onCheckedChange={(checked) => onToggleEnabled(server, checked)}
			/>
			<LabeledSwitch
				label="Approval"
				ariaLabel={`Require approval for ${server.name}`}
				checked={server.requireApproval}
				onCheckedChange={(checked) => onToggleServerApproval(server, checked)}
			/>
			{server.requireApproval ? (
				<Badge variant="secondary">
					<ShieldAlert className="size-3" aria-hidden="true" />
					Approval
				</Badge>
			) : null}
			{server.hasHeaders ? <Badge variant="secondary">API key</Badge> : null}
		</div>
	);
}

function LabeledSwitch({
	label,
	ariaLabel,
	checked,
	disabled,
	onCheckedChange,
}: {
	label: string;
	ariaLabel: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<Switch
				aria-label={ariaLabel}
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

function ServerActions({
	server,
	onEditServer,
	onDeleteServer,
	onTestServer,
	onSyncServer,
	onShareServer,
}: Pick<
	ServerListProps,
	| "onEditServer"
	| "onDeleteServer"
	| "onTestServer"
	| "onSyncServer"
	| "onShareServer"
> & { server: McpServer }) {
	const tShare = useTranslations("marketplace.share");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon-sm"
					variant="ghost"
					className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
					aria-label="Server actions"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => onTestServer(server.id)}>
					<ZapIcon className="size-4" />
					Test connection
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => onSyncServer(server.id)}>
					<RefreshCwIcon className="size-4" />
					Sync tools
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => onShareServer(server)}>
					<Share2 className="size-4" />
					{tShare("action")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => onEditServer(server)}>
					<PencilIcon className="size-4" />
					Edit server
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => onDeleteServer(server.id)}
				>
					<Trash2Icon className="size-4" />
					Remove server
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ToolsPanel({
	server,
	tools,
	filteredTools,
	serverToolSearch,
	onToolSearchChange,
	onToggleTool,
	onToggleToolApproval,
	onShareTool,
}: ServerListProps & {
	server: McpServer;
	tools: McpTool[];
	filteredTools: McpTool[];
	serverToolSearch: string;
}) {
	return (
		<CollapsibleContent>
			<div className="border-t border-border/60">
				{tools.length > 3 ? (
					<ToolSearch
						serverId={server.id}
						value={serverToolSearch}
						onToolSearchChange={onToolSearchChange}
					/>
				) : null}
				<div className="max-h-96 overflow-y-auto">
					{filteredTools.length === 0 ? (
						<div className="px-4 py-6 text-center text-sm text-muted-foreground">
							{tools.length === 0
								? "No tools discovered. Run sync after configuring credentials."
								: "No tools match your search."}
						</div>
					) : (
						<div className="divide-y divide-border/30 px-4 py-2">
							{filteredTools.map((tool) => (
								<ToolRow
									key={tool.id}
									server={server}
									tool={tool}
									onToggleTool={onToggleTool}
									onToggleToolApproval={onToggleToolApproval}
									onShareTool={onShareTool}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</CollapsibleContent>
	);
}

function ToolSearch({
	serverId,
	value,
	onToolSearchChange,
}: {
	serverId: string;
	value: string;
	onToolSearchChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
	return (
		<div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
			<SearchIcon
				className="size-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<Input
				placeholder="Search tools…"
				value={value}
				onChange={(e) =>
					onToolSearchChange((prev) => ({
						...prev,
						[serverId]: e.target.value,
					}))
				}
				className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
			/>
			{value ? (
				<Button
					variant="ghost"
					size="icon-sm"
					className="size-6"
					onClick={() =>
						onToolSearchChange((prev) => ({ ...prev, [serverId]: "" }))
					}
				>
					<XIcon className="size-3" aria-hidden="true" />
				</Button>
			) : null}
		</div>
	);
}

function ToolRow({
	server,
	tool,
	onToggleTool,
	onToggleToolApproval,
	onShareTool,
}: Pick<
	ServerListProps,
	"onToggleTool" | "onToggleToolApproval" | "onShareTool"
> & {
	server: McpServer;
	tool: McpTool;
}) {
	const tShare = useTranslations("marketplace.share");
	const isApprovalForced = server.requireApproval || tool.requireApproval;

	return (
		<div
			className={cn(
				"flex items-center gap-3 py-2.5 transition-opacity",
				!tool.enabled && "opacity-50",
			)}
		>
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-lg",
					tool.enabled
						? "bg-primary/10 text-primary"
						: "bg-muted text-muted-foreground",
				)}
			>
				<Wrench className="size-4" aria-hidden="true" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{tool.name}</span>
					<span
						className={cn(
							"size-2 shrink-0 rounded-full",
							tool.enabled ? "bg-success" : "bg-muted-foreground",
						)}
					/>
				</div>
				{tool.description ? (
					<p className="line-clamp-1 text-xs text-muted-foreground">
						{tool.description}
					</p>
				) : null}
			</div>
			{isApprovalForced ? (
				<Badge
					variant="secondary"
					className="hidden items-center gap-1 sm:flex"
				>
					<ShieldAlert className="size-3" aria-hidden="true" />
					{server.requireApproval ? "Forced" : "Approval"}
				</Badge>
			) : null}
			<div className="flex shrink-0 items-center gap-2">
				<Button
					size="icon-sm"
					variant="ghost"
					className="size-7 shrink-0"
					aria-label={`${tShare("action")} ${tool.name}`}
					onClick={() => onShareTool(server, tool)}
				>
					<Share2 className="size-3.5" aria-hidden="true" />
				</Button>
				<LabeledSwitch
					label="Approval"
					ariaLabel={`Require approval for ${tool.name}`}
					checked={isApprovalForced}
					disabled={server.requireApproval}
					onCheckedChange={(checked) =>
						onToggleToolApproval(server.id, tool.id, checked)
					}
				/>
				<LabeledSwitch
					label="Enabled"
					ariaLabel={`Enable ${tool.name}`}
					checked={tool.enabled}
					onCheckedChange={(checked) =>
						onToggleTool(server.id, tool.id, checked)
					}
				/>
			</div>
		</div>
	);
}

export { serverFormFromServer };
