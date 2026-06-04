"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdvancedSection } from "@/components/ui/advanced-section";
import {
	BotIcon,
	PlusIcon,
	SearchIcon,
	Loader2,
	MoreHorizontal,
	PencilIcon,
	Trash2Icon,
	SparklesIcon,
	WrenchIcon,
	BookOpenIcon,
	ServerIcon,
	ClockIcon,
	ShieldIcon,
	UsersIcon,
	GlobeIcon,
	StarIcon,
	XIcon,
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";

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

function timeAgo(dateString: string): string {
	const now = new Date();
	const date = new Date(dateString);
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	return date.toLocaleDateString();
}

export default function AgentsPage() {
	const t = useTranslations("agents");
	const tCommon = useTranslations("common");
	const router = useRouter();
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [creating, setCreating] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
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

	const loadBindingSummaries = useCallback(
		async (agentList: Agent[], currentWorkspaceId: string) => {
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
		},
		[],
	);

	const refreshAgents = useCallback(async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const res = await fetch(
				`/api/workspace/agents?workspaceId=${workspaceId}`,
				{
					signal: abortRef.current.signal,
				},
			);
			if (!res.ok) throw new Error("Failed to fetch agents");
			const data = await res.json();
			const nextAgents = Array.isArray(data) ? data : data.agents;
			setAgents(nextAgents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
			await loadBindingSummaries(nextAgents, workspaceId);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				console.error("Failed to load agents", err);
			}
		} finally {
			setLoading(false);
		}
	}, [workspaceId, loadBindingSummaries]);

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
					await loadBindingSummaries(nextAgents, currentWorkspaceId);
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
	}, [workspaceId, loadBindingSummaries]);

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

	const filteredAgents = agents.filter((agent) => {
		if (!searchQuery.trim()) return true;
		const q = searchQuery.toLowerCase();
		return (
			agent.name.toLowerCase().includes(q) ||
			(agent.description ?? "").toLowerCase().includes(q) ||
			agent.slug.toLowerCase().includes(q)
		);
	});

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			title="Assistants"
			description="Manage your AI assistants — each one can have its own model, system prompt, tools, and knowledge bases."
			width="default"
			actions={
				<Button size="sm" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon className="size-4" aria-hidden="true" />
					New assistant
				</Button>
			}
		>
			<div className="space-y-6">
				{/* Agents list card */}
				<section className="surface-panel">
					{/* Toolbar */}
					<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-base font-semibold">Assistants</h3>
							<p className="text-sm text-muted-foreground">
								{agents.length} assistant{agents.length !== 1 ? "s" : ""}{" "}
								configured
							</p>
						</div>
						<div className="flex items-center gap-2">
							{agents.length > 2 ? (
								<div className="relative w-48 sm:w-56">
									<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										placeholder="Filter…"
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="h-8 pl-9 text-sm"
									/>
									{searchQuery ? (
										<Button
											variant="ghost"
											size="icon-sm"
											className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
											onClick={() => setSearchQuery("")}
											aria-label="Clear search"
										>
											<XIcon className="size-3" aria-hidden="true" />
										</Button>
									) : null}
								</div>
							) : null}
						</div>
					</div>

					{/* List content */}
					{loading ? (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : agents.length === 0 ? (
						<div className="px-5 py-12 text-center">
							<p className="text-sm font-medium">No assistants yet</p>
							<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
								Create your first assistant to start chatting with AI. Each
								assistant gets its own model, system prompt, tools, and
								knowledge bases.
							</p>
							<Button
								size="sm"
								className="mt-4"
								onClick={() => setShowCreateDialog(true)}
							>
								<PlusIcon className="size-4" aria-hidden="true" />
								Create your first assistant
							</Button>
						</div>
					) : filteredAgents.length === 0 ? (
						<div className="px-5 py-8 text-center text-sm text-muted-foreground">
							No assistant matches &ldquo;{searchQuery}&rdquo;.
						</div>
					) : (
						<div className="p-2 space-y-1">
							{filteredAgents.map((agent) => {
								const bindings = bindingSummaries[agent.id];
								const isReady = Boolean(agent.activeVersionId);

								return (
									<div
										key={agent.id}
										className={cn(
											"group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40",
											!isReady && "opacity-60",
										)}
									>
										<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<BotIcon className="size-4" aria-hidden="true" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<p className="truncate text-sm font-medium">
													{agent.name}
												</p>
												<Badge
													variant="outline"
													className={cn(
														"gap-1 text-xs",
														isReady
															? "border-success/30 bg-success/10 text-success"
															: "",
													)}
												>
													{isReady ? (
														<SparklesIcon
															className="size-3"
															aria-hidden="true"
														/>
													) : (
														<ClockIcon className="size-3" aria-hidden="true" />
													)}
													{isReady ? "Ready" : "Needs setup"}
												</Badge>
											</div>
											<p className="truncate font-mono text-xs text-muted-foreground">
												{agent.description
													? agent.description
													: `slug: ${agent.slug} · created ${timeAgo(agent.createdAt)}`}
											</p>
										</div>

										{/* Badges */}
										<div className="hidden items-center gap-1.5 sm:flex">
											{agent.sharingMode === "marketplace" && (
												<Badge variant="secondary" className="gap-1">
													<UsersIcon className="size-3" aria-hidden="true" />
													Workspace
												</Badge>
											)}
											{agent.sharingMode === "specific_user" && (
												<Badge variant="secondary" className="gap-1">
													<ShieldIcon className="size-3" aria-hidden="true" />
													Shared
												</Badge>
											)}
											{agent.isGlobal && (
												<Badge variant="secondary" className="gap-1">
													<GlobeIcon className="size-3" aria-hidden="true" />
													Global
												</Badge>
											)}
											{agent.isRecommended && (
												<Badge variant="secondary" className="gap-1">
													<StarIcon className="size-3" aria-hidden="true" />
													Recommended
												</Badge>
											)}
										</div>

										{/* Capability indicators */}
										<div className="hidden items-center gap-3 lg:flex">
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<WrenchIcon className="size-3" aria-hidden="true" />
												<span>{bindings?.toolCount ?? "–"}</span>
											</div>
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<BookOpenIcon className="size-3" aria-hidden="true" />
												<span>{bindings?.knowledgeCount ?? "–"}</span>
											</div>
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<ServerIcon className="size-3" aria-hidden="true" />
												<span>{bindings?.mcpCount ?? "–"}</span>
											</div>
										</div>

										{/* Quick actions */}
										<Button
											variant="ghost"
											size="sm"
											className="shrink-0 text-xs"
											onClick={() =>
												router.push(
													agent.activeVersionId
														? `/chat?agentId=${agent.id}`
														: `/agents/${agent.id}`,
												)
											}
										>
											{isReady ? "Chat" : "Setup"}
										</Button>

										{/* Dropdown actions */}
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													size="icon-sm"
													variant="ghost"
													className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
													aria-label="Agent actions"
												>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={() =>
														router.push(
															agent.activeVersionId
																? `/chat?agentId=${agent.id}`
																: `/agents/${agent.id}`,
														)
													}
												>
													<SparklesIcon className="size-4" />
													{isReady ? "Chat now" : "Finish setup"}
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => router.push(`/agents/${agent.id}`)}
												>
													<PencilIcon className="size-4" />
													Configure
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													onClick={() => setDeleteAgentId(agent.id)}
												>
													<Trash2Icon className="size-4" />
													Delete agent
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								);
							})}
						</div>
					)}
				</section>
			</div>

			{/* Create dialog */}
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{t("createTitle")}</DialogTitle>
						<DialogDescription>{t("description")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-name">{t("name")}</Label>
							<Input
								id="agent-name"
								placeholder={t("namePlaceholder")}
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
							<Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
							<Textarea
								id="agent-description"
								placeholder={t("descriptionPlaceholder")}
								value={form.description}
								onChange={(e) =>
									setForm({
										...form,
										description: e.target.value,
									})
								}
							/>
						</div>
						<AdvancedSection
							label={tCommon("advanced")}
							hint={t("advancedHint")}
							storageKey="advanced:agent-create"
						>
							<div className="flex flex-col gap-4">
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
											<SelectItem value="marketplace">
												Share with workspace
											</SelectItem>
											<SelectItem value="specific_user">
												Specific user
											</SelectItem>
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
													<SelectItem value="recommended">
														Recommended
													</SelectItem>
													<SelectItem value="organization_created">
														Organization created
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
								) : null}
							</div>
						</AdvancedSection>
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
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
									Creating…
								</>
							) : (
								"Create agent"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
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
							{deleting ? "Deleting…" : "Delete agent"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</WorkspacePage>
	);
}
