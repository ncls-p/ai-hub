"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import {
	ArrowLeftIcon,
	BookOpenIcon,
	SaveIcon,
	ServerIcon,
	WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";

type Agent = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	sharingMode: "personal" | "marketplace" | "specific_user";
	isGlobal: boolean;
	isRecommended: boolean;
	curationLabel: string | null;
	canAdminCurate: boolean;
};

type Provider = { id: string; name: string; kind: string };
type Model = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
};
type BuiltinTool = {
	id: string;
	name: string;
	description: string;
	riskLevel: string;
};
type McpServer = { id: string; name: string };
type McpTool = {
	id: string;
	name: string;
	description: string | null;
	mcpServerId: string;
	enabled: boolean;
};
type KnowledgeBase = { id: string; name: string };
type ToolBinding = {
	toolSource: string;
	toolId: string;
	requireApproval: boolean;
};
type KnowledgeBinding = {
	knowledgeBaseId: string;
	name: string;
};

export default function AgentConfigurePage() {
	const params = useParams<{ agentId: string }>();
	const agentId = params.agentId;
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agent, setAgent] = useState<Agent | null>(null);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [models, setModels] = useState<Model[]>([]);
	const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
	const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
	const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
	const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		name: "",
		description: "",
		systemPrompt: "",
		providerId: "",
		modelId: "",
		temperature: "0.7",
		maxOutputTokens: "1024",
		sharingMode: "personal" as Agent["sharingMode"],
		shareTargetEmail: "",
		originalSharingMode: "personal" as Agent["sharingMode"],
		isGlobal: false,
		isRecommended: false,
		curationLabel: "none",
	});
	const [builtinBindings, setBuiltinBindings] = useState<
		Record<string, { enabled: boolean; requireApproval: boolean }>
	>({});
	const [mcpBindings, setMcpBindings] = useState<
		Record<string, { enabled: boolean; requireApproval: boolean }>
	>({});
	const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
		[],
	);

	const loadData = useCallback(async () => {
		if (!agentId || !workspaceId) return;
		const [
			agentRes,
			versionsRes,
			providersRes,
			toolsRes,
			mcpRes,
			kbRes,
			bindingsRes,
			knowledgeBindingsRes,
		] = await Promise.all([
			fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`),
			fetch(
				`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
			),
			fetch(`/api/workspace/providers?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/tools?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/mcp-servers?workspaceId=${workspaceId}`),
			fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`),
			fetch(
				`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
			),
			fetch(
				`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
			),
		]);

		if (
			!agentRes.ok ||
			!versionsRes.ok ||
			!providersRes.ok ||
			!toolsRes.ok ||
			!mcpRes.ok ||
			!kbRes.ok
		) {
			throw new Error("Unable to load agent settings");
		}

		const nextAgent = (await agentRes.json()) as Agent;
		const versions = (await versionsRes.json()) as Array<{
			isActive: boolean;
			systemPrompt: string | null;
			providerId: string | null;
			modelId: string | null;
			temperature: string | null;
			maxOutputTokens: number | null;
		}>;
		const providerRows = (await providersRes.json()) as Provider[];
		const builtinRows = (await toolsRes.json()) as BuiltinTool[];
		const mcpServerRows = (await mcpRes.json()) as McpServer[];
		const kbRows = (await kbRes.json()) as KnowledgeBase[];
		const toolBindings = bindingsRes.ok
			? ((await bindingsRes.json()) as ToolBinding[])
			: [];
		const knowledgeBindings = knowledgeBindingsRes.ok
			? ((await knowledgeBindingsRes.json()) as { bindings: KnowledgeBinding[] })
					.bindings
			: [];

		const activeVersion = versions.find((v) => v.isActive) ?? null;
		const modelRows = (
			await Promise.all(
				providerRows.map(async (provider) => {
					const res = await fetch(
						`/api/workspace/providers/${provider.id}/models?workspaceId=${workspaceId}`,
					);
					return res.ok ? ((await res.json()) as Model[]) : [];
				}),
			)
		).flat();

		const mcpToolRows = (
			await Promise.all(
				mcpServerRows.map(async (server) => {
					const res = await fetch(
						`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
					);
					return res.ok ? ((await res.json()) as McpTool[]) : [];
				}),
			)
		).flat();

		setAgent(nextAgent);
		setProviders(providerRows);
		setModels(modelRows);
		setBuiltinTools(builtinRows);
		setMcpServers(mcpServerRows);
		setMcpTools(mcpToolRows);
		setKnowledgeBases(kbRows);
		setForm({
			name: nextAgent.name,
			description: nextAgent.description ?? "",
			systemPrompt: activeVersion?.systemPrompt ?? "",
			providerId: activeVersion?.providerId ?? "",
			modelId: activeVersion?.modelId ?? "",
			temperature: activeVersion?.temperature ?? "0.7",
			maxOutputTokens: String(activeVersion?.maxOutputTokens ?? 1024),
			sharingMode: nextAgent.sharingMode,
			shareTargetEmail: "",
			originalSharingMode: nextAgent.sharingMode,
			isGlobal: nextAgent.isGlobal,
			isRecommended: nextAgent.isRecommended,
			curationLabel: nextAgent.curationLabel ?? "none",
		});

		const nextBuiltin: Record<
			string,
			{ enabled: boolean; requireApproval: boolean }
		> = {};
		for (const tool of builtinRows) {
			const binding = toolBindings.find(
				(b) => b.toolSource === "builtin" && b.toolId === tool.id,
			);
			nextBuiltin[tool.id] = {
				enabled: Boolean(binding),
				requireApproval: binding?.requireApproval ?? false,
			};
		}
		setBuiltinBindings(nextBuiltin);

		const nextMcp: Record<
			string,
			{ enabled: boolean; requireApproval: boolean }
		> = {};
		for (const tool of mcpToolRows) {
			const binding = toolBindings.find(
				(b) => b.toolSource === "mcp" && b.toolId === tool.id,
			);
			nextMcp[tool.id] = {
				enabled: Boolean(binding),
				requireApproval: binding?.requireApproval ?? false,
			};
		}
		setMcpBindings(nextMcp);
		setSelectedKnowledgeIds(knowledgeBindings.map((b) => b.knowledgeBaseId));
	}, [agentId, workspaceId]);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			void loadData()
				.catch((error) =>
					toast.error(
						error instanceof Error ? error.message : "Unable to load agent",
					),
				)
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		});
		return () => {
			cancelled = true;
		};
	}, [loadData]);

	const filteredModels = models.filter(
		(model) => model.providerId === form.providerId,
	);

	async function saveGeneralModel(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const res = await fetch(`/api/workspace/agents/${agentId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: form.name,
					description: form.description,
					systemPrompt: form.systemPrompt,
					providerId: form.providerId || undefined,
					modelId: form.modelId || undefined,
					temperature: form.temperature,
					maxOutputTokens: Number(form.maxOutputTokens) || undefined,
					...(form.sharingMode !== form.originalSharingMode ||
					form.shareTargetEmail.trim()
						? {
								sharingMode: form.sharingMode,
								shareTargetEmail:
									form.sharingMode === "specific_user"
										? form.shareTargetEmail.trim()
										: undefined,
							}
						: {}),
					...(agent?.canAdminCurate
						? {
								isGlobal: form.isGlobal,
								isRecommended: form.isRecommended,
								curationLabel: form.curationLabel,
							}
						: {}),
				}),
			});
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error || "Unable to save agent",
				);
			}
			const data = await res.json();
			if (data.agent) {
				setAgent({
					...data.agent,
					canAdminCurate: agent?.canAdminCurate ?? false,
				});
				setForm((current) => ({
					...current,
					originalSharingMode: data.agent.sharingMode,
					shareTargetEmail: "",
				}));
			}
			toast.success("Agent saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save agent",
			);
		} finally {
			setSaving(false);
		}
	}

	async function saveToolBindings() {
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const bindings = [
				...builtinTools
					.filter((tool) => builtinBindings[tool.id]?.enabled)
					.map((tool) => ({
						toolSource: "builtin" as const,
						toolId: tool.id,
						requireApproval: builtinBindings[tool.id]?.requireApproval,
					})),
				...mcpTools
					.filter((tool) => mcpBindings[tool.id]?.enabled)
					.map((tool) => ({
						toolSource: "mcp" as const,
						toolId: tool.id,
						mcpServerId: tool.mcpServerId,
						requireApproval: mcpBindings[tool.id]?.requireApproval,
					})),
			];
			const res = await fetch(
				`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ bindings }),
				},
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to save tool bindings",
				);
			}
			toast.success("Tool bindings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save tools",
			);
		} finally {
			setSaving(false);
		}
	}

	async function saveKnowledgeBindings() {
		if (!agentId || !workspaceId) return;
		setSaving(true);
		try {
			const res = await fetch(
				`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						knowledgeBaseIds: selectedKnowledgeIds,
					}),
				},
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to save knowledge bindings",
				);
			}
			toast.success("Knowledge bindings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save knowledge",
			);
		} finally {
			setSaving(false);
		}
	}

	if (workspaceLoading || !workspaceId || loading) {
		return <PageLoading label="Loading assistant" />;
	}

	return (
		<WorkspacePage
			kicker="Configuration"
			title={agent?.name ?? "Assistant"}
			description="Configure model behavior, tools, knowledge, and MCP integrations."
			width="default"
			actions={
				<Button asChild variant="outline" size="sm">
					<Link href="/agents">
						<ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
						All assistants
					</Link>
				</Button>
			}
		>
			<Tabs defaultValue="general">
				<TabsList className="w-full flex-wrap">
					<TabsTrigger value="general">General</TabsTrigger>
					<TabsTrigger value="model">Model</TabsTrigger>
					<TabsTrigger value="tools">Tools</TabsTrigger>
					<TabsTrigger value="knowledge">Knowledge</TabsTrigger>
					<TabsTrigger value="mcp">MCP</TabsTrigger>
				</TabsList>

				<TabsContent value="general" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>General</CardTitle>
							<CardDescription>
								Name, description, and sharing settings.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={saveGeneralModel}>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="agent-name">Name</FieldLabel>
										<FieldContent>
											<Input
												id="agent-name"
												required
												value={form.name}
												onChange={(e) =>
													setForm({ ...form, name: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
									<Field>
										<FieldLabel htmlFor="agent-description">
											Description
										</FieldLabel>
										<FieldContent>
											<Textarea
												id="agent-description"
												value={form.description}
												onChange={(e) =>
													setForm({ ...form, description: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
									<Field>
										<FieldLabel htmlFor="agent-sharing">Access</FieldLabel>
										<FieldContent>
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
										</FieldContent>
									</Field>
									{form.sharingMode === "specific_user" ? (
										<Field>
											<FieldLabel htmlFor="agent-share-email">
												Shared user email
											</FieldLabel>
											<FieldContent>
												<Input
													id="agent-share-email"
													type="email"
													value={form.shareTargetEmail}
													onChange={(e) =>
														setForm({
															...form,
															shareTargetEmail: e.target.value,
														})
													}
												/>
											</FieldContent>
										</Field>
									) : null}
									<Button type="submit" disabled={saving}>
										{saving ? (
											<Spinner data-icon="inline-start" />
										) : (
											<SaveIcon data-icon="inline-start" />
										)}
										Save general
									</Button>
								</FieldGroup>
							</form>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="model" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Model</CardTitle>
							<CardDescription>
								Provider, model, and generation parameters.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={saveGeneralModel}>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="agent-provider">Provider</FieldLabel>
										<FieldContent>
											<Select
												value={form.providerId || "__none__"}
												onValueChange={(value) =>
													setForm({
														...form,
														providerId: value === "__none__" ? "" : value,
														modelId: "",
													})
												}
											>
												<SelectTrigger id="agent-provider" className="w-full">
													<SelectValue placeholder="No provider" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">No provider</SelectItem>
													{providers.map((provider) => (
														<SelectItem key={provider.id} value={provider.id}>
															{provider.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
									<Field>
										<FieldLabel htmlFor="agent-model">Model</FieldLabel>
										<FieldContent>
											<Select
												value={form.modelId || "__none__"}
												onValueChange={(value) =>
													setForm({
														...form,
														modelId: value === "__none__" ? "" : value,
													})
												}
												disabled={!form.providerId}
											>
												<SelectTrigger id="agent-model" className="w-full">
													<SelectValue placeholder="No model" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">No model</SelectItem>
													{filteredModels.map((model) => (
														<SelectItem key={model.id} value={model.id}>
															{model.displayName || model.modelId}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
									<Field>
										<FieldLabel htmlFor="agent-prompt">System prompt</FieldLabel>
										<FieldContent>
											<Textarea
												id="agent-prompt"
												className="min-h-36"
												value={form.systemPrompt}
												onChange={(e) =>
													setForm({ ...form, systemPrompt: e.target.value })
												}
											/>
										</FieldContent>
									</Field>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor="agent-temperature">
												Temperature
											</FieldLabel>
											<FieldContent>
												<Input
													id="agent-temperature"
													value={form.temperature}
													onChange={(e) =>
														setForm({ ...form, temperature: e.target.value })
													}
												/>
											</FieldContent>
										</Field>
										<Field>
											<FieldLabel htmlFor="agent-max-output">
												Max output tokens
											</FieldLabel>
											<FieldContent>
												<Input
													id="agent-max-output"
													type="number"
													min={1}
													value={form.maxOutputTokens}
													onChange={(e) =>
														setForm({
															...form,
															maxOutputTokens: e.target.value,
														})
													}
												/>
											</FieldContent>
										</Field>
									</div>
									<Button type="submit" disabled={saving}>
										{saving ? (
											<Spinner data-icon="inline-start" />
										) : (
											<SaveIcon data-icon="inline-start" />
										)}
										Save model
									</Button>
								</FieldGroup>
							</form>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="tools" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<WrenchIcon className="size-5" />
								Built-in tools
							</CardTitle>
							<CardDescription>
								Enable workspace built-in tools for this agent version.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{builtinTools.map((tool) => (
								<div
									key={tool.id}
									className="flex items-center justify-between rounded-xl border p-3"
								>
									<div>
										<p className="font-medium">{tool.name}</p>
										<p className="text-xs text-muted-foreground">
											{tool.description} · {tool.riskLevel}
										</p>
									</div>
									<div className="flex items-center gap-4">
										<label className="flex items-center gap-2 text-xs">
											Approval
											<Switch
												checked={
													builtinBindings[tool.id]?.requireApproval ?? false
												}
												disabled={!builtinBindings[tool.id]?.enabled}
												onCheckedChange={(checked) =>
													setBuiltinBindings((current) => ({
														...current,
														[tool.id]: {
															enabled: current[tool.id]?.enabled ?? false,
															requireApproval: checked,
														},
													}))
												}
											/>
										</label>
										<Switch
											checked={builtinBindings[tool.id]?.enabled ?? false}
											onCheckedChange={(checked) =>
												setBuiltinBindings((current) => ({
													...current,
													[tool.id]: {
														enabled: checked,
														requireApproval:
															current[tool.id]?.requireApproval ?? false,
													},
												}))
											}
										/>
									</div>
								</div>
							))}
							<Button onClick={() => void saveToolBindings()} disabled={saving}>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								Save tools
							</Button>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="knowledge" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BookOpenIcon className="size-5" />
								Knowledge bases
							</CardTitle>
							<CardDescription>
								Bound bases are searched during chat for citations.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{knowledgeBases.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No knowledge bases yet.{" "}
									<Link href="/knowledge" className="underline">
										Create one
									</Link>
									.
								</p>
							) : (
								knowledgeBases.map((kb) => (
									<label
										key={kb.id}
										className="flex cursor-pointer items-center justify-between rounded-xl border p-3"
									>
										<span className="font-medium">{kb.name}</span>
										<Switch
											checked={selectedKnowledgeIds.includes(kb.id)}
											onCheckedChange={(checked) =>
												setSelectedKnowledgeIds((current) =>
													checked
														? [...current, kb.id]
														: current.filter((id) => id !== kb.id),
												)
											}
										/>
									</label>
								))
							)}
							<Button
								onClick={() => void saveKnowledgeBindings()}
								disabled={saving}
							>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								Save knowledge
							</Button>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="mcp" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ServerIcon className="size-5" />
								MCP tools
							</CardTitle>
							<CardDescription>
								Bind tools from connected MCP servers.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{mcpServers.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No MCP servers.{" "}
									<Link href="/mcp" className="underline">
										Add a server
									</Link>
									.
								</p>
							) : (
								mcpServers.map((server) => (
									<div key={server.id} className="flex flex-col gap-2">
										<p className="text-sm font-semibold">{server.name}</p>
										{mcpTools
											.filter((tool) => tool.mcpServerId === server.id)
											.map((tool) => (
												<div
													key={tool.id}
													className="flex items-center justify-between rounded-xl border p-3"
												>
													<div>
														<p className="font-medium">{tool.name}</p>
														{tool.description ? (
															<p className="text-xs text-muted-foreground">
																{tool.description}
															</p>
														) : null}
													</div>
													<div className="flex items-center gap-4">
														<label className="flex items-center gap-2 text-xs">
															Approval
															<Switch
																checked={
																	mcpBindings[tool.id]?.requireApproval ?? false
																}
																disabled={!mcpBindings[tool.id]?.enabled}
																onCheckedChange={(checked) =>
																	setMcpBindings((current) => ({
																		...current,
																		[tool.id]: {
																			enabled:
																				current[tool.id]?.enabled ?? false,
																			requireApproval: checked,
																		},
																	}))
																}
															/>
														</label>
														<Switch
															checked={mcpBindings[tool.id]?.enabled ?? false}
															onCheckedChange={(checked) =>
																setMcpBindings((current) => ({
																	...current,
																	[tool.id]: {
																		enabled: checked,
																		requireApproval:
																			current[tool.id]?.requireApproval ??
																			false,
																	},
																}))
															}
														/>
													</div>
												</div>
											))}
									</div>
								))
							)}
							<Button onClick={() => void saveToolBindings()} disabled={saving}>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								Save MCP bindings
							</Button>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
