"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
	BookOpenIcon,
	Loader2,
	PencilIcon,
	PlusIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { ListRow } from "@/components/list-row";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { SectionHeader } from "@/components/section-header";
import { ModelLogo } from "@/components/providers/model-logo";
import { WorkspacePage } from "@/components/workspace-page";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface KnowledgeBase {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
}
interface DocumentRow {
	id: string;
	title: string;
	status: string;
	createdAt: string;
}
interface SearchResult {
	chunkId: string;
	documentTitle: string;
	content: string;
	score: number;
}
interface KnowledgeAgent {
	id: string;
	name: string;
	description: string | null;
	activeVersionId: string | null;
	logoUrl?: string | null;
	modelDisplayName?: string | null;
	canEdit?: boolean;
}

function statusVariant(status: string) {
	if (status === "ready") return "secondary" as const;
	if (status === "processing") return "outline" as const;
	return "destructive" as const;
}

function statusLabel(status: string, t: (key: string) => string) {
	if (status === "ready") return t("statusReady");
	if (status === "processing") return t("statusProcessing");
	return t("statusFailed");
}

export default function KnowledgePage() {
	const t = useTranslations("knowledge");
	const tCommon = useTranslations("common");
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [bases, setBases] = useState<KnowledgeBase[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [documents, setDocuments] = useState<DocumentRow[]>([]);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(true);
	const [baseForm, setBaseForm] = useState({ name: "", description: "" });
	const [docForm, setDocForm] = useState({ title: "", content: "" });
	const [query, setQuery] = useState("");
	const [dragActive, setDragActive] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [editingBase, setEditingBase] = useState<KnowledgeBase | null>(null);
	const [editBaseForm, setEditBaseForm] = useState({
		name: "",
		description: "",
	});
	const [attachOpen, setAttachOpen] = useState(false);
	const [attachAgents, setAttachAgents] = useState<KnowledgeAgent[]>([]);
	const [loadingAttachAgents, setLoadingAttachAgents] = useState(false);
	const [attachingAgentId, setAttachingAgentId] = useState<string | null>(null);
	const [canManageKnowledgeBases, setCanManageKnowledgeBases] = useState(false);

	const loadBases = useCallback(async () => {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error("Failed to load knowledge bases");
		const data = (await res.json()) as KnowledgeBase[];
		setBases(data);
		setSelectedId((current) =>
			current && data.some((base) => base.id === current)
				? current
				: (data[0]?.id ?? null),
		);
	}, [workspaceId]);

	const loadDocuments = useCallback(async () => {
		if (!workspaceId || !selectedId) {
			setDocuments([]);
			return;
		}
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error("Failed to load documents");
		setDocuments(await res.json());
	}, [workspaceId, selectedId]);

	async function openAttachDialog() {
		if (!canManageKnowledgeBases || !workspaceId || !selectedId) return;
		setAttachOpen(true);
		setLoadingAttachAgents(true);
		try {
			const res = await fetch(
				`/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
			);
			if (!res.ok) throw new Error(t("errorLoadAgents"));
			const data = (await res.json()) as
				| { agents?: KnowledgeAgent[] }
				| KnowledgeAgent[];
			setAttachAgents(Array.isArray(data) ? data : (data.agents ?? []));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("errorLoadAgents"),
			);
		} finally {
			setLoadingAttachAgents(false);
		}
	}

	async function attachBaseToAgent(agentId: string) {
		if (!canManageKnowledgeBases || !workspaceId || !selectedId) return;
		setAttachingAgentId(agentId);
		try {
			const bindingsRes = await fetch(
				`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
			);
			const currentBindings = bindingsRes.ok
				? ((
						(await bindingsRes.json()) as {
							bindings?: Array<{ knowledgeBaseId: string }>;
						}
					).bindings ?? [])
				: [];
			const knowledgeBaseIds = Array.from(
				new Set([
					...currentBindings.map((binding) => binding.knowledgeBaseId),
					selectedId,
				]),
			);
			const res = await fetch(`/api/workspace/agents/${agentId}/knowledge`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, knowledgeBaseIds }),
			});
			if (!res.ok) throw new Error(t("errorAttachAgent"));
			toast.success(t("toastAttachedAgent"));
			setAttachOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("errorAttachAgent"),
			);
		} finally {
			setAttachingAgentId(null);
		}
	}

	async function ingestFromContent(title: string, content: string) {
		if (
			!canManageKnowledgeBases ||
			!workspaceId ||
			!selectedId ||
			!title.trim() ||
			!content.trim()
		)
			return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					title: title.trim(),
					content,
				}),
			},
		);
		if (!res.ok) return toast.error(t("errorIngest"));
		setDocForm({ title: "", content: "" });
		await loadDocuments();
		toast.success(t("toastDocumentQueued"));
	}

	function handleFileDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragActive(false);
		const file = event.dataTransfer.files[0];
		if (!canManageKnowledgeBases || !file) return;
		void file.text().then((content) => {
			void ingestFromContent(file.name, content);
		});
	}

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
				const permissions = await fetchWorkspacePermissions(workspaceId!);
				if (!cancelled) {
					setCanManageKnowledgeBases(permissions.canManageKnowledgeBases);
				}
				await loadBases();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error ? error.message : "Failed to load",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadBases, workspaceId]);

	useEffect(() => {
		if (!workspaceId || !selectedId) return;
		let cancelled = false;
		async function run() {
			try {
				await loadDocuments();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error ? error.message : "Failed to load documents",
					);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [loadDocuments, selectedId, workspaceId]);

	useEffect(() => {
		if (!workspaceId || !selectedId) return;
		const hasProcessing = documents.some((doc) => doc.status === "processing");
		if (!hasProcessing) return;

		const interval = window.setInterval(() => {
			void loadDocuments().catch(() => {});
		}, 3_000);

		return () => window.clearInterval(interval);
	}, [documents, loadDocuments, selectedId, workspaceId]);

	async function createBase() {
		if (!canManageKnowledgeBases || !workspaceId || !baseForm.name.trim())
			return;
		const res = await fetch("/api/workspace/knowledge-bases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				workspaceId,
				name: baseForm.name.trim(),
				description: baseForm.description.trim() || undefined,
			}),
		});
		if (!res.ok) return toast.error(t("errorCreate"));
		const created = (await res.json()) as KnowledgeBase;
		setBaseForm({ name: "", description: "" });
		setShowCreateDialog(false);
		setSelectedId(created.id);
		await loadBases();
		toast.success(t("toastBaseCreated"));
	}

	async function ingestDocument() {
		await ingestFromContent(docForm.title, docForm.content);
	}

	async function search() {
		if (!workspaceId || !selectedId || !query.trim()) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/search`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, query }),
			},
		);
		if (!res.ok) return toast.error(t("errorSearch"));
		setResults(await res.json());
	}

	async function updateBase() {
		if (!canManageKnowledgeBases || !workspaceId || !editingBase) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${editingBase.id}`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: editBaseForm.name.trim(),
					description: editBaseForm.description.trim() || undefined,
				}),
			},
		);
		if (!res.ok) return toast.error(t("errorUpdate"));
		setEditingBase(null);
		await loadBases();
		toast.success(t("toastBaseUpdated"));
	}

	async function deleteBase(baseId: string) {
		if (!canManageKnowledgeBases || !workspaceId) return;
		if (!window.confirm(t("confirmDeleteBase"))) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${baseId}?workspaceId=${workspaceId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) return toast.error(t("errorDeleteBase"));
		await loadBases();
		toast.success(t("toastBaseRemoved"));
	}

	async function deleteDocument(documentId: string) {
		if (!canManageKnowledgeBases || !workspaceId || !selectedId) return;
		if (!window.confirm(t("confirmDeleteDocument"))) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) return toast.error(t("errorDeleteDocument"));
		await loadDocuments();
		toast.success(t("toastDocumentRemoved"));
	}

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label={tCommon("loading")} />;
	}

	const selectedBase = bases.find((base) => base.id === selectedId) ?? null;

	return (
		<WorkspacePage
			title={t("title")}
			description={t("description")}
			width="wide"
		>
			<Dialog
				open={canManageKnowledgeBases && showCreateDialog}
				onOpenChange={setShowCreateDialog}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("createBaseTitle")}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<Label htmlFor="knowledge-name">{t("name")}</Label>
						<Input
							id="knowledge-name"
							name="knowledge-name"
							autoComplete="off"
							value={baseForm.name}
							onChange={(e) =>
								setBaseForm({ ...baseForm, name: e.target.value })
							}
						/>
						<Label htmlFor="knowledge-description">
							{t("descriptionLabel")}
						</Label>
						<Input
							id="knowledge-description"
							name="knowledge-description"
							autoComplete="off"
							value={baseForm.description}
							onChange={(e) =>
								setBaseForm({ ...baseForm, description: e.target.value })
							}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCreateDialog(false)}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							onClick={() => void createBase()}
							disabled={!baseForm.name.trim()}
						>
							{tCommon("create")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<section className="mb-6 rounded-2xl border bg-card p-5">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="max-w-2xl">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("guideEyebrow")}
						</p>
						<h2 className="mt-2 text-xl font-semibold tracking-tight">
							{t("guideTitle")}
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{t("guideDescription")}
						</p>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
						<div className="grid grid-cols-2 gap-2 text-sm">
							<div className="rounded-xl border bg-background px-3 py-2">
								<p className="font-medium">{bases.length}</p>
								<p className="text-xs text-muted-foreground">
									{t("basesCount", { count: bases.length })}
								</p>
							</div>
							<div className="rounded-xl border bg-background px-3 py-2">
								<p className="font-medium">{documents.length}</p>
								<p className="text-xs text-muted-foreground">
									{t("selectedDocumentsCount", { count: documents.length })}
								</p>
							</div>
						</div>
						{canManageKnowledgeBases ? (
							<Button
								type="button"
								size="sm"
								onClick={() => setShowCreateDialog(true)}
							>
								<PlusIcon data-icon="inline-start" />
								{t("newBase")}
							</Button>
						) : null}
					</div>
				</div>
				<ol className="mt-5 grid gap-2 sm:grid-cols-3">
					{[
						t("guideStepCreate"),
						t("guideStepDocuments"),
						t("guideStepAttach"),
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

			<div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
				<section className="flex flex-col gap-4">
					<SectionHeader
						title={t("basesTitle")}
						description={t("basesDescription")}
					/>
					{loading ? (
						<Loader2 className="animate-spin" />
					) : bases.length === 0 ? (
						<PageEmptyState
							icon={BookOpenIcon}
							title={t("emptyTitle")}
							description={t("emptyBasesDescription")}
						>
							{canManageKnowledgeBases ? (
								<Button
									type="button"
									size="sm"
									onClick={() => setShowCreateDialog(true)}
								>
									<PlusIcon data-icon="inline-start" />
									{t("createBaseCta")}
								</Button>
							) : null}
						</PageEmptyState>
					) : (
						<div className="flex flex-col gap-2">
							{bases.map((base) => (
								<ListRow
									key={base.id}
									selected={selectedId === base.id}
									className="group items-start gap-2"
								>
									<button
										type="button"
										onClick={() => setSelectedId(base.id)}
										className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-sm shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									>
										<span className="block truncate font-medium">
											{base.name}
										</span>
										{base.description ? (
											<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
												{base.description}
											</p>
										) : null}
									</button>
									{canManageKnowledgeBases ? (
										<div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
											<Button
												type="button"
												size="icon-sm"
												variant="ghost"
												aria-label={t("editAria", { name: base.name })}
												onClick={() => {
													setEditingBase(base);
													setEditBaseForm({
														name: base.name,
														description: base.description ?? "",
													});
												}}
											>
												<PencilIcon aria-hidden="true" />
											</Button>
											<Button
												type="button"
												size="icon-sm"
												variant="ghost"
												aria-label={t("deleteAria", { name: base.name })}
												onClick={() => void deleteBase(base.id)}
											>
												<Trash2Icon aria-hidden="true" />
											</Button>
										</div>
									) : null}
								</ListRow>
							))}
						</div>
					)}
				</section>
				<section className="flex flex-col gap-4">
					{!selectedId ? (
						<PageEmptyState
							icon={BookOpenIcon}
							title={t("selectBaseTitle")}
							description={t("selectBaseDescription")}
						/>
					) : (
						<>
							<div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<p className="truncate text-base font-semibold">
										{selectedBase?.name ?? t("documents")}
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{selectedBase?.description || t("documentsHint")}
									</p>
								</div>
								{canManageKnowledgeBases ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void openAttachDialog()}
									>
										{t("attachAssistant")}
									</Button>
								) : null}
							</div>

							{canManageKnowledgeBases ? (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<BookOpenIcon className="size-5" aria-hidden="true" />
											{t("documents")}
										</CardTitle>
										<CardDescription>{t("documentsHint")}</CardDescription>
									</CardHeader>
									<CardContent className="grid gap-3">
										<div
											className={cn(
												"rounded-xl border border-dashed p-6 text-center text-sm transition-colors",
												dragActive
													? "border-primary bg-primary/5"
													: "border-border text-muted-foreground",
											)}
											onDragOver={(event) => {
												event.preventDefault();
												setDragActive(true);
											}}
											onDragLeave={() => setDragActive(false)}
											onDrop={handleFileDrop}
										>
											{t("dropHint")}
										</div>
										<Input
											aria-label={t("documentTitle")}
											name="document-title"
											autoComplete="off"
											placeholder={t("documentTitlePlaceholder")}
											value={docForm.title}
											onChange={(e) =>
												setDocForm({ ...docForm, title: e.target.value })
											}
										/>
										<Textarea
											aria-label={t("documentContent")}
											name="document-content"
											autoComplete="off"
											className="min-h-40"
											placeholder={t("documentContentPlaceholder")}
											value={docForm.content}
											onChange={(e) =>
												setDocForm({ ...docForm, content: e.target.value })
											}
										/>
									</CardContent>
									<CardFooter className="justify-end">
										<Button
											onClick={() => void ingestDocument()}
											disabled={!selectedId}
										>
											{t("ingestDocument")}
										</Button>
									</CardFooter>
								</Card>
							) : null}
							<div className="grid gap-2">
								{documents.map((doc) => (
									<Card key={doc.id} size="sm">
										<CardContent className="flex items-center justify-between gap-2 p-4">
											<span className="min-w-0 truncate font-medium">
												{doc.title}
											</span>
											<div className="flex shrink-0 items-center gap-2">
												<Badge variant={statusVariant(doc.status)}>
													{statusLabel(doc.status, t)}
												</Badge>
												{canManageKnowledgeBases ? (
													<Button
														type="button"
														size="icon-sm"
														variant="ghost"
														aria-label={t("deleteAria", { name: doc.title })}
														onClick={() => void deleteDocument(doc.id)}
													>
														<Trash2Icon aria-hidden="true" />
													</Button>
												) : null}
											</div>
										</CardContent>
									</Card>
								))}
							</div>
							<AdvancedSection
								label={t("optionalSearch")}
								hint={t("optionalSearchHint")}
								storageKey="advanced:knowledge-search"
							>
								<div className="grid gap-3">
									<div className="flex flex-col gap-2 sm:flex-row">
										<Input
											aria-label={t("searchAriaLabel")}
											name="knowledge-search"
											autoComplete="off"
											value={query}
											onChange={(e) => setQuery(e.target.value)}
											placeholder={t("searchPlaceholder")}
										/>
										<Button onClick={() => void search()}>
											<SearchIcon data-icon="inline-start" aria-hidden="true" />
											{t("search")}
										</Button>
									</div>
									{results.map((result) => (
										<div
											key={result.chunkId}
											className="rounded-xl border p-3 text-sm"
										>
											<p className="font-medium">{result.documentTitle}</p>
											<p className="mt-1 line-clamp-4 text-muted-foreground">
												{result.content}
											</p>
										</div>
									))}
								</div>
							</AdvancedSection>
						</>
					)}
				</section>
				<Dialog
					open={canManageKnowledgeBases && Boolean(editingBase)}
					onOpenChange={() => setEditingBase(null)}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t("editBaseTitle")}</DialogTitle>
						</DialogHeader>
						<div className="grid gap-3">
							<Label htmlFor="edit-knowledge-name">{t("name")}</Label>
							<Input
								id="edit-knowledge-name"
								name="edit-knowledge-name"
								autoComplete="off"
								value={editBaseForm.name}
								onChange={(e) =>
									setEditBaseForm({ ...editBaseForm, name: e.target.value })
								}
							/>
							<Label htmlFor="edit-knowledge-description">
								{t("descriptionLabel")}
							</Label>
							<Input
								id="edit-knowledge-description"
								name="edit-knowledge-description"
								autoComplete="off"
								value={editBaseForm.description}
								onChange={(e) =>
									setEditBaseForm({
										...editBaseForm,
										description: e.target.value,
									})
								}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setEditingBase(null)}>
								{tCommon("cancel")}
							</Button>
							<Button onClick={() => void updateBase()}>
								{tCommon("save")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<Dialog
					open={canManageKnowledgeBases && attachOpen}
					onOpenChange={setAttachOpen}
				>
					<DialogContent className="max-h-[85vh] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>{t("attachDialogTitle")}</DialogTitle>
						</DialogHeader>
						<div className="grid gap-2">
							{loadingAttachAgents ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="size-5 animate-spin text-muted-foreground" />
								</div>
							) : attachAgents.length === 0 ? (
								<p className="py-6 text-center text-sm text-muted-foreground">
									{t("noAttachAgents")}
								</p>
							) : (
								attachAgents.map((agent) => {
									const canAttach = Boolean(
										agent.canEdit && agent.activeVersionId,
									);
									return (
										<button
											key={agent.id}
											type="button"
											disabled={!canAttach || attachingAgentId !== null}
											className="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
											onClick={() => void attachBaseToAgent(agent.id)}
										>
											<ModelLogo
												logoUrl={agent.logoUrl}
												label={agent.name}
												size="md"
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium">
													{agent.name}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{agent.modelDisplayName || t("agentNeedsModel")}
												</span>
											</span>
											{attachingAgentId === agent.id ? (
												<Loader2
													className="size-4 animate-spin"
													aria-hidden="true"
												/>
											) : null}
										</button>
									);
								})
							)}
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setAttachOpen(false)}>
								{tCommon("cancel")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</WorkspacePage>
	);
}
