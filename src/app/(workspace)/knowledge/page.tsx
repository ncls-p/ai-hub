"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";
import { BookOpenIcon, Loader2, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { PageLoading } from "@/components/page-loading";
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
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";

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
	const [editingBase, setEditingBase] = useState<KnowledgeBase | null>(null);
	const [editBaseForm, setEditBaseForm] = useState({ name: "", description: "" });

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
			kicker="Configuration"
			title="Knowledge bases"
			description="Encrypted chunks, workspace isolation, and citation-ready retrieval."
			width="wide"
		>
			<div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
			<section className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>Create base</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<Label>Name</Label>
						<Input
							value={baseForm.name}
							onChange={(e) =>
								setBaseForm({ ...baseForm, name: e.target.value })
							}
						/>
						<Label>Description</Label>
						<Input
							value={baseForm.description}
							onChange={(e) =>
								setBaseForm({ ...baseForm, description: e.target.value })
							}
						/>
						<Button onClick={() => void createBase()}>
							<PlusIcon data-icon="inline-start" />
							Create
						</Button>
					</CardContent>
				</Card>
				{loading ? (
					<Loader2 className="animate-spin" />
				) : (
					bases.map((base) => (
						<div
							key={base.id}
							className={`rounded-xl border p-3 text-left text-sm ${selectedId === base.id ? "border-primary bg-primary/5" : "border-border"}`}
						>
							<button
								type="button"
								onClick={() => setSelectedId(base.id)}
								className="w-full text-left"
							>
								<span className="font-medium">{base.name}</span>
								{base.description ? (
									<p className="text-muted-foreground">{base.description}</p>
								) : null}
							</button>
							<div className="mt-2 flex gap-1">
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									onClick={() => {
										setEditingBase(base);
										setEditBaseForm({
											name: base.name,
											description: base.description ?? "",
										});
									}}
								>
									<PencilIcon className="size-4" />
								</Button>
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									onClick={() => void deleteBase(base.id)}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						</div>
					))
				)}
			</section>
			<section className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BookOpenIcon className="size-5" />
							Documents
						</CardTitle>
						<CardDescription>
							Paste text to index. Processing documents refresh automatically.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div
							className={`rounded-xl border border-dashed p-6 text-center text-sm transition-colors ${
								dragActive
									? "border-primary bg-primary/5"
									: "border-border text-muted-foreground"
							}`}
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
							placeholder="Document title"
							value={docForm.title}
							onChange={(e) =>
								setDocForm({ ...docForm, title: e.target.value })
							}
						/>
						<Textarea
							className="min-h-40"
							placeholder="Document content"
							value={docForm.content}
							onChange={(e) =>
								setDocForm({ ...docForm, content: e.target.value })
							}
						/>
						<Button onClick={() => void ingestDocument()} disabled={!selectedId}>
							Ingest document
						</Button>
					</CardContent>
				</Card>
				<div className="grid gap-2">
					{documents.map((doc) => (
						<Card key={doc.id}>
							<CardContent className="flex items-center justify-between gap-2 p-4">
								<span className="font-medium">{doc.title}</span>
								<div className="flex items-center gap-2">
									<Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										onClick={() => void deleteDocument(doc.id)}
									>
										<Trash2Icon className="size-4" />
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
						<div className="flex gap-2">
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search indexed text"
							/>
							<Button onClick={() => void search()}>
								<SearchIcon data-icon="inline-start" />
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
			</section>
			<Dialog open={Boolean(editingBase)} onOpenChange={() => setEditingBase(null)}>
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
