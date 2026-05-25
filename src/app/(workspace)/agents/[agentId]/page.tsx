"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, BotIcon, Loader2, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

interface Agent {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	activeVersionId: string | null;
	updatedAt: string;
}

interface AgentVersion {
	id: string;
	versionNumber: number;
	name: string | null;
	systemPrompt: string | null;
	providerId: string | null;
	modelId: string | null;
	temperature: string | null;
	topP: string | null;
	maxOutputTokens: number | null;
	createdAt: string;
	isActive: boolean;
}

interface Provider {
	id: string;
	name: string;
	kind: string;
	enabled: boolean;
	healthStatus: string | null;
}

interface Model {
	id: string;
	modelId: string;
	displayName: string | null;
	enabled: boolean;
}

interface BuiltInTool {
	id: string;
	name: string;
	displayName: string;
	description: string;
	riskLevel: string;
	requiresApprovalByDefault: boolean;
}

interface ToolBinding {
	toolId: string;
	requireApproval: boolean;
}

function getBrowserWorkspaceId() {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem("active_workspace_id");
}

export default function AgentBuilderPage() {
	const router = useRouter();
	const params = useParams<{ agentId: string }>();
	const agentId = params.agentId;
	const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
		getBrowserWorkspaceId(),
	);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [versions, setVersions] = useState<AgentVersion[]>([]);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [models, setModels] = useState<Model[]>([]);
	const [availableTools, setAvailableTools] = useState<BuiltInTool[]>([]);
	const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		name: "",
		slug: "",
		description: "",
		systemPrompt: "",
		providerId: "",
		modelId: "",
		temperature: "0.7",
		topP: "",
		maxOutputTokens: "1024",
	});

	const activeVersion = useMemo(
		() => versions.find((version) => version.isActive) ?? versions[0] ?? null,
		[versions],
	);

	useEffect(() => {
		if (workspaceId) return;
		let cancelled = false;

		async function loadWorkspace() {
			try {
				const res = await fetch("/api/workspaces");
				const data = await res.json();
				if (cancelled || !Array.isArray(data) || data.length === 0) return;

				const id = data[0].workspace?.id || data[0].id;
				if (id) {
					setWorkspaceId(id);
					window.sessionStorage.setItem("active_workspace_id", id);
				}
			} catch {
				toast.error("Unable to load workspace");
			}
		}

		void loadWorkspace();
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId || !agentId) return;
		let cancelled = false;
		const controller = new AbortController();

		async function loadAgentBuilder() {
			try {
				const [agentRes, versionRes, providerRes, toolRes] = await Promise.all([
					fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`, {
						signal: controller.signal,
					}),
					fetch(
						`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
						{
							signal: controller.signal,
						},
					),
					fetch(`/api/workspace/providers?workspaceId=${workspaceId}`, {
						signal: controller.signal,
					}),
					fetch(`/api/workspace/tools?workspaceId=${workspaceId}`, {
						signal: controller.signal,
					}),
				]);

				if (!agentRes.ok) throw new Error("Failed to load agent");
				if (!versionRes.ok) throw new Error("Failed to load versions");
				if (!providerRes.ok) throw new Error("Failed to load providers");
				if (!toolRes.ok) throw new Error("Failed to load tools");

				const loadedAgent = (await agentRes.json()) as Agent;
				const loadedVersions = (await versionRes.json()) as AgentVersion[];
				const loadedProviders = (await providerRes.json()) as Provider[];
				const loadedTools = (await toolRes.json()) as BuiltInTool[];
				const loadedActiveVersion =
					loadedVersions.find((version) => version.isActive) ??
					loadedVersions[0] ??
					null;

				let loadedBindings: ToolBinding[] = [];
				if (loadedActiveVersion) {
					const bindingRes = await fetch(
						`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}&versionId=${loadedActiveVersion.id}`,
						{ signal: controller.signal },
					);
					if (bindingRes.ok)
						loadedBindings = (await bindingRes.json()) as ToolBinding[];
				}

				if (cancelled) return;
				setAgent(loadedAgent);
				setVersions(loadedVersions);
				setProviders(loadedProviders);
				setAvailableTools(loadedTools);
				setSelectedToolIds(loadedBindings.map((binding) => binding.toolId));
				setForm({
					name: loadedAgent.name,
					slug: loadedAgent.slug,
					description: loadedAgent.description ?? "",
					systemPrompt: loadedActiveVersion?.systemPrompt ?? "",
					providerId: loadedActiveVersion?.providerId ?? "",
					modelId: loadedActiveVersion?.modelId ?? "",
					temperature: loadedActiveVersion?.temperature ?? "0.7",
					topP: loadedActiveVersion?.topP ?? "",
					maxOutputTokens:
						loadedActiveVersion?.maxOutputTokens?.toString() ?? "1024",
				});
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void loadAgentBuilder();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [agentId, workspaceId]);

	useEffect(() => {
		if (!workspaceId || !form.providerId) {
			return;
		}
		let cancelled = false;
		const controller = new AbortController();

		async function loadModels() {
			try {
				const res = await fetch(
					`/api/workspace/providers/${form.providerId}/models?workspaceId=${workspaceId}`,
					{ signal: controller.signal },
				);
				if (!res.ok) throw new Error("Failed to load models");
				const data = (await res.json()) as Model[];
				if (!cancelled) setModels(data.filter((model) => model.enabled));
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					toast.error(err.message);
				}
			}
		}

		void loadModels();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [form.providerId, workspaceId]);

	async function handleSave() {
		if (!workspaceId || !agent) return;
		setSaving(true);
		try {
			const res = await fetch(`/api/workspace/agents/${agent.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name.trim(),
					slug: form.slug
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9-]/g, "-"),
					description: form.description.trim(),
					systemPrompt: form.systemPrompt,
					providerId: form.providerId || undefined,
					modelId: form.modelId || undefined,
					temperature: form.temperature || undefined,
					topP: form.topP || undefined,
					maxOutputTokens: form.maxOutputTokens
						? Number.parseInt(form.maxOutputTokens, 10)
						: undefined,
					toolBindings: selectedToolIds.map((toolId) => ({
						toolSource: "builtin",
						toolId,
						requireApproval:
							availableTools.find((tool) => tool.id === toolId)
								?.requiresApprovalByDefault ?? false,
					})),
				}),
			});

			if (!res.ok) {
				const error = await res.json().catch(() => null);
				throw new Error(error?.error || "Failed to save agent");
			}

			const data = await res.json();
			setAgent(data.agent);
			const versionsRes = await fetch(
				`/api/workspace/agents/${agent.id}/versions?workspaceId=${workspaceId}`,
			);
			if (versionsRes.ok)
				setVersions((await versionsRes.json()) as AgentVersion[]);
			toast.success("Agent saved as a new version");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save agent");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2
					className="animate-spin text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		);
	}

	if (!agent) {
		return (
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BotIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Agent not found</EmptyTitle>
						<EmptyDescription>
							This agent may have been archived or removed.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild variant="outline">
							<Link href="/agents">Back to agents</Link>
						</Button>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	return (
		<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1fr_20rem]">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
					<div className="flex flex-col gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="w-fit"
							onClick={() => router.push("/agents")}
						>
							<ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
							Agents
						</Button>
						<div className="section-kicker">Agent builder</div>
						<h1 className="text-2xl font-semibold sm:text-3xl">{agent.name}</h1>
						<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
							Edit configuration safely. Every save creates an immutable version
							and points chat to the latest version.
						</p>
					</div>
					<Button
						type="button"
						onClick={handleSave}
						disabled={saving || !form.name.trim() || !form.slug.trim()}
					>
						{saving ? (
							<Loader2 className="animate-spin" aria-hidden="true" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Save version
					</Button>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Identity</CardTitle>
						<CardDescription>
							Name, URL slug, and teammate-facing description.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								value={form.name}
								onChange={(event) =>
									setForm({ ...form, name: event.target.value })
								}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="agent-slug">Slug</Label>
							<Input
								id="agent-slug"
								value={form.slug}
								onChange={(event) =>
									setForm({ ...form, slug: event.target.value })
								}
							/>
						</div>
						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label htmlFor="agent-description">Description</Label>
							<Input
								id="agent-description"
								value={form.description}
								onChange={(event) =>
									setForm({ ...form, description: event.target.value })
								}
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Instructions</CardTitle>
						<CardDescription>
							System prompt used for every chat with this version.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<textarea
							id="system-prompt"
							value={form.systemPrompt}
							onChange={(event) =>
								setForm({ ...form, systemPrompt: event.target.value })
							}
							placeholder="You are a helpful assistant..."
							className="min-h-64 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Tools</CardTitle>
						<CardDescription>
							Bind built-in tools to this agent version. High-risk tools pause
							for approval and are logged securely.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-2">
						{availableTools.map((tool) => {
							const checked = selectedToolIds.includes(tool.id);
							return (
								<label
									key={tool.id}
									className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm"
								>
									<input
										type="checkbox"
										checked={checked}
										onChange={(event) => {
											setSelectedToolIds((current) =>
												event.target.checked
													? [...current, tool.id]
													: current.filter((id) => id !== tool.id),
											);
										}}
										className="mt-1"
									/>
									<span className="flex flex-col gap-1">
										<span className="flex items-center gap-2 font-medium">
											{tool.displayName}
											<Badge
												variant={
													tool.riskLevel === "low" ? "secondary" : "outline"
												}
											>
												{tool.riskLevel}
											</Badge>
										</span>
										<span className="text-muted-foreground">
											{tool.description}
										</span>
									</span>
								</label>
							);
						})}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Model routing</CardTitle>
						<CardDescription>
							Select the encrypted provider and registered model for this agent.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="provider">Provider</Label>
							<select
								id="provider"
								value={form.providerId}
								onChange={(event) =>
									setForm({
										...form,
										providerId: event.target.value,
										modelId: "",
									})
								}
								className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<option value="">Select provider</option>
								{providers.map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.name} ({provider.kind})
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="model">Model</Label>
							<select
								id="model"
								value={form.modelId}
								onChange={(event) =>
									setForm({ ...form, modelId: event.target.value })
								}
								disabled={!form.providerId}
								className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
							>
								<option value="">Select model</option>
								{models.map((model) => (
									<option key={model.id} value={model.id}>
										{model.displayName || model.modelId}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="temperature">Temperature</Label>
							<Input
								id="temperature"
								value={form.temperature}
								onChange={(event) =>
									setForm({ ...form, temperature: event.target.value })
								}
								placeholder="0.7"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="top-p">Top P</Label>
							<Input
								id="top-p"
								value={form.topP}
								onChange={(event) =>
									setForm({ ...form, topP: event.target.value })
								}
								placeholder="Optional"
							/>
						</div>
						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label htmlFor="max-output">Max output tokens</Label>
							<Input
								id="max-output"
								inputMode="numeric"
								value={form.maxOutputTokens}
								onChange={(event) =>
									setForm({ ...form, maxOutputTokens: event.target.value })
								}
							/>
						</div>
					</CardContent>
				</Card>
			</section>

			<aside className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Status</CardTitle>
						<CardDescription>Active chat configuration.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">Active version</span>
							<Badge variant="secondary">
								{activeVersion ? `v${activeVersion.versionNumber}` : "none"}
							</Badge>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">Provider</span>
							<span>
								{providers.find((provider) => provider.id === form.providerId)
									?.name || "Not set"}
							</span>
						</div>
						<Button asChild variant="outline" size="sm">
							<Link href={`/chat?agentId=${agent.id}`}>Open chat</Link>
						</Button>
						{providers.length === 0 && (
							<Button asChild size="sm">
								<Link href="/providers">Configure provider</Link>
							</Button>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Versions</CardTitle>
						<CardDescription>
							Immutable history created on save.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{versions.map((version) => (
							<div
								key={version.id}
								className="rounded-xl border border-border/70 p-3 text-sm"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium">
										Version {version.versionNumber}
									</span>
									{version.isActive && <Badge>active</Badge>}
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{new Date(version.createdAt).toLocaleString()}
								</p>
							</div>
						))}
					</CardContent>
				</Card>
			</aside>
		</div>
	);
}
