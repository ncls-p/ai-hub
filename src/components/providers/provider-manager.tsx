"use client";

import { useCallback, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";

import {
	AddProviderDialog,
	DeleteModelDialog,
	DeleteProviderDialog,
	EditProviderDialog,
} from "./provider-manager/provider-dialogs";
import { ProviderList } from "./provider-manager/provider-list";
import { ModelsPanel } from "./provider-manager/model-list";
import { StatsSidebar, SystemStrip } from "./provider-manager/provider-stats";
import { KIND_LABELS } from "./provider-manager/constants";
import type {
	DiscoveredModel,
	ProviderAuthType,
	ProviderKind,
	ProviderModel,
	SafeProvider,
} from "./provider-manager/types";
import { defaultAuthType, parsePairs } from "./provider-manager/utils";

export function ProviderManager({
	workspaceId,
	initialProviders,
	initialModels,
}: {
	workspaceId: string;
	initialProviders: SafeProvider[];
	initialModels: ProviderModel[];
}) {
	const t = useTranslations("providers.manager");
	const [providers, setProviders] = useState<SafeProvider[]>(initialProviders);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		initialProviders[0]?.id ?? null,
	);
	const [models, setModels] = useState<ProviderModel[]>(initialModels);
	const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
		[],
	);
	const [loadingProviders, setLoadingProviders] = useState(false);
	const [loadingModels, setLoadingModels] = useState(false);
	const [busy, setBusy] = useState(false);
	const [providerSearch, setProviderSearch] = useState("");
	const [modelSearch, setModelSearch] = useState("");
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [addKind, setAddKind] = useState<ProviderKind>("openai-compatible");
	const [addAuthType, setAddAuthType] = useState<ProviderAuthType>(
		defaultAuthType("openai-compatible"),
	);
	const [addName, setAddName] = useState("");
	const [addBaseUrl, setAddBaseUrl] = useState("");
	const [addApiKey, setAddApiKey] = useState("");
	const [addCustomHeaders, setAddCustomHeaders] = useState("");
	const [addQueryParams, setAddQueryParams] = useState("");
	const [addAdvanced, setAddAdvanced] = useState(false);
	const [editingProvider, setEditingProvider] = useState<SafeProvider | null>(
		null,
	);
	const [editName, setEditName] = useState("");
	const [editBaseUrl, setEditBaseUrl] = useState("");
	const [editApiKey, setEditApiKey] = useState("");
	const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
	const [deleteModelId, setDeleteModelId] = useState<string | null>(null);
	const [manualModelId, setManualModelId] = useState("");
	const [manualModelName, setManualModelName] = useState("");

	const selectedProvider = useMemo(
		() => providers.find((p) => p.id === selectedProviderId) ?? null,
		[providers, selectedProviderId],
	);

	const filteredProviders = useMemo(() => {
		if (!providerSearch.trim()) return providers;
		const q = providerSearch.toLowerCase();
		return providers.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				KIND_LABELS[p.kind].toLowerCase().includes(q) ||
				(p.baseUrl ?? "").toLowerCase().includes(q),
		);
	}, [providers, providerSearch]);

	const filteredModels = useMemo(() => {
		if (!modelSearch.trim()) return models;
		const q = modelSearch.toLowerCase();
		return models.filter(
			(m) =>
				m.modelId.toLowerCase().includes(q) ||
				(m.displayName ?? "").toLowerCase().includes(q),
		);
	}, [models, modelSearch]);
	const enabledProviderCount = providers.filter(
		(provider) => provider.enabled,
	).length;

	const loadProviders = useCallback(async () => {
		setLoadingProviders(true);
		try {
			const res = await fetch(
				`/api/workspace/providers?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error(t("errorLoadProviders"));
			const data = (await res.json()) as SafeProvider[];
			setProviders(data);
			setSelectedProviderId((current) => current ?? data[0]?.id ?? null);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setLoadingProviders(false);
		}
	}, [workspaceId, t]);

	const loadModelsForProvider = useCallback(
		async (providerId: string | null) => {
			if (!providerId) {
				setModels([]);
				return;
			}
			setLoadingModels(true);
			try {
				const res = await fetch(
					`/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
				);
				if (!res.ok) throw new Error(t("errorLoadModels"));
				setModels((await res.json()) as ProviderModel[]);
			} catch (error) {
				toast.error((error as Error).message);
			} finally {
				setLoadingModels(false);
			}
		},
		[workspaceId, t],
	);

	function openAddDialog() {
		resetAddForm();
		setShowAddDialog(true);
	}

	function selectProvider(providerId: string) {
		setSelectedProviderId(providerId);
		setDiscoveredModels([]);
		setModelSearch("");
		void loadModelsForProvider(providerId);
	}

	function resetAddForm() {
		setAddName("");
		setAddBaseUrl("");
		setAddApiKey("");
		setAddCustomHeaders("");
		setAddQueryParams("");
		setAddKind("openai-compatible");
		setAddAuthType(defaultAuthType("openai-compatible"));
		setAddAdvanced(false);
	}

	function openEditDialog(provider: SafeProvider) {
		setEditingProvider(provider);
		setEditName(provider.name);
		setEditBaseUrl(provider.baseUrl ?? "");
		setEditApiKey("");
	}

	async function createNewProvider() {
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					kind: addKind,
					name: addName,
					baseUrl: addBaseUrl,
					authType: addAuthType,
					apiKey: addApiKey,
					headersJson: parsePairs(addCustomHeaders),
					queryParamsJson: parsePairs(addQueryParams),
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || t("errorConnectProvider"));
			}
			const provider = (await res.json()) as SafeProvider;
			setProviders((prev) => [provider, ...prev]);
			setSelectedProviderId(provider.id);
			setShowAddDialog(false);
			resetAddForm();
			toast.success(t("toastProviderConnected"));
			await loadModelsForProvider(provider.id);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function testProvider(providerId: string) {
		setBusy(true);
		try {
			const res = await fetch(`/api/workspace/providers/${providerId}/test`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || t("errorProviderTest"));
			toast[data.status === "healthy" ? "success" : "error"](
				data.message || `Provider is ${data.status}`,
			);
			await loadProviders();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function toggleProvider(provider: SafeProvider) {
		setBusy(true);
		try {
			const res = await fetch(`/api/workspace/providers/${provider.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, enabled: !provider.enabled }),
			});
			if (!res.ok) throw new Error(t("errorUpdateProvider"));
			await loadProviders();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function saveProviderEdit() {
		if (!editingProvider) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${editingProvider.id}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						name: editName.trim(),
						baseUrl: editBaseUrl.trim() || "",
						...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
					}),
				},
			);
			if (!res.ok) {
				throw new Error((await res.json()).error || t("errorUpdateProvider"));
			}
			setEditingProvider(null);
			setEditApiKey("");
			await loadProviders();
			toast.success(t("toastConnectionUpdated"));
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function deleteProvider(id: string) {
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${id}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error(t("errorArchiveProvider"));
			setProviders((prev) => prev.filter((p) => p.id !== id));
			if (selectedProviderId === id) {
				setSelectedProviderId(null);
				setModels([]);
			}
			setDeleteProviderId(null);
			toast.success(t("toastProviderArchived"));
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function createManualModel(model?: DiscoveredModel) {
		if (!selectedProviderId) return;
		const id = model?.modelId ?? manualModelId;
		const displayName = model?.displayName ?? manualModelName ?? id;
		if (!id) return;

		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${selectedProviderId}/models`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						modelId: id,
						displayName,
						capabilitiesJson: model?.capabilities ?? {
							text: true,
							vision: false,
							tools: false,
							reasoning: false,
							embeddings: false,
							audio: false,
						},
						contextWindow: model?.contextWindow,
						maxOutputTokens: model?.maxOutputTokens,
						inputTokenCost: model?.inputTokenCost,
						outputTokenCost: model?.outputTokenCost,
					}),
				},
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || t("errorCreateModel"));
			}
			setManualModelId("");
			setManualModelName("");
			toast.success(t("toastModelRegistered"));
			await loadModelsForProvider(selectedProviderId);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function discoverProviderModels() {
		if (!selectedProviderId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${selectedProviderId}/models?workspaceId=${workspaceId}&action=discover`,
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || t("errorDiscoverModels"));
			setDiscoveredModels(data as DiscoveredModel[]);
			toast.success(
				t("toastDiscoveredModels", {
					count: (data as DiscoveredModel[]).length,
				}),
			);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function updateModelLogo(modelId: string, logoUrl: string | null) {
		if (!selectedProviderId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${selectedProviderId}/models/${modelId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, logoUrl }),
				},
			);
			if (!res.ok) throw new Error(t("errorUpdateModelLogo"));
			toast.success(logoUrl ? t("toastLogoAssigned") : t("toastLogoRemoved"));
			await loadModelsForProvider(selectedProviderId);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function deleteModel(modelId: string) {
		if (!selectedProviderId) return;
		setBusy(true);
		try {
			const res = await fetch(
				`/api/workspace/providers/${selectedProviderId}/models/${modelId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error(t("errorDeleteModel"));
			setDeleteModelId(null);
			toast.success(t("toastModelRemoved"));
			await loadModelsForProvider(selectedProviderId);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="rounded-xl border bg-card p-5 sm:p-6">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="max-w-2xl">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("heroEyebrow")}
						</p>
						<h2 className="mt-2 text-xl font-semibold tracking-tight">
							{t("heroTitle")}
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{t("heroDescription")}
						</p>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
						<div className="grid grid-cols-2 gap-2 text-sm">
							<div className="rounded-xl border bg-background px-3 py-2">
								<p className="font-medium">{enabledProviderCount}</p>
								<p className="text-xs text-muted-foreground">
									{t("connectionsReady", { count: enabledProviderCount })}
								</p>
							</div>
							<div className="rounded-xl border bg-background px-3 py-2">
								<p className="font-medium">{models.length}</p>
								<p className="text-xs text-muted-foreground">
									{t("modelsShown", { count: models.length })}
								</p>
							</div>
						</div>
						<Button size="sm" onClick={openAddDialog}>
							<PlusIcon className="size-4" aria-hidden="true" />
							{t("connectAi")}
						</Button>
					</div>
				</div>
				<ol className="mt-5 grid gap-2 sm:grid-cols-3">
					{[
						t("heroStepConnect"),
						t("heroStepModels"),
						t("heroStepAssistants"),
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
				<AdvancedSection
					label={t("systemHealth")}
					hint={t("systemHealthHint")}
					storageKey="advanced:providers-health"
					className="mt-5 border-border/50 bg-muted/20"
				>
					<SystemStrip providers={providers} models={models} />
				</AdvancedSection>
			</div>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-6">
					<ProviderList
						providers={providers}
						filteredProviders={filteredProviders}
						selectedProviderId={selectedProviderId}
						providerSearch={providerSearch}
						loadingProviders={loadingProviders}
						busy={busy}
						onSearchChange={setProviderSearch}
						onAddProvider={openAddDialog}
						onSelectProvider={selectProvider}
						onToggleProvider={(provider) => void toggleProvider(provider)}
						onTestProvider={(providerId) => void testProvider(providerId)}
						onEditProvider={openEditDialog}
						onDeleteProvider={setDeleteProviderId}
					/>
					<ModelsPanel
						selectedProvider={selectedProvider}
						providers={providers}
						models={models}
						filteredModels={filteredModels}
						discoveredModels={discoveredModels}
						modelSearch={modelSearch}
						manualModelId={manualModelId}
						manualModelName={manualModelName}
						loadingModels={loadingModels}
						loadingProviders={loadingProviders}
						busy={busy}
						onDiscoverModels={() => void discoverProviderModels()}
						onUpdateModelLogo={(modelId: string, logoUrl: string | null) =>
							void updateModelLogo(modelId, logoUrl)
						}
						onCreateModel={(model) => void createManualModel(model)}
						onDeleteModel={setDeleteModelId}
						onModelSearchChange={setModelSearch}
						onManualModelIdChange={setManualModelId}
						onManualModelNameChange={setManualModelName}
					/>
				</div>
				<div className="space-y-6">
					<StatsSidebar models={models} selectedProvider={selectedProvider} />
				</div>
			</div>

			<AddProviderDialog
				open={showAddDialog}
				busy={busy}
				addKind={addKind}
				addAuthType={addAuthType}
				addName={addName}
				addBaseUrl={addBaseUrl}
				addApiKey={addApiKey}
				addCustomHeaders={addCustomHeaders}
				addQueryParams={addQueryParams}
				addAdvanced={addAdvanced}
				onOpenChange={(open) => {
					setShowAddDialog(open);
					if (!open) resetAddForm();
				}}
				onKindChange={setAddKind}
				onAuthTypeChange={setAddAuthType}
				onNameChange={setAddName}
				onBaseUrlChange={setAddBaseUrl}
				onApiKeyChange={setAddApiKey}
				onCustomHeadersChange={setAddCustomHeaders}
				onQueryParamsChange={setAddQueryParams}
				onAdvancedChange={setAddAdvanced}
				onCreateProvider={() => void createNewProvider()}
			/>
			<EditProviderDialog
				editingProvider={editingProvider}
				busy={busy}
				editName={editName}
				editBaseUrl={editBaseUrl}
				editApiKey={editApiKey}
				onClose={() => setEditingProvider(null)}
				onNameChange={setEditName}
				onBaseUrlChange={setEditBaseUrl}
				onApiKeyChange={setEditApiKey}
				onSave={() => void saveProviderEdit()}
			/>
			<DeleteProviderDialog
				deleteProviderId={deleteProviderId}
				busy={busy}
				onClose={() => setDeleteProviderId(null)}
				onDelete={(id) => void deleteProvider(id)}
			/>
			<DeleteModelDialog
				deleteModelId={deleteModelId}
				busy={busy}
				onClose={() => setDeleteModelId(null)}
				onDelete={(id) => void deleteModel(id)}
			/>
		</div>
	);
}
