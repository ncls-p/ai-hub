"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AdvancedSection } from "@/components/ui/advanced-section";
import {
	CheckCircle2Icon,
	CopyIcon,
	MessageCircleIcon,
	PlusIcon,
	SearchIcon,
	Loader2,
	MoreHorizontal,
	PencilIcon,
	Trash2Icon,
	ClockIcon,
	Store,
	XIcon,
	Share2,
} from "lucide-react";

import { PageLoading } from "@/components/page-loading";
import { ModelLogo } from "@/components/providers/model-logo";
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
import {
	ResourceShareDialog,
	type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AGENT_TEMPLATES = [
	{
		id: "support",
		nameKey: "templates.support.name",
		descriptionKey: "templates.support.description",
		promptKey: "templates.support.prompt",
	},
	{
		id: "hr",
		nameKey: "templates.hr.name",
		descriptionKey: "templates.hr.description",
		promptKey: "templates.hr.prompt",
	},
	{
		id: "documents",
		nameKey: "templates.documents.name",
		descriptionKey: "templates.documents.description",
		promptKey: "templates.documents.prompt",
	},
	{
		id: "sales",
		nameKey: "templates.sales.name",
		descriptionKey: "templates.sales.description",
		promptKey: "templates.sales.prompt",
	},
	{
		id: "project",
		nameKey: "templates.project.name",
		descriptionKey: "templates.project.description",
		promptKey: "templates.project.prompt",
	},
	{
		id: "blank",
		nameKey: "templates.blank.name",
		descriptionKey: "templates.blank.description",
		promptKey: "templates.blank.prompt",
	},
] as const;

interface Agent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	logoUrl?: string | null;
	activeVersionId: string | null;
	modelDisplayName?: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	canEdit?: boolean;
	canClone?: boolean;
	createdAt: string;
	updatedAt: string;
}

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

function timeAgo(
	dateString: string,
	tList: (key: string, values?: { count: number }) => string,
	locale: string,
): string {
	const now = new Date();
	const date = new Date(dateString);
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (seconds < 60) return tList("timeJustNow");
	if (seconds < 3600)
		return tList("timeMinutesAgo", { count: Math.floor(seconds / 60) });
	if (seconds < 86400)
		return tList("timeHoursAgo", { count: Math.floor(seconds / 3600) });
	if (seconds < 604800)
		return tList("timeDaysAgo", { count: Math.floor(seconds / 86400) });
	return date.toLocaleDateString(locale);
}

export default function AgentsPage() {
	const locale = useLocale();
	const t = useTranslations("agents");
	const tList = useTranslations("agents.list");
	const tCommon = useTranslations("common");
	const tShare = useTranslations("marketplace.share");
	const tChat = useTranslations("chat");
	const router = useRouter();
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [creating, setCreating] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [form, setForm] = useState({
		templateId: "blank",
		name: "",
		slug: "",
		description: "",
		systemPrompt: "",
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});
	const [shareResource, setShareResource] = useState<ShareableResource | null>(
		null,
	);
	const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const refreshAgents = useCallback(async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const res = await fetch(
				`/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
				{
					signal: abortRef.current.signal,
				},
			);
			if (!res.ok) throw new Error("Failed to fetch agents");
			const data = await res.json();
			const nextAgents = Array.isArray(data) ? data : data.agents;
			setAgents(nextAgents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				console.error("Failed to load agents", err);
			}
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		const currentWorkspaceId = workspaceId;
		let cancelled = false;
		const controller = new AbortController();

		async function loadInitialAgents() {
			try {
				const res = await fetch(
					`/api/workspace/agents?workspaceId=${currentWorkspaceId}&includeModelMeta=true`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("Failed to load agents");
				const data = await res.json();
				if (!cancelled) {
					const nextAgents = Array.isArray(data) ? data : data.agents;
					setAgents(nextAgents);
					setCanAdminCurate(Boolean(data.canAdminCurate));
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

	function applyTemplate(template: (typeof AGENT_TEMPLATES)[number]) {
		const name = tList(template.nameKey);
		setForm((current) => ({
			...current,
			templateId: template.id,
			name,
			slug: slugifyAgentName(name),
			description: tList(template.descriptionKey),
			systemPrompt: tList(template.promptKey),
		}));
	}

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
					systemPrompt: form.systemPrompt.trim() || undefined,
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
				throw new Error(err.error || tList("toastCreateFailed"));
			}

			const data = (await res.json()) as { agent?: Agent };
			toast.success(tList("toastCreated"));
			setShowCreateDialog(false);
			setForm({
				templateId: "blank",
				name: "",
				slug: "",
				description: "",
				systemPrompt: "",
				sharingMode: "personal",
				shareTargetEmail: "",
				isGlobal: false,
				isRecommended: false,
				curationLabel: "none",
			});
			if (data.agent?.id) {
				router.push(`/agents/${data.agent.id}`);
				return;
			}
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : tList("toastCreateFailed"),
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
				throw new Error(err.error || tList("toastDeleteFailed"));
			}

			toast.success(tList("toastDeleted"));
			setDeleteAgentId(null);
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : tList("toastDeleteFailed"),
			);
		} finally {
			setDeleting(false);
		}
	};

	async function cloneAgent(agent: Agent) {
		if (!workspaceId) return;
		try {
			const res = await fetch(`/api/workspace/agents/${agent.id}/clone`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error || tList("toastCloneFailed"));
			}
			const data = (await res.json()) as { agent?: Agent };
			toast.success(tList("toastCloned"));
			await refreshAgents();
			if (data.agent?.id) router.push(`/agents/${data.agent.id}`);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : tList("toastCloneFailed"),
			);
		}
	}

	async function publishAgent(agent: Agent) {
		if (!workspaceId) return;
		try {
			const res = await fetch("/api/marketplace/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					agentId: agent.id,
					version: "1.0.0",
					name: agent.name,
					description: agent.description || "",
					draftOnly: true,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error || "Publication échouée");
			}
			toast.success(tShare("publishedDraft"));
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Une erreur est survenue",
			);
		}
	}

	const readyAgentsCount = agents.filter((agent) =>
		Boolean(agent.activeVersionId && agent.modelDisplayName),
	).length;
	const needsSetupCount = agents.length - readyAgentsCount;
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
		return <PageLoading label={tCommon("loading")} />;
	}

	return (
		<WorkspacePage
			title={t("title")}
			description={tList("pageDescription")}
			width="default"
			actions={
				<Button size="sm" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon className="size-4" aria-hidden="true" />
					{t("create")}
				</Button>
			}
		>
			<div className="flex flex-col gap-6">
				<section className="rounded-2xl border bg-card p-5">
					<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
						<div className="max-w-2xl">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{tList("guideEyebrow")}
							</p>
							<h2 className="mt-2 text-xl font-semibold tracking-tight">
								{tList("guideTitle")}
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								{tList("guideDescription")}
							</p>
						</div>
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
							<div className="grid grid-cols-2 gap-2 text-sm">
								<div className="rounded-xl border bg-background px-3 py-2">
									<p className="font-medium">{readyAgentsCount}</p>
									<p className="text-xs text-muted-foreground">
										{tList("readyCount", { count: readyAgentsCount })}
									</p>
								</div>
								<div className="rounded-xl border bg-background px-3 py-2">
									<p className="font-medium">{needsSetupCount}</p>
									<p className="text-xs text-muted-foreground">
										{tList("needsSetupCount", { count: needsSetupCount })}
									</p>
								</div>
							</div>
							<Button size="sm" onClick={() => setShowCreateDialog(true)}>
								<PlusIcon className="size-4" aria-hidden="true" />
								{t("create")}
							</Button>
						</div>
					</div>
					<ol className="mt-5 grid gap-2 sm:grid-cols-3">
						{[
							tList("guideStepCreate"),
							tList("guideStepModel"),
							tList("guideStepChat"),
						].map((step, index) => (
							<li
								key={step}
								className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm"
							>
								<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
									{index + 1}
								</span>
								<span className="min-w-0 truncate">{step}</span>
							</li>
						))}
					</ol>
				</section>

				{/* Agents list card */}
				<section className="rounded-2xl border bg-card">
					{/* Toolbar */}
					<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="text-base font-semibold">{t("title")}</h3>
							<p className="text-sm text-muted-foreground">
								{tList("configuredCount", { count: agents.length })}
							</p>
						</div>
						<div className="flex items-center gap-2">
							{agents.length > 2 ? (
								<div className="relative w-48 sm:w-56">
									<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										placeholder={tList("filterPlaceholder")}
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
											aria-label={tList("clearSearch")}
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
							<p className="text-sm font-medium">{tList("emptyTitle")}</p>
							<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
								{tList("emptyDescription")}
							</p>
							<Button
								size="sm"
								className="mt-4"
								onClick={() => setShowCreateDialog(true)}
							>
								<PlusIcon className="size-4" aria-hidden="true" />
								{tList("emptyCta")}
							</Button>
						</div>
					) : filteredAgents.length === 0 ? (
						<div className="px-5 py-8 text-center text-sm text-muted-foreground">
							{tList("noMatch", { query: searchQuery })}
						</div>
					) : (
						<div className="flex flex-col gap-1 p-2">
							{filteredAgents.map((agent) => {
								const isReady = Boolean(
									agent.activeVersionId && agent.modelDisplayName,
								);

								return (
									<div
										key={agent.id}
										className={cn(
											"group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40",
											!isReady && "opacity-60",
										)}
									>
										<ModelLogo
											logoUrl={agent.logoUrl}
											label={agent.name}
											size="md"
										/>
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
														<CheckCircle2Icon
															className="size-3"
															aria-hidden="true"
														/>
													) : (
														<ClockIcon className="size-3" aria-hidden="true" />
													)}
													{isReady
														? t("statusReady")
														: tList("statusNeedsSetup")}
												</Badge>
												{agent.isGlobal ? (
													<Badge variant="secondary" className="text-xs">
														{tList("badgeGlobal")}
													</Badge>
												) : null}
												{agent.isRecommended ? (
													<Badge variant="outline" className="text-xs">
														{tList("badgeRecommended")}
													</Badge>
												) : null}
											</div>
											<p className="truncate font-mono text-xs text-muted-foreground">
												{agent.description
													? agent.description
													: tList("metaSlugCreated", {
															slug: agent.slug,
															date: timeAgo(agent.createdAt, tList, locale),
														})}
											</p>
										</div>

										{/* Quick actions */}
										<Button
											variant="ghost"
											size="sm"
											className="shrink-0 text-xs"
											onClick={() =>
												router.push(
													isReady
														? `/chat?agentId=${agent.id}`
														: `/agents/${agent.id}`,
												)
											}
										>
											{isReady ? t("chat") : tList("setup")}
										</Button>

										{/* Dropdown actions */}
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													size="icon-sm"
													variant="ghost"
													className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
													aria-label={tList("agentActions")}
												>
													<MoreHorizontal className="size-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={() =>
														router.push(
															isReady
																? `/chat?agentId=${agent.id}`
																: `/agents/${agent.id}`,
														)
													}
												>
													<MessageCircleIcon className="size-4" />
													{isReady ? tCommon("chatNow") : tChat("finishSetup")}
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => router.push(`/agents/${agent.id}`)}
												>
													<PencilIcon className="size-4" />
													{agent.canEdit ? t("configure") : tList("view")}
												</DropdownMenuItem>
												{agent.canClone !== false ? (
													<DropdownMenuItem
														onClick={() => void cloneAgent(agent)}
													>
														<CopyIcon className="size-4" />
														{tList("clone")}
													</DropdownMenuItem>
												) : null}
												{agent.canEdit ? (
													<DropdownMenuItem
														onClick={() =>
															setShareResource({
																kind: "agent",
																id: agent.id,
																name: agent.name,
																description: agent.description,
															})
														}
													>
														<Share2 className="size-4" />
														{tShare("action")}
													</DropdownMenuItem>
												) : null}
												{agent.canEdit ? (
													<DropdownMenuItem
														onClick={() => void publishAgent(agent)}
													>
														<Store className="size-4" />
														{tShare("publish")}
													</DropdownMenuItem>
												) : null}
												{agent.canEdit ? (
													<>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onClick={() => setDeleteAgentId(agent.id)}
														>
															<Trash2Icon className="size-4" />
															{t("configurePage.delete")}
														</DropdownMenuItem>
													</>
												) : null}
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
						<DialogDescription>{tList("guideDescription")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label>{tList("templateLabel")}</Label>
							<div className="grid grid-cols-2 gap-2">
								{AGENT_TEMPLATES.map((template) => (
									<button
										key={template.id}
										type="button"
										className={cn(
											"rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
											form.templateId === template.id &&
												"border-primary/50 bg-primary/5",
										)}
										onClick={() => applyTemplate(template)}
									>
										<span className="block font-medium">
											{tList(template.nameKey)}
										</span>
										<span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
											{tList(template.descriptionKey)}
										</span>
									</button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-name">{t("name")}</Label>
							<Input
								id="agent-name"
								name="agent-name"
								autoComplete="off"
								placeholder={t("namePlaceholder")}
								value={form.name}
								onChange={(e) =>
									setForm({
										...form,
										name: e.target.value,
										slug: slugifyAgentName(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
							<Textarea
								id="agent-description"
								name="agent-description"
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
									<Label htmlFor="agent-slug">{tList("slug")}</Label>
									<Input
										id="agent-slug"
										name="agent-slug"
										autoComplete="off"
										placeholder={tList("slugPlaceholder")}
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
									<Label htmlFor="agent-sharing">{tList("access")}</Label>
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
											<SelectItem value="personal">
												{t("configurePage.sharingPersonal")}
											</SelectItem>
											<SelectItem value="marketplace">
												{t("configurePage.sharingWorkspace")}
											</SelectItem>
											<SelectItem value="specific_user">
												{t("configurePage.sharingUser")}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{form.sharingMode === "specific_user" ? (
									<div className="flex flex-col gap-2">
										<Label htmlFor="agent-share-email">
											{tList("userEmail")}
										</Label>
										<Input
											id="agent-share-email"
											name="agent-share-email"
											type="email"
											autoComplete="email"
											spellCheck={false}
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
												<label htmlFor="agent-global">{tList("global")}</label>
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
												<label htmlFor="agent-recommended">
													{t("configurePage.recommended")}
												</label>
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
													<SelectItem value="none">
														{tList("curationNone")}
													</SelectItem>
													<SelectItem value="recommended">
														{tList("badgeRecommended")}
													</SelectItem>
													<SelectItem value="organization_created">
														{tList("curationOrgCreated")}
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
								) : null}
							</div>
						</AdvancedSection>
						<div className="rounded-xl border bg-muted/30 p-3 text-sm">
							<p className="font-medium">{tList("createNextTitle")}</p>
							<p className="mt-1 text-muted-foreground">
								{tList("createNextDescription")}
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCreateDialog(false)}
						>
							{tCommon("cancel")}
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
									{tList("creating")}
								</>
							) : (
								tList("createAndConfigure")
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
						<AlertDialogTitle>{tList("deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{tList("deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>
							{tCommon("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={() => void handleDelete()}
						>
							{deleting ? tList("deleting") : t("configurePage.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ResourceShareDialog
				resource={shareResource}
				workspaceId={workspaceId}
				open={shareResource !== null}
				onCloseAction={() => setShareResource(null)}
			/>
		</WorkspacePage>
	);
}
