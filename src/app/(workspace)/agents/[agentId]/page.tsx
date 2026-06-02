"use client";

import { useParams } from "next/navigation";
import {
	type SyntheticEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	BrainIcon,
	BookOpenIcon,
	SettingsIcon,
	WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

import type {
	Agent,
	AgentForm,
	Model,
	Provider,
	BuiltinTool,
	McpServer,
	McpTool,
	KnowledgeBase,
	ToolBinding,
	KnowledgeBinding,
	ToolBindingState,
	ToolFilter,
} from "./types";
import { createEmptyForm, defaultGenParams } from "./types";
import { isMcpToolApprovalForced } from "./utils";
import { TabBadge } from "./shared";
import { AgentHeader, PageActions } from "./agent-header";
import { GeneralTab } from "./general-tab";
import { ModelTab } from "./model-tab";
import { ToolsTab } from "./tools-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { DeleteDialog } from "./delete-dialog";

export default function AgentConfigurePage() {
	const params = useParams<{ agentId: string }>();
	const agentId = params.agentId;
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();

	/* ── Data State ────────────────────────────────────────────── */
	const [agent, setAgent] = useState<Agent | null>(null);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [models, setModels] = useState<Model[]>([]);
	const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
	const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
	const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
	const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

	/* ── UI State ──────────────────────────────────────────────── */
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState("general");

	/* ── Form State ────────────────────────────────────────────── */
	const [form, setForm] = useState<AgentForm>(createEmptyForm);

	/* ── Bindings State ────────────────────────────────────────── */
	const [builtinBindings, setBuiltinBindings] = useState<ToolBindingState>({});
	const [mcpBindings, setMcpBindings] = useState<ToolBindingState>({});
	const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
		[],
	);

	/* ── Filters ───────────────────────────────────────────────── */
	const [toolSearch, setToolSearch] = useState("");
	const [toolFilter, setToolFilter] = useState<ToolFilter>("all");
	const [knowledgeSearch, setKnowledgeSearch] = useState("");

	/* ── Dialogs ───────────────────────────────────────────────── */
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [deleting, setDeleting] = useState(false);

	/* ── Computed Stats ────────────────────────────────────────── */
	const enabledBuiltinCount = useMemo(
		() => Object.values(builtinBindings).filter((b) => b.enabled).length,
		[builtinBindings],
	);
	const enabledMcpCount = useMemo(
		() => Object.values(mcpBindings).filter((b) => b.enabled).length,
		[mcpBindings],
	);
	const totalEnabledTools = enabledBuiltinCount + enabledMcpCount;

	/* ── Data Loading ──────────────────────────────────────────── */
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
			topP: string | null;
			maxOutputTokens: number | null;
			maxToolCalls: number | null;
		}>;
		const providerRows = (await providersRes.json()) as Provider[];
		const builtinRows = (await toolsRes.json()) as BuiltinTool[];
		const mcpServerRows = (await mcpRes.json()) as McpServer[];
		const kbRows = (await kbRes.json()) as KnowledgeBase[];
		const toolBindings = bindingsRes.ok
			? ((await bindingsRes.json()) as ToolBinding[])
			: [];
		const knowledgeBindings = knowledgeBindingsRes.ok
			? (
					(await knowledgeBindingsRes.json()) as {
						bindings: KnowledgeBinding[];
					}
				).bindings
			: [];

		const activeVersion = versions.find((v) => v.isActive) ?? null;

		// Load models for all providers in parallel
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

		// Load MCP tools for all servers in parallel
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
			temperature: activeVersion?.temperature ?? defaultGenParams.temperature,
			topP: activeVersion?.topP ?? defaultGenParams.topP,
			maxOutputTokens: String(
				activeVersion?.maxOutputTokens ??
					Number(defaultGenParams.maxOutputTokens),
			),
			maxToolCalls: String(
				activeVersion?.maxToolCalls ?? Number(defaultGenParams.maxToolCalls),
			),
			sharingMode: nextAgent.sharingMode,
			shareTargetEmail: "",
			originalSharingMode: nextAgent.sharingMode,
			isGlobal: nextAgent.isGlobal,
			isRecommended: nextAgent.isRecommended,
			curationLabel: nextAgent.curationLabel ?? "none",
		});

		// Build builtin bindings map
		const nextBuiltin: ToolBindingState = {};
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

		// Build MCP bindings map
		const nextMcp: ToolBindingState = {};
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

	/* ── Save Handlers ─────────────────────────────────────────── */

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
					topP: form.topP,
					maxOutputTokens: Number(form.maxOutputTokens) || undefined,
					maxToolCalls: Number(form.maxToolCalls),
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
					.filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
					.map((tool) => ({
						toolSource: "mcp" as const,
						toolId: tool.id,
						mcpServerId: tool.mcpServerId,
						requireApproval:
							isMcpToolApprovalForced(tool, mcpServers) ||
							mcpBindings[tool.id]?.requireApproval,
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

	async function handleDelete() {
		if (!agentId || !workspaceId) return;
		setDeleting(true);
		try {
			const res = await fetch(
				`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				throw new Error(
					(await res.json().catch(() => null))?.error ||
						"Unable to delete agent",
				);
			}
			toast.success("Agent deleted");
			window.location.href = "/agents";
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to delete agent",
			);
		} finally {
			setDeleting(false);
			setShowDeleteDialog(false);
		}
	}

	/* ── Loading State ─────────────────────────────────────────── */

	if (workspaceLoading || !workspaceId || loading) {
		return <PageLoading label="Loading assistant" />;
	}

	/* ── Render ────────────────────────────────────────────────── */

	return (
		<WorkspacePage
			kicker="Configuration"
			title="Assistant configuration"
			description="Tune identity, model behavior, tools, and knowledge for this assistant."
			width="default"
			actions={
				<PageActions
					agentId={agentId}
					onShowDeleteDialog={() => setShowDeleteDialog(true)}
				/>
			}
		>
			<div className="flex flex-col gap-6">
				{/* Identity Header */}
				<AgentHeader
					agent={agent}
					providers={providers}
					models={models}
					form={form}
					totalEnabledTools={totalEnabledTools}
					enabledMcpCount={enabledMcpCount}
					selectedKnowledgeIds={selectedKnowledgeIds}
					onShowDeleteDialog={() => setShowDeleteDialog(true)}
				/>

				{/* Tabs */}
				<Tabs value={activeTab} onValueChange={setActiveTab}>
					<TabsList className="w-full flex-wrap">
						<TabsTrigger value="general" className="gap-2">
							<SettingsIcon className="size-4" aria-hidden="true" />
							Basics
						</TabsTrigger>
						<TabsTrigger value="model" className="gap-2">
							<BrainIcon className="size-4" aria-hidden="true" />
							Model
						</TabsTrigger>
						<TabsTrigger value="tools" className="gap-2">
							<WrenchIcon className="size-4" aria-hidden="true" />
							Tools
							<TabBadge count={totalEnabledTools} />
						</TabsTrigger>
						<TabsTrigger value="knowledge" className="gap-2">
							<BookOpenIcon className="size-4" aria-hidden="true" />
							Knowledge
							<TabBadge count={selectedKnowledgeIds.length} />
						</TabsTrigger>
					</TabsList>

					{/* BASICS TAB */}
					<TabsContent value="general" className="mt-4">
						<GeneralTab
							form={form}
							setForm={setForm}
							saving={saving}
							onSave={saveGeneralModel}
						/>
					</TabsContent>

					{/* MODEL TAB */}
					<TabsContent value="model" className="mt-4">
						<ModelTab
							form={form}
							setForm={setForm}
							providers={providers}
							models={models}
							saving={saving}
							onSave={saveGeneralModel}
						/>
					</TabsContent>

					{/* TOOLS TAB */}
					<TabsContent value="tools" className="mt-4">
						<ToolsTab
							builtinTools={builtinTools}
							builtinBindings={builtinBindings}
							setBuiltinBindings={setBuiltinBindings}
							mcpServers={mcpServers}
							mcpTools={mcpTools}
							mcpBindings={mcpBindings}
							setMcpBindings={setMcpBindings}
							toolSearch={toolSearch}
							setToolSearch={setToolSearch}
							toolFilter={toolFilter}
							setToolFilter={setToolFilter}
							saving={saving}
							onSave={saveToolBindings}
						/>
					</TabsContent>

					{/* KNOWLEDGE TAB */}
					<TabsContent value="knowledge" className="mt-4">
						<KnowledgeTab
							knowledgeBases={knowledgeBases}
							selectedKnowledgeIds={selectedKnowledgeIds}
							setSelectedKnowledgeIds={setSelectedKnowledgeIds}
							knowledgeSearch={knowledgeSearch}
							setKnowledgeSearch={setKnowledgeSearch}
							saving={saving}
							onSave={saveKnowledgeBindings}
						/>
					</TabsContent>
				</Tabs>
			</div>

			{/* Delete Dialog */}
			<DeleteDialog
				open={showDeleteDialog}
				onOpenChange={(open) => {
					if (!open) setShowDeleteDialog(false);
				}}
				agentName={agent?.name ?? null}
				deleting={deleting}
				onDelete={handleDelete}
			/>
		</WorkspacePage>
	);
}
