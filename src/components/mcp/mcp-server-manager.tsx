"use client";

import { useCallback, useEffect, useState } from "react";
import {
	ChevronDownIcon,
	Loader2,
	NetworkIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	Trash2Icon,
	ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

interface McpServer {
	id: string;
	name: string;
	transport: string;
	url: string | null;
	command: string | null;
	healthStatus: string | null;
	enabled: boolean;
	hasHeaders: boolean;
	hasEnv: boolean;
}
interface McpTool {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
}

const emptyForm = {
	name: "",
	transport: "streamable-http",
	url: "",
	command: "",
	args: "",
	headers: "",
	env: "",
};

function parsePairs(input: string) {
	const rows = input
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (rows.length === 0) return undefined;
	const result: Record<string, string> = {};
	for (const row of rows) {
		const idx = row.indexOf("=");
		if (idx === -1) continue;
		const key = row.slice(0, idx).trim();
		const value = row.slice(idx + 1).trim();
		if (key) result[key] = value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

export function McpServerManager() {
	const { workspaceId } = useWorkspace();
	const [servers, setServers] = useState<McpServer[]>([]);
	const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [form, setForm] = useState(emptyForm);
	const [editServer, setEditServer] = useState<McpServer | null>(null);
	const [editForm, setEditForm] = useState(emptyForm);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>(
		{},
	);

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
					args: form.args
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean),
					headers: parsePairs(form.headers),
					env: parsePairs(form.env),
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setForm(emptyForm);
			setShowCreateForm(false);
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
			const res = await fetch(
				`/api/workspace/mcp-servers/${editServer.id}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						name: editForm.name.trim(),
						url: editForm.url.trim() || "",
						command: editForm.command.trim() || undefined,
						args: editForm.args
							.split("\n")
							.map((line) => line.trim())
							.filter(Boolean),
						enabled: editServer.enabled,
						headers: parsePairs(editForm.headers),
						env: parsePairs(editForm.env),
					}),
				},
			);
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setEditServer(null);
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
		} else toast.error(data.error || "Connection failed");
	}

	async function toggleTool(
		serverId: string,
		toolId: string,
		enabled: boolean,
	) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, enabled }),
			},
		);
		if (!res.ok) {
			toast.error("Unable to update tool");
			return;
		}
		await load();
	}

	async function toggleEnabled(server: McpServer, enabled: boolean) {
		if (!workspaceId) return;
		const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, enabled }),
		});
		if (!res.ok) {
			toast.error("Unable to update server");
			return;
		}
		await load();
	}

	return (
		<div className="flex flex-col gap-6">
			<Card size={showCreateForm ? "default" : "sm"}>
				<CardHeader>
					<CardTitle>MCP servers</CardTitle>
					<CardDescription>
						Connect servers once, then sync tools and enable only what agents can use.
					</CardDescription>
					<CardAction>
						<Button
							type="button"
							variant={showCreateForm ? "outline" : "default"}
							size="sm"
							onClick={() => setShowCreateForm((value) => !value)}
						>
							{showCreateForm ? (
								"Cancel"
							) : (
								<>
									<PlusIcon data-icon="inline-start" aria-hidden="true" />
									Add Server
								</>
							)}
						</Button>
					</CardAction>
				</CardHeader>
				{showCreateForm ? (
					<>
						<CardContent className="grid gap-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-2">
									<Label htmlFor="mcp-name">Name</Label>
									<Input
										id="mcp-name"
										autoComplete="off"
										value={form.name}
										onChange={(e) => setForm({ ...form, name: e.target.value })}
										placeholder="Company tools…"
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="mcp-transport">Transport</Label>
									<Select
										value={form.transport}
										onValueChange={(value) =>
											setForm({ ...form, transport: value })
										}
									>
										<SelectTrigger id="mcp-transport">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="streamable-http">
												Streamable HTTP
											</SelectItem>
											<SelectItem value="sse">SSE</SelectItem>
											<SelectItem value="stdio">stdio</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							{form.transport === "stdio" ? (
								<>
									<div className="grid gap-2">
										<Label htmlFor="mcp-command">Command</Label>
										<Input
											id="mcp-command"
											autoComplete="off"
											value={form.command}
											onChange={(e) =>
												setForm({ ...form, command: e.target.value })
											}
											placeholder="npx…"
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="mcp-args">Args (one per line)</Label>
										<Textarea
											id="mcp-args"
											autoComplete="off"
											value={form.args}
											onChange={(e) =>
												setForm({ ...form, args: e.target.value })
											}
											placeholder={
												"-y\n@modelcontextprotocol/server-filesystem…"
											}
										/>
									</div>
								</>
							) : (
								<div className="grid gap-2">
									<Label htmlFor="mcp-url">Server URL</Label>
									<Input
										id="mcp-url"
										type="url"
										autoComplete="off"
										value={form.url}
										onChange={(e) => setForm({ ...form, url: e.target.value })}
										placeholder="https://mcp.example.com…"
									/>
								</div>
							)}
							<div className="grid gap-2">
								<Label htmlFor="mcp-headers">Headers (API keys)</Label>
								<Textarea
									id="mcp-headers"
									autoComplete="off"
									value={form.headers}
									onChange={(e) =>
										setForm({ ...form, headers: e.target.value })
									}
									placeholder="Authorization=Bearer sk-…"
								/>
								<p className="text-xs text-muted-foreground">
									One header per line as <code>Key=Value</code>. For Meta MCP use
									SSE transport and your bearer token here.
								</p>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="mcp-env">Environment variables</Label>
								<Textarea
									id="mcp-env"
									autoComplete="off"
									value={form.env}
									onChange={(e) => setForm({ ...form, env: e.target.value })}
									placeholder="API_KEY=…"
								/>
							</div>
						</CardContent>
						<CardFooter className="justify-end">
							<Button
								disabled={busy || !form.name.trim()}
								onClick={() => void createServer()}
							>
								{busy ? (
									<Loader2 className="animate-spin" aria-hidden="true" />
								) : (
									<PlusIcon data-icon="inline-start" aria-hidden="true" />
								)}
								Add MCP Server
							</Button>
						</CardFooter>
					</>
				) : null}
			</Card>

			{loading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="animate-spin" aria-hidden="true" />
				</div>
			) : servers.length === 0 ? (
				<Card size="sm">
					<CardContent className="p-8 text-center text-sm text-muted-foreground">
						No MCP servers yet. Add a server when an assistant needs external
						tools.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4">
					{servers.map((server) => {
						const tools = toolsByServer[server.id] ?? [];
						const isExpanded = expandedServers[server.id] ?? false;

						return (
							<Collapsible
								key={server.id}
								open={isExpanded}
								onOpenChange={(open) =>
									setExpandedServers((current) => ({
										...current,
										[server.id]: open,
									}))
								}
							>
								<Card>
									<CardHeader>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="flex min-w-0 flex-1 items-start gap-2">
												<CollapsibleTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="mt-0.5 size-8 shrink-0"
														aria-label={
															isExpanded
																? `Collapse ${server.name} tools`
																: `Expand ${server.name} tools`
														}
													>
														<ChevronDownIcon
															className={cn(
																"transition-transform",
																isExpanded && "rotate-180",
															)}
															aria-hidden="true"
														/>
													</Button>
												</CollapsibleTrigger>
												<div className="min-w-0">
													<CardTitle className="flex flex-wrap items-center gap-2">
														<NetworkIcon className="size-5 shrink-0" aria-hidden="true" />
														<span className="truncate">{server.name}</span>
														{tools.length > 0 ? (
															<Badge variant="secondary">
																{tools.length} tool{tools.length === 1 ? "" : "s"}
															</Badge>
														) : null}
													</CardTitle>
													<CardDescription className="truncate">
														{server.url || server.command || server.transport}
													</CardDescription>
												</div>
											</div>
											<div className="flex flex-wrap items-center justify-end gap-2">
												<div className="flex items-center gap-2 text-sm">
													<span className="hidden sm:inline">Enabled</span>
													<Switch
														aria-label={`Enable ${server.name}`}
														checked={server.enabled}
														onCheckedChange={(checked) =>
															void toggleEnabled(server, checked)
														}
													/>
												</div>
												<Badge variant="outline">
													{server.healthStatus || "unknown"}
												</Badge>
												{server.hasHeaders ? (
													<Badge variant="secondary">API key</Badge>
												) : null}
												<Button
													size="sm"
													variant="outline"
													onClick={() => void test(server.id)}
												>
													<ZapIcon data-icon="inline-start" aria-hidden="true" />
													Test
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => void sync(server.id)}
												>
													<RefreshCwIcon
														data-icon="inline-start"
														aria-hidden="true"
													/>
													Sync
												</Button>
												<Button
													size="icon-sm"
													variant="ghost"
													aria-label={`Edit ${server.name}`}
													onClick={() => {
														setEditServer(server);
														setEditForm({
															name: server.name,
															transport: server.transport,
															url: server.url ?? "",
															command: server.command ?? "",
															args: "",
															headers: "",
															env: "",
														});
													}}
												>
													<PencilIcon aria-hidden="true" />
												</Button>
												<Button
													size="icon-sm"
													variant="ghost"
													aria-label={`Remove ${server.name}`}
													onClick={() => setDeleteId(server.id)}
												>
													<Trash2Icon aria-hidden="true" />
												</Button>
											</div>
										</div>
									</CardHeader>
									<CollapsibleContent>
										<CardContent className="grid max-h-96 gap-2 overflow-y-auto border-t border-border/60 pt-4">
											{tools.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													No tools discovered. Run sync after configuring credentials.
												</p>
											) : (
												tools.map((tool) => (
													<div
														key={tool.id}
														className="ui-list-row flex items-center justify-between gap-3 p-3"
													>
														<div className="min-w-0">
															<p className="truncate font-medium">{tool.name}</p>
															{tool.description ? (
																<p className="line-clamp-2 text-sm text-muted-foreground">
																	{tool.description}
																</p>
															) : null}
														</div>
														<Switch
															aria-label={`Enable ${tool.name}`}
															checked={tool.enabled}
															onCheckedChange={(checked) =>
																void toggleTool(server.id, tool.id, checked)
															}
														/>
													</div>
												))
											)}
										</CardContent>
									</CollapsibleContent>
								</Card>
							</Collapsible>
						);
					})}
				</div>
			)}

			<Dialog open={Boolean(editServer)} onOpenChange={() => setEditServer(null)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Edit MCP server</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="grid gap-2">
							<Label htmlFor="mcp-edit-name">Name</Label>
							<Input
								id="mcp-edit-name"
								autoComplete="off"
								value={editForm.name}
								onChange={(e) =>
									setEditForm({ ...editForm, name: e.target.value })
								}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="mcp-edit-url">URL</Label>
							<Input
								id="mcp-edit-url"
								type="url"
								autoComplete="off"
								value={editForm.url}
								onChange={(e) =>
									setEditForm({ ...editForm, url: e.target.value })
								}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="mcp-edit-headers">Headers (replaces existing)</Label>
							<Textarea
								id="mcp-edit-headers"
								autoComplete="off"
								value={editForm.headers}
								onChange={(e) =>
									setEditForm({ ...editForm, headers: e.target.value })
								}
								placeholder="Authorization=Bearer …"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditServer(null)}>
							Cancel
						</Button>
						<Button disabled={busy} onClick={() => void saveEdit()}>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={Boolean(deleteId)} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove MCP server?</AlertDialogTitle>
						<AlertDialogDescription>
							Agents bound to these tools will lose access.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => deleteId && void removeServer(deleteId)}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
