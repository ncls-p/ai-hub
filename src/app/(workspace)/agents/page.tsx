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

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Agent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	activeVersionId: string | null;
	createdAt: string;
	updatedAt: string;
}

function getBrowserWorkspaceId() {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem("active_workspace_id");
}

function useWorkspaceId() {
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);

	useEffect(() => {
		if (workspaceId) return;
		fetch("/api/workspaces")
			.then((res) => res.json())
			.then((data) => {
				if (Array.isArray(data) && data.length > 0) {
					const wsId = data[0].workspace?.id || data[0].id;
					if (wsId) {
						setWorkspaceId(wsId);
						window.sessionStorage.setItem("active_workspace_id", wsId);
					}
				}
			})
			.catch(() => {});
	}, [workspaceId]);

	return workspaceId;
}

async function fetchAgents(
	workspaceId: string,
	signal?: AbortSignal,
): Promise<Agent[]> {
	const res = await fetch(`/api/workspace/agents?workspaceId=${workspaceId}`, {
		signal,
	});
	if (!res.ok) throw new Error("Failed to fetch agents");
	return res.json();
}

export default function AgentsPage() {
	const router = useRouter();
	const workspaceId = useWorkspaceId();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({ name: "", slug: "", description: "" });
	const abortRef = useRef<AbortController | null>(null);

	const refreshAgents = async () => {
		if (!workspaceId) return;
		abortRef.current?.abort();
		abortRef.current = new AbortController();
		try {
			const data = await fetchAgents(workspaceId, abortRef.current.signal);
			setAgents(data);
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
				const data = await fetchAgents(currentWorkspaceId, controller.signal);
				if (!cancelled) setAgents(data);
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
		if (!workspaceId || !form.name.trim() || !form.slug.trim()) return;
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: form.name.trim(),
					slug: form.slug
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9-]/g, "-"),
					description: form.description.trim() || undefined,
					workspaceId,
				}),
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to create agent");
			}

			toast.success("Agent created");
			setShowCreateDialog(false);
			setForm({ name: "", slug: "", description: "" });
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create agent",
			);
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async (agentId: string) => {
		if (!workspaceId) return;
		if (!confirm("Are you sure you want to delete this agent?")) return;
		try {
			const res = await fetch(
				`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
				{
					method: "DELETE",
				},
			);

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete agent");
			}

			toast.success("Agent deleted");
			await refreshAgents();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete agent",
			);
		}
	};

	if (!workspaceId) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Agents</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Versioned agent workspace
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Design assistants with model settings, tools, knowledge, and
						deployment-safe configuration versions.
					</p>
				</div>
				<Button type="button" onClick={() => setShowCreateDialog(true)}>
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New agent
				</Button>
			</div>

			{showCreateDialog && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<Card className="w-full max-w-md mx-4">
						<CardHeader>
							<CardTitle>Create new agent</CardTitle>
							<CardDescription>
								Give your agent a name and optional description.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
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
										})
									}
									autoFocus
								/>
							</div>
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
								<Label htmlFor="agent-description">
									Description (optional)
								</Label>
								<Input
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
							<div className="flex justify-end gap-2 pt-2">
								<Button
									variant="outline"
									onClick={() => setShowCreateDialog(false)}
								>
									Cancel
								</Button>
								<Button
									onClick={handleCreate}
									disabled={creating || !form.name.trim() || !form.slug.trim()}
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
							</div>
						</CardContent>
					</Card>
				</div>
			)}

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
										onClick={() => handleDelete(agent.id)}
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
							</CardHeader>
							<CardContent>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{agent.activeVersionId
											? "Has active version"
											: "No version configured"}
									</span>
									<span>{new Date(agent.updatedAt).toLocaleDateString()}</span>
								</div>
								<div className="mt-3 flex gap-2">
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => router.push(`/chat?agentId=${agent.id}`)}
									>
										Chat
										<ChevronRightIcon className="size-3 ml-1" />
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
		</div>
	);
}
