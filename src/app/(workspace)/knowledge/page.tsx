"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
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
import { WorkspacePage } from "@/components/workspace-page";
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

function statusVariant(status: string) {
	if (status === "ready") return "secondary" as const;
	if (status === "processing") return "outline" as const;
	return "destructive" as const;
}

export default function KnowledgePage() {
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

	async function ingestFromContent(title: string, content: string) {
		if (!workspaceId || !selectedId || !title.trim() || !content.trim()) return;
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
		if (!res.ok) return toast.error("Failed to ingest document");
		setDocForm({ title: "", content: "" });
		await loadDocuments();
		toast.success("Document queued for indexing");
	}

	function handleFileDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragActive(false);
		const file = event.dataTransfer.files[0];
		if (!file) return;
		void file.text().then((content) => {
			void ingestFromContent(file.name, content);
		});
	}

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		async function run() {
			try {
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
		if (!workspaceId || !baseForm.name.trim()) return;
		const res = await fetch("/api/workspace/knowledge-bases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				workspaceId,
				name: baseForm.name.trim(),
				description: baseForm.description.trim() || undefined,
			}),
		});
		if (!res.ok) return toast.error("Failed to create knowledge base");
		setBaseForm({ name: "", description: "" });
		setShowCreateDialog(false);
		await loadBases();
		toast.success("Knowledge base created");
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
		if (!res.ok) return toast.error("Search failed");
		setResults(await res.json());
	}

	async function updateBase() {
		if (!workspaceId || !editingBase) return;
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
		if (!res.ok) return toast.error("Failed to update knowledge base");
		setEditingBase(null);
		await loadBases();
		toast.success("Knowledge base updated");
	}

	async function deleteBase(baseId: string) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${baseId}?workspaceId=${workspaceId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) return toast.error("Failed to remove knowledge base");
		await loadBases();
		toast.success("Knowledge base removed");
	}

	async function deleteDocument(documentId: string) {
		if (!workspaceId || !selectedId) return;
		const res = await fetch(
			`/api/workspace/knowledge-bases/${selectedId}/documents/${documentId}?workspaceId=${workspaceId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) return toast.error("Failed to remove document");
		await loadDocuments();
		toast.success("Document removed");
	}

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			title="Knowledge"
			description="Upload documents and attach them to assistants so they can reference your data."
			width="wide"
			actions={
				<Button type="button" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon data-icon="inline-start" />
					New knowledge base
				</Button>
			}
		>
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create knowledge base</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<Label htmlFor="knowledge-name">Name</Label>
						<Input
							id="knowledge-name"
							value={baseForm.name}
							onChange={(e) =>
								setBaseForm({ ...baseForm, name: e.target.value })
							}
						/>
						<Label htmlFor="knowledge-description">Description</Label>
						<Input
							id="knowledge-description"
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
							Cancel
						</Button>
						<Button
							onClick={() => void createBase()}
							disabled={!baseForm.name.trim()}
						>
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
				<section className="flex flex-col gap-4">
					<SectionHeader
						title="Bases"
						description="Choose the source set to manage."
					/>
					{loading ? (
						<Loader2 className="animate-spin" />
					) : bases.length === 0 ? (
						<PageEmptyState
							icon={BookOpenIcon}
							title="No knowledge bases yet"
							description="Create a base to upload documents for your assistants."
						>
							<Button
								type="button"
								size="sm"
								onClick={() => setShowCreateDialog(true)}
							>
								<PlusIcon data-icon="inline-start" />
								Create base
							</Button>
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
									<div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label={`Edit ${base.name}`}
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
											aria-label={`Delete ${base.name}`}
											onClick={() => void deleteBase(base.id)}
										>
											<Trash2Icon aria-hidden="true" />
										</Button>
									</div>
								</ListRow>
							))}
						</div>
					)}
				</section>
				<section className="flex flex-col gap-4">
					{!selectedId ? (
						<PageEmptyState
							icon={BookOpenIcon}
							title="Select a knowledge base"
							description="Choose or create a base on the left to manage documents."
						/>
					) : (
						<>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<BookOpenIcon className="size-5" aria-hidden="true" />
										Documents
									</CardTitle>
									<CardDescription>
										Paste text to index. Processing documents refresh
										automatically.
									</CardDescription>
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
										Drag and drop a text file here to ingest
									</div>
									<Input
										aria-label="Document title"
										name="document-title"
										autoComplete="off"
										placeholder="Document title…"
										value={docForm.title}
										onChange={(e) =>
											setDocForm({ ...docForm, title: e.target.value })
										}
									/>
									<Textarea
										aria-label="Document content"
										name="document-content"
										autoComplete="off"
										className="min-h-40"
										placeholder="Document content…"
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
										Ingest Document
									</Button>
								</CardFooter>
							</Card>
							<div className="grid gap-2">
								{documents.map((doc) => (
									<Card key={doc.id} size="sm">
										<CardContent className="flex items-center justify-between gap-2 p-4">
											<span className="min-w-0 truncate font-medium">
												{doc.title}
											</span>
											<div className="flex shrink-0 items-center gap-2">
												<Badge variant={statusVariant(doc.status)}>
													{doc.status}
												</Badge>
												<Button
													type="button"
													size="icon-sm"
													variant="ghost"
													aria-label={`Delete ${doc.title}`}
													onClick={() => void deleteDocument(doc.id)}
												>
													<Trash2Icon aria-hidden="true" />
												</Button>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
							<Card>
								<CardHeader>
									<CardTitle>Search</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-3">
									<div className="flex flex-col gap-2 sm:flex-row">
										<Input
											aria-label="Search indexed text"
											name="knowledge-search"
											autoComplete="off"
											value={query}
											onChange={(e) => setQuery(e.target.value)}
											placeholder="Search indexed text…"
										/>
										<Button onClick={() => void search()}>
											<SearchIcon data-icon="inline-start" aria-hidden="true" />
											Search
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
								</CardContent>
							</Card>
						</>
					)}
				</section>
				<Dialog
					open={Boolean(editingBase)}
					onOpenChange={() => setEditingBase(null)}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Edit knowledge base</DialogTitle>
						</DialogHeader>
						<div className="grid gap-3">
							<Label>Name</Label>
							<Input
								value={editBaseForm.name}
								onChange={(e) =>
									setEditBaseForm({ ...editBaseForm, name: e.target.value })
								}
							/>
							<Label>Description</Label>
							<Input
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
								Cancel
							</Button>
							<Button onClick={() => void updateBase()}>Save</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</WorkspacePage>
	);
}
