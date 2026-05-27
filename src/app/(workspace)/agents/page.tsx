"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BotIcon,
	PlusIcon,
	TrashIcon,
	ChevronRightIcon,
	Loader2,
} from "lucide-react";

import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";

interface Agent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	activeVersionId: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	createdAt: string;
	updatedAt: string;
}

type AgentBindingSummary = {
	toolCount: number;
	knowledgeCount: number;
	mcpCount: number;
};

function slugifyAgentName(value: string) {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "assistant"
	);
}

export default function AgentsPage() {
	const router = useRouter();
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({
		name: "",
		slug: "",
		description: "",
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});
	const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [bindingSummaries, setBindingSummaries] = useState<
		Record<string, AgentBindingSummary>
	>({});
	const abortRef = useRef<AbortController | null>(null);

	const loadBindingSummaries = async (
		agentList: Agent[],
		currentWorkspaceId: string,
	) => {
		const summaries = await Promise.all(
			agentList.map(async (agent) => {
				const [toolsRes, knowledgeRes] = await Promise.all([
					fetch(
						`/api/workspace/agents/${agent.id}/tools?workspaceId=${currentWorkspaceId}`,
					),
					fetch(
						`/api/workspace/agents/${agent.id}/knowledge?workspaceId=${currentWorkspaceId}`,
					),
				]);
				const tools = toolsRes.ok ? await toolsRes.json() : [];
				const knowledge = knowledgeRes.ok
					? ((await knowledgeRes.json()) as { bindings?: unknown[] }).bindings
					: [];
				const toolList = Array.isArray(tools) ? tools : [];
				const mcpCount = toolList.filter(
					(tool) =>
						typeof tool === "object" &&
						tool !== null &&
						"toolSource" in tool &&
						(tool as { toolSource: string }).toolSource === "mcp",
				).length;
				return {
					agentId: agent.id,
					toolCount: toolList.length,
					knowledgeCount: Array.isArray(knowledge) ? knowledge.length : 0,
					mcpCount,
				};
			}),
		);
		setBindingSummaries(
			Object.fromEntries(
				summaries.map((summary) => [
					summary.agentId,
					{
						toolCount: summary.toolCount,
						knowledgeCount: summary.knowledgeCount,
						mcpCount: summary.mcpCount,
					},
				]),
			),
		);
	};

	const refreshAgents = async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const res = await fetch(`/api/workspace/agents?workspaceId=${workspaceId}`, {
				signal: abortRef.current.signal,
			});
			if (!res.ok) throw new Error("Failed to fetch agents");
			const data = await res.json();
			const nextAgents = Array.isArray(data) ? data : data.agents;
			setAgents(nextAgents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
			void loadBindingSummaries(nextAgents, workspaceId);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				console.error("Failed to load agents", err);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!workspaceId) return;
		const currentWorkspaceId = workspaceId;
		let cancelled = false;
		const controller = new AbortController();

		async function loadInitialAgents() {
			try {
				const res = await fetch(
					`/api/workspace/agents?workspaceId=${currentWorkspaceId}`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("Failed to load agents");
				const data = await res.json();
				if (!cancelled) {
					const nextAgents = Array.isArray(data) ? data : data.agents;
					setAgents(nextAgents);
					setCanAdminCurate(Boolean(data.canAdminCurate));
					void loadBindingSummaries(nextAgents, currentWorkspaceId);
				}
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					console.error("Failed to load agents", err);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void loadInitialAgents();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [workspaceId]);

	const handleCreate = async () => {
		if (!workspaceId || !form.name.trim()) return;
		const slug = form.slug.trim() || slugifyAgentName(form.name);
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: form.name.trim(),
					slug,
					description: form.description.trim() || undefined,
					workspaceId,
					sharingMode: form.sharingMode,
					shareTargetEmail:
						form.sharingMode === "specific_user"
							? form.shareTargetEmail.trim()
							: undefined,
					isGlobal: canAdminCurate ? form.isGlobal : undefined,
					isRecommended: canAdminCurate ? form.isRecommended : undefined,
					curationLabel: canAdminCurate ? form.curationLabel : undefined,
				}),
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to create agent");
			}

			toast.success("Agent created");
			setShowCreateDialog(false);
			setForm({
				name: "",
				slug: "",
				description: "",
				sharingMode: "personal",
				shareTargetEmail: "",
				isGlobal: false,
				isRecommended: false,
				curationLabel: "none",
			});
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create agent",
			);
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!workspaceId || !deleteAgentId) return;
		setDeleting(true);
		try {
			const res = await fetch(
				`/api/workspace/agents/${deleteAgentId}?workspaceId=${workspaceId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete agent");
			}

			toast.success("Agent deleted");
			setDeleteAgentId(null);
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete agent",
			);
		} finally {
			setDeleting(false);
		}
	};

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Configuration"
			title="Assistants"
			description="Pick an assistant to chat, or open configuration when you need to change its model, tools, or knowledge."
			width="default"
			actions={
				<Button type="button" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New assistant
				</Button>
			}
		>
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Create assistant</DialogTitle>
						<DialogDescription>
							Give your assistant a name. You can bind a model after creation.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								placeholder="My Assistant"
								value={form.name}
								onChange={(e) =>
									setForm({
										...form,
										name: e.target.value,
										slug: slugifyAgentName(e.target.value),
									})
								}
								autoFocus
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-description">Description (optional)</Label>
							<Textarea
								id="agent-description"
								placeholder="A helpful assistant for..."
								value={form.description}
								onChange={(e) =>
									setForm({
										...form,
										description: e.target.value,
									})
								}
							/>
						</div>
						<Button
							type="button"
							variant="ghost"
							className="justify-start px-0"
							onClick={() => setShowAdvancedCreate((value) => !value)}
						>
							{showAdvancedCreate ? "Hide advanced settings" : "Advanced settings"}
						</Button>
						{showAdvancedCreate ? (
							<>
								<div className="flex flex-col gap-2">
									<Label htmlFor="agent-slug">Slug</Label>
									<Input
										id="agent-slug"
										placeholder="my-assistant"
										value={form.slug}
										onChange={(e) =>
											setForm({
												...form,
												slug: e.target.value,
											})
										}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="agent-sharing">Access</Label>
									<Select
										value={form.sharingMode}
										onValueChange={(value) =>
											setForm({
												...form,
												sharingMode: value as Agent["sharingMode"],
											})
										}
									>
										<SelectTrigger id="agent-sharing" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="personal">Personal</SelectItem>
											<SelectItem value="marketplace">Share with workspace</SelectItem>
											<SelectItem value="specific_user">Specific user</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{form.sharingMode === "specific_user" ? (
									<div className="flex flex-col gap-2">
										<Label htmlFor="agent-share-email">User email</Label>
										<Input
											id="agent-share-email"
											type="email"
											value={form.shareTargetEmail}
											onChange={(e) =>
												setForm({ ...form, shareTargetEmail: e.target.value })
											}
										/>
									</div>
								) : null}
								{canAdminCurate ? (
									<div className="rounded-xl border border-border/70 p-3">
										<div className="flex flex-col gap-3 text-sm">
											<div className="flex items-center gap-2">
												<Checkbox
													id="agent-global"
													checked={form.isGlobal}
													onCheckedChange={(checked) =>
														setForm({ ...form, isGlobal: checked === true })
													}
												/>
												<label htmlFor="agent-global">Global</label>
											</div>
											<div className="flex items-center gap-2">
												<Checkbox
													id="agent-recommended"
													checked={form.isRecommended}
													onCheckedChange={(checked) =>
														setForm({
															...form,
															isRecommended: checked === true,
														})
													}
												/>
												<label htmlFor="agent-recommended">Recommended</label>
											</div>
									<Select
										value={form.curationLabel}
										onValueChange={(value) =>
											setForm({ ...form, curationLabel: value })
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">No label</SelectItem>
											<SelectItem value="recommended">Recommended</SelectItem>
											<SelectItem value="organization_created">
												Organization created
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						) : null}
							</>
						) : null}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCreateDialog(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							disabled={
								creating ||
								!form.name.trim() ||
								!form.slug.trim() ||
								(form.sharingMode === "specific_user" &&
									!form.shareTargetEmail.trim())
							}
						>
							{creating ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Creating...
								</>
							) : (
								"Create agent"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deleteAgentId !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteAgentId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete agent?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the agent and its configuration versions.
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={() => void handleDelete()}
						>
							{deleting ? "Deleting..." : "Delete agent"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : agents.length === 0 ? (
				<Card>
					<CardContent>
						<Empty className="min-h-72 border border-border/70 bg-background/55">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<BotIcon aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>No agents yet</EmptyTitle>
								<EmptyDescription>
									Create your first agent to start configuring model behavior,
									tools, and knowledge sources.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									type="button"
									size="sm"
									onClick={() => setShowCreateDialog(true)}
								>
									<PlusIcon data-icon="inline-start" aria-hidden="true" />
									Create agent
								</Button>
							</EmptyContent>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{agents.map((agent) => (
						<Card key={agent.id} className="group relative">
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between">
									<CardTitle className="flex items-center gap-2 text-base">
										<BotIcon
											className="size-4 text-primary"
											aria-hidden="true"
										/>
										{agent.name}
									</CardTitle>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => setDeleteAgentId(agent.id)}
										aria-label={`Delete ${agent.name}`}
									>
										<TrashIcon className="size-4 text-destructive" />
									</Button>
								</div>
								{agent.description && (
									<CardDescription className="line-clamp-2">
										{agent.description}
									</CardDescription>
								)}
								<div className="mt-3 flex flex-wrap gap-2">
									<Badge
										variant={agent.activeVersionId ? "secondary" : "outline"}
									>
										{agent.activeVersionId ? "Ready" : "Needs setup"}
									</Badge>
									{bindingSummaries[agent.id]?.toolCount ? (
										<Badge variant="outline">
											{bindingSummaries[agent.id].toolCount} tools
										</Badge>
									) : null}
									{bindingSummaries[agent.id]?.knowledgeCount ? (
										<Badge variant="outline">
											{bindingSummaries[agent.id].knowledgeCount} knowledge
										</Badge>
									) : null}
									{bindingSummaries[agent.id]?.mcpCount ? (
										<Badge variant="outline">
											{bindingSummaries[agent.id].mcpCount} MCP
										</Badge>
									) : null}
								</div>
							</CardHeader>
							<CardContent>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>{agent.slug}</span>
									<span>{new Date(agent.updatedAt).toLocaleDateString()}</span>
								</div>
								<div className="mt-3 flex gap-2">
									<Button
										variant={agent.activeVersionId ? "default" : "secondary"}
										size="sm"
										className="flex-1"
										onClick={() =>
											router.push(
												agent.activeVersionId
													? `/chat?agentId=${agent.id}`
													: `/agents/${agent.id}`,
											)
										}
									>
										{agent.activeVersionId ? "Chat" : "Finish setup"}
										<ChevronRightIcon className="ml-1 size-3" />
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => router.push(`/agents/${agent.id}`)}
									>
										Configure
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</WorkspacePage>
	);
}
