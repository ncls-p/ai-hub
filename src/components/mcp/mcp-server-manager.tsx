"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

import {
	CreateServerDialog,
	DeleteServerDialog,
	EditServerDialog,
} from "./mcp-server-manager/dialogs";
import {
	buildEnv,
	buildHeaders,
	emptyForm,
	serverFormFromServer,
	type McpServerForm,
} from "./mcp-server-manager/form";
import {
	ResourceShareDialog,
	type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { ServerList } from "./mcp-server-manager/server-list";
import { SystemStrip } from "./mcp-server-manager/stats";
import type {
	McpServer,
	McpTool,
	ServerStatusFilter,
} from "./mcp-server-manager/types";

export function McpServerManager() {
	const { workspaceId } = useWorkspace();
	const [servers, setServers] = useState<McpServer[]>([]);
	const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState("");
	const [filterStatus, setFilterStatus] = useState<ServerStatusFilter>("all");
	const [showCreate, setShowCreate] = useState(false);
	const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
	const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
	const [form, setForm] = useState<McpServerForm>(emptyForm);
	const [editServer, setEditServer] = useState<McpServer | null>(null);
	const [editForm, setEditForm] = useState<McpServerForm>(emptyForm);
	const [editLoading, setEditLoading] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [shareResource, setShareResource] = useState<ShareableResource | null>(
		null,
	);
	const [expandedServers, setExpandedServers] = useState<
		Record<string, boolean>
	>({});
	const [toolSearch, setToolSearch] = useState<Record<string, string>>({});

	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load MCP servers");
			const data = (await res.json()) as McpServer[];
			setServers(data);
			const entries = await Promise.all(
				data.map(async (server) => {
					const toolRes = await fetch(
						`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
					);
					return [server.id, toolRes.ok ? await toolRes.json() : []] as const;
				}),
			);
			setToolsByServer(Object.fromEntries(entries));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load MCP servers",
			);
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async MCP bootstrap
		void load();
	}, [load]);

	const filteredServers = useMemo(() => {
		let result = servers;
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.transport.toLowerCase().includes(q) ||
					(s.url ?? "").toLowerCase().includes(q) ||
					(s.command ?? "").toLowerCase().includes(q),
			);
		}
		if (filterStatus === "enabled") result = result.filter((s) => s.enabled);
		if (filterStatus === "disabled") result = result.filter((s) => !s.enabled);
		return result;
	}, [servers, search, filterStatus]);

	async function openEdit(server: McpServer) {
		if (!workspaceId) return;
		setEditServer(server);
		setEditForm(emptyForm);
		setEditLoading(true);
		setShowAdvancedEdit(false);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${server.id}?workspaceId=${workspaceId}`,
			);
			if (!res.ok) {
				throw new Error(
					((await res.json().catch(() => ({}))) as { error?: string }).error ||
						"Failed to load MCP server",
				);
			}
			const data = (await res.json()) as McpServer;
			setEditServer(data);
			setEditForm(serverFormFromServer(data, data.authHint));
		} catch (error) {
			setEditServer(null);
			toast.error(
				error instanceof Error ? error.message : "Failed to load MCP server",
			);
		} finally {
			setEditLoading(false);
		}
	}

	function closeEdit() {
		setEditServer(null);
		setEditLoading(false);
		setShowAdvancedEdit(false);
	}

	async function createServer() {
		if (!workspaceId || !form.name.trim()) return;
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/mcp-servers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name.trim(),
					transport: form.transport,
					url: form.url.trim() || undefined,
					command: form.command.trim() || undefined,
					args: linesFromTextarea(form.args),
					requireApproval: form.requireApproval,
					headers: buildHeaders(form),
					env: buildEnv(form),
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setForm(emptyForm);
			setShowCreate(false);
			setShowAdvancedCreate(false);
			toast.success("MCP server added");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function saveEdit() {
		if (!workspaceId || !editServer) return;
		setBusy(true);
		try {
			const res = await fetch(`/api/workspace/mcp-servers/${editServer.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: editForm.name.trim(),
					transport: editForm.transport,
					url: editForm.url.trim() || "",
					command: editForm.command.trim() || undefined,
					args: linesFromTextarea(editForm.args),
					enabled: editServer.enabled,
					requireApproval: editForm.requireApproval,
					headers: buildHeaders(editForm),
					env: buildEnv(editForm),
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			closeEdit();
			toast.success("MCP server updated");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function removeServer(serverId: string) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error("Failed to remove");
			setDeleteId(null);
			toast.success("MCP server removed");
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove server",
			);
		} finally {
			setBusy(false);
		}
	}

	async function sync(serverId: string) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}`,
				{ method: "POST" },
			);
			const data = (await res.json().catch(() => ({}))) as {
				discovered?: number;
				status?: string;
				error?: string;
			};
			if (res.ok) {
				toast.success(
					data.discovered
						? `Synced ${data.discovered} tools`
						: "Sync completed — no tools returned",
				);
				await load();
			} else {
				toast.error(data.error || "Sync failed");
			}
		} finally {
			setBusy(false);
		}
	}

	async function test(serverId: string) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/test?workspaceId=${workspaceId}`,
			{ method: "POST" },
		);
		const data = await res.json().catch(() => ({}));
		if (res.ok) {
			toast.success(data.message || "Connection OK");
			await load();
		} else {
			toast.error(data.error || "Connection failed");
		}
	}

	async function patchServer(server: McpServer, body: Record<string, unknown>) {
		if (!workspaceId) return;
		const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, ...body }),
		});
		if (!res.ok) {
			toast.error("Unable to update server");
			return;
		}
		await load();
	}

	async function patchTool(
		serverId: string,
		toolId: string,
		body: Record<string, unknown>,
	) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, ...body }),
			},
		);
		if (!res.ok) {
			toast.error("Unable to update tool");
			return;
		}
		await load();
	}

	return (
		<div className="space-y-6">
			<div className="rounded-xl border bg-card p-5 sm:p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold tracking-tight">
							MCP Servers
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Connect external MCP servers so your agents can use their tools.
						</p>
					</div>
					<Button size="sm" onClick={() => setShowCreate(true)}>
						<PlusIcon className="size-4" aria-hidden="true" />
						Add server
					</Button>
				</div>
				<AdvancedSection
					label="Server health"
					hint="Status, enabled tools, and sync details"
					storageKey="advanced:mcp-health"
					className="mt-5 border-border/50 bg-muted/20"
				>
					<SystemStrip servers={servers} toolsByServer={toolsByServer} />
				</AdvancedSection>
			</div>

			<ServerList
				servers={servers}
				filteredServers={filteredServers}
				toolsByServer={toolsByServer}
				loading={loading}
				search={search}
				filterStatus={filterStatus}
				expandedServers={expandedServers}
				toolSearch={toolSearch}
				onSearchChange={setSearch}
				onFilterChange={setFilterStatus}
				onAddServer={() => setShowCreate(true)}
				onExpandedServersChange={setExpandedServers}
				onToolSearchChange={setToolSearch}
				onEditServer={(server) => void openEdit(server)}
				onDeleteServer={setDeleteId}
				onTestServer={(serverId) => void test(serverId)}
				onSyncServer={(serverId) => void sync(serverId)}
				onShareServer={(server) =>
					setShareResource({
						kind: "mcp_server",
						id: server.id,
						name: server.name,
						description: null,
					})
				}
				onShareTool={(server, tool) =>
					setShareResource({
						kind: "mcp_tool",
						id: tool.id,
						name: `${server.name} — ${tool.name}`,
						description: tool.description,
					})
				}
				onToggleEnabled={(server, enabled) =>
					void patchServer(server, { enabled })
				}
				onToggleServerApproval={(server, requireApproval) =>
					void patchServer(server, { requireApproval })
				}
				onToggleTool={(serverId, toolId, enabled) =>
					void patchTool(serverId, toolId, { enabled })
				}
				onToggleToolApproval={(serverId, toolId, requireApproval) =>
					void patchTool(serverId, toolId, { requireApproval })
				}
			/>

			<CreateServerDialog
				open={showCreate}
				busy={busy}
				form={form}
				setForm={setForm}
				showAdvanced={showAdvancedCreate}
				onAdvancedChange={setShowAdvancedCreate}
				onOpenChange={setShowCreate}
				onCreate={() => void createServer()}
			/>
			<EditServerDialog
				server={editServer}
				busy={busy}
				loading={editLoading}
				form={editForm}
				setForm={setEditForm}
				showAdvanced={showAdvancedEdit}
				onAdvancedChange={setShowAdvancedEdit}
				onClose={closeEdit}
				onSave={() => void saveEdit()}
			/>
			<DeleteServerDialog
				deleteId={deleteId}
				onClose={() => setDeleteId(null)}
				onDelete={(id) => void removeServer(id)}
			/>
			<ResourceShareDialog
				resource={shareResource}
				workspaceId={workspaceId}
				open={shareResource !== null}
				onCloseAction={() => setShareResource(null)}
			/>
		</div>
	);
}

function linesFromTextarea(value: string) {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}
