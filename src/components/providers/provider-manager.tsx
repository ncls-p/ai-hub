"use client";

import { useCallback, useMemo, useState } from "react";
import {
	CloudIcon,
	CpuIcon,
	Loader2Icon,
	MoreHorizontalIcon,
	NetworkIcon,
	PlugIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ProviderKind =
	| "openai-compatible"
	| "dragonfly"
	| "vercel-ai-gateway"
	| "native";
type ProviderAuthType = "bearer" | "x-api-key" | "custom-header" | "gateway";

type SafeProvider = {
	id: string;
	workspaceId: string;
	kind: ProviderKind;
	name: string;
	baseUrl: string | null;
	authType: ProviderAuthType;
	enabled: boolean;
	healthStatus: string | null;
	lastCheckedAt: string | null;
	hasApiKey: boolean;
	hasCustomHeaders: boolean;
	createdAt: string;
};

type ProviderModel = {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string | null;
	capabilitiesJson: Record<string, boolean> | null;
	contextWindow: number | null;
	maxOutputTokens: number | null;
	inputTokenCost: string | null;
	outputTokenCost: string | null;
	enabled: boolean;
};

type DiscoveredModel = {
	modelId: string;
	displayName?: string;
	description?: string;
	hostedBy?: string;
	capabilities?: Record<string, boolean>;
	contextWindow?: number;
	maxOutputTokens?: number;
	inputTokenCost?: string;
	outputTokenCost?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const KIND_LABELS: Record<ProviderKind, string> = {
	"openai-compatible": "OpenAI-compatible",
	dragonfly: "Dragonfly",
	"vercel-ai-gateway": "Vercel AI Gateway",
	native: "Native",
};

const AUTH_TYPE_LABELS: Record<ProviderAuthType, string> = {
	bearer: "Bearer token",
	"x-api-key": "X-API-KEY header",
	"custom-header": "Custom headers only",
	gateway: "Gateway bearer token",
};

const KIND_ICONS: Record<ProviderKind, React.ElementType> = {
	"openai-compatible": PlugIcon,
	dragonfly: CloudIcon,
	"vercel-ai-gateway": NetworkIcon,
	native: CpuIcon,
};

// Accent color classes keyed by provider kind
const kindAccent = (kind: ProviderKind) => {
	const map: Record<
		ProviderKind,
		{
			bar: string;
			bg: string;
			text: string;
			ring: string;
			badge: string;
			iconBg: string;
		}
	> = {
		"openai-compatible": {
			bar: "bg-blue-500",
			bg: "bg-blue-500/5",
			text: "text-blue-600 dark:text-blue-400",
			ring: "ring-blue-500/20",
			badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
			iconBg: "bg-blue-100 dark:bg-blue-500/15",
		},
		dragonfly: {
			bar: "bg-teal-500",
			bg: "bg-teal-500/5",
			text: "text-teal-600 dark:text-teal-400",
			ring: "ring-teal-500/20",
			badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
			iconBg: "bg-teal-100 dark:bg-teal-500/15",
		},
		"vercel-ai-gateway": {
			bar: "bg-violet-500",
			bg: "bg-violet-500/5",
			text: "text-violet-600 dark:text-violet-400",
			ring: "ring-violet-500/20",
			badge:
				"bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
			iconBg: "bg-violet-100 dark:bg-violet-500/15",
		},
		native: {
			bar: "bg-amber-500",
			bg: "bg-amber-500/5",
			text: "text-amber-600 dark:text-amber-400",
			ring: "ring-amber-500/20",
			badge:
				"bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
			iconBg: "bg-amber-100 dark:bg-amber-500/15",
		},
	};
	return map[kind];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultAuthType(kind: ProviderKind): ProviderAuthType {
	if (kind === "dragonfly") return "x-api-key";
	if (kind === "vercel-ai-gateway") return "gateway";
	return "bearer";
}

function parsePairs(input: string): Record<string, string> | undefined {
	const rows = input
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (rows.length === 0) return undefined;
	const result: Record<string, string> = {};
	for (const row of rows) {
		const separator = row.indexOf("=");
		if (separator === -1) continue;
		const key = row.slice(0, separator).trim();
		const value = row.slice(separator + 1).trim();
		if (key) result[key] = value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function formatNumber(value: number | null | undefined) {
	return typeof value === "number" && value > 0
		? new Intl.NumberFormat().format(value)
		: null;
}

function timeAgo(dateStr: string | null) {
	if (!dateStr) return null;
	const diffMs = Date.now() - new Date(dateStr).getTime();
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDays = Math.floor(diffHr / 24);
	return `${diffDays}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CapabilityBadge({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
			{label}
		</span>
	);
}

function ModelCapabilities({
	capabilities,
	contextWindow,
	maxOutputTokens,
	inputTokenCost,
	outputTokenCost,
	hostedBy,
	enabled,
}: {
	capabilities?: Record<string, boolean> | null;
	contextWindow?: number | null;
	maxOutputTokens?: number | null;
	inputTokenCost?: string | null;
	outputTokenCost?: string | null;
	hostedBy?: string | null;
	enabled?: boolean;
}) {
	const caps = capabilities ?? {};
	const contextLabel = formatNumber(contextWindow);
	const maxOutLabel = formatNumber(maxOutputTokens);

	const hasAny =
		enabled === false ||
		hostedBy ||
		contextLabel ||
		maxOutLabel ||
		inputTokenCost ||
		outputTokenCost ||
		Object.values(caps).some(Boolean);

	if (!hasAny) return null;

	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5">
			{enabled === false ? (
				<Badge variant="secondary" className="text-xs">
					Disabled
				</Badge>
			) : null}
			{hostedBy ? (
				<Badge variant="secondary" className="text-xs">
					{hostedBy}
				</Badge>
			) : null}
			{contextLabel ? (
				<span className="text-xs text-muted-foreground">
					Context {contextLabel}
				</span>
			) : null}
			{maxOutLabel ? (
				<span className="text-xs text-muted-foreground">
					Max out {maxOutLabel}
				</span>
			) : null}
			{inputTokenCost ? (
				<span className="text-xs text-muted-foreground">
					↗ {inputTokenCost}
				</span>
			) : null}
			{outputTokenCost ? (
				<span className="text-xs text-muted-foreground">
					↘ {outputTokenCost}
				</span>
			) : null}
			{caps.text ? <CapabilityBadge label="text" /> : null}
			{caps.vision ? <CapabilityBadge label="vision" /> : null}
			{caps.tools ? <CapabilityBadge label="tools" /> : null}
			{caps.reasoning ? <CapabilityBadge label="reasoning" /> : null}
			{caps.embeddings ? <CapabilityBadge label="embeddings" /> : null}
			{caps.audio ? <CapabilityBadge label="audio" /> : null}
		</div>
	);
}

function HealthIndicator({
	status,
	lastChecked,
}: {
	status: string | null;
	lastChecked: string | null;
}) {
	const dotColor =
		status === "healthy"
			? "bg-emerald-500"
			: status === "unhealthy"
				? "bg-red-500"
				: "bg-muted-foreground/40";
	const label =
		status === "healthy"
			? "Online"
			: status === "unhealthy"
				? "Failed"
				: "Unknown";

	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<span
				className={cn("size-2 shrink-0 rounded-full", dotColor)}
				aria-hidden="true"
			/>
			{label}
			{lastChecked ? (
				<span className="hidden text-muted-foreground/70 sm:inline">
					· {timeAgo(lastChecked)}
				</span>
			) : null}
		</span>
	);
}

function ProviderTypeIcon({
	kind,
	className,
}: {
	kind: ProviderKind;
	className?: string;
}) {
	const Icon = KIND_ICONS[kind];
	const colors = kindAccent(kind);
	return (
		<div
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-lg",
				colors.iconBg,
				colors.text,
				className,
			)}
		>
			<Icon className="size-4" />
		</div>
	);
}

function ProviderCardSkeleton() {
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<Skeleton className="size-8 rounded-lg" />
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-3 w-64" />
			</div>
		</div>
	);
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function MetricCell({
	label,
	value,
	accent = false,
}: {
	label: string;
	value: string | number;
	accent?: boolean;
}) {
	return (
		<div>
			<p
				className={cn(
					"text-2xl font-bold leading-none",
					accent ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
				)}
			>
				{value}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{label}</p>
		</div>
	);
}

function SystemStrip({
	providers,
	models,
}: {
	providers: SafeProvider[];
	models: ProviderModel[];
}) {
	const healthyCount = providers.filter(
		(p) => p.healthStatus === "healthy",
	).length;
	const enabledCount = providers.filter((p) => p.enabled).length;
	const totalModels = providers.reduce(
		(sum, p) => sum + models.filter((m) => m.providerId === p.id).length,
		0,
	);

	return (
		<div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
			<MetricCell label="Connections" value={providers.length} />
			<MetricCell label="Models" value={totalModels} />
			<MetricCell label="Healthy" value={healthyCount} accent />
			<MetricCell label="Enabled" value={enabledCount} />
		</div>
	);
}

function StatsSidebar({
	models,
	selectedProvider,
}: {
	models: ProviderModel[];
	selectedProvider: SafeProvider | null;
}) {
	const enabledModels = models.filter((m) => m.enabled).length;

	return (
		<aside className="lg:sticky lg:top-6">
			<div className="rounded-xl border bg-card">
				<div className="border-b bg-muted/30 px-5 py-3">
					<p className="text-xs font-medium text-muted-foreground">
						Connection details
					</p>
				</div>
				{selectedProvider ? (
					<div className="divide-y">
						<div className="px-5 py-4">
							<div className="flex items-center gap-3">
								<ProviderTypeIcon kind={selectedProvider.kind} />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-semibold">
										{selectedProvider.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{KIND_LABELS[selectedProvider.kind]}
									</p>
								</div>
							</div>
						</div>
						<div className="grid grid-cols-2 divide-x">
							<div className="px-5 py-4">
								<p className="text-xl font-bold">{models.length}</p>
								<p className="text-xs text-muted-foreground">models</p>
							</div>
							<div className="px-5 py-4">
								<p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
									{enabledModels}
								</p>
								<p className="text-xs text-muted-foreground">enabled</p>
							</div>
						</div>
						<div className="space-y-3 px-5 py-4 text-sm">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Status</span>
								<HealthIndicator
									status={selectedProvider.healthStatus}
									lastChecked={selectedProvider.lastCheckedAt}
								/>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Auth</span>
								<span className="font-medium">
									{AUTH_TYPE_LABELS[selectedProvider.authType]}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">Endpoint</span>
								<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
									{selectedProvider.baseUrl || "default endpoint"}
								</p>
							</div>
						</div>
					</div>
				) : (
					<div className="px-5 py-8 text-sm text-muted-foreground text-center">
						Select a provider to view details.
					</div>
				)}
			</div>
		</aside>
	);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProviderManager({
	workspaceId,
	initialProviders,
	initialModels,
}: {
	workspaceId: string;
	initialProviders: SafeProvider[];
	initialModels: ProviderModel[];
}) {
	// Provider state
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

	// Search
	const [providerSearch, setProviderSearch] = useState("");
	const [modelSearch, setModelSearch] = useState("");

	// Add provider dialog
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

	// Edit provider dialog
	const [editingProvider, setEditingProvider] = useState<SafeProvider | null>(
		null,
	);
	const [editName, setEditName] = useState("");
	const [editBaseUrl, setEditBaseUrl] = useState("");
	const [editApiKey, setEditApiKey] = useState("");

	// Delete confirmations
	const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
	const [deleteModelId, setDeleteModelId] = useState<string | null>(null);

	// Manual model
	const [manualModelId, setManualModelId] = useState("");
	const [manualModelName, setManualModelName] = useState("");

	// Derived
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

	// ─── Data Loading ──────────────────────────────────────────────────────

	const loadProviders = useCallback(async () => {
		setLoadingProviders(true);
		try {
			const res = await fetch(
				`/api/workspace/providers?workspaceId=${workspaceId}`,
			);
			if (!res.ok) throw new Error("Failed to load providers");
			const data = (await res.json()) as SafeProvider[];
			setProviders(data);
			setSelectedProviderId((current) => current ?? data[0]?.id ?? null);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setLoadingProviders(false);
		}
	}, [workspaceId]);

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
				if (!res.ok) throw new Error("Failed to load models");
				setModels((await res.json()) as ProviderModel[]);
			} catch (error) {
				toast.error((error as Error).message);
			} finally {
				setLoadingModels(false);
			}
		},
		[workspaceId],
	);

	function selectProvider(providerId: string) {
		setSelectedProviderId(providerId);
		setDiscoveredModels([]);
		setModelSearch("");
		void loadModelsForProvider(providerId);
	}

	// ─── Provider CRUD ─────────────────────────────────────────────────────

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
				throw new Error(
					data.error ||
						"Unable to connect to the AI service. Check the URL and API key.",
				);
			}
			const provider = (await res.json()) as SafeProvider;
			setProviders((prev) => [provider, ...prev]);
			setSelectedProviderId(provider.id);
			setShowAddDialog(false);
			resetAddForm();
			toast.success("Provider connected");
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
			if (!res.ok) throw new Error(data.error || "Provider test failed");
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
			if (!res.ok) throw new Error("Failed to update provider");
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
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			setEditingProvider(null);
			setEditApiKey("");
			await loadProviders();
			toast.success("Connection updated");
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
			if (!res.ok) throw new Error("Failed to archive provider");
			setProviders((prev) => prev.filter((p) => p.id !== id));
			if (selectedProviderId === id) {
				setSelectedProviderId(null);
				setModels([]);
			}
			setDeleteProviderId(null);
			toast.success("Provider archived");
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	// ─── Model CRUD ────────────────────────────────────────────────────────

	async function createManualModel(model: DiscoveredModel | null = null) {
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
				throw new Error(data.error || "Failed to create model");
			}
			setManualModelId("");
			setManualModelName("");
			toast.success("Model registered");
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
			if (!res.ok) throw new Error(data.error || "Failed to discover models");
			setDiscoveredModels(data as DiscoveredModel[]);
			toast.success(`Discovered ${(data as DiscoveredModel[]).length} models`);
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
			if (!res.ok) throw new Error("Failed to delete model");
			setDeleteModelId(null);
			toast.success("Model removed");
			await loadModelsForProvider(selectedProviderId);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	// ─── Render ────────────────────────────────────────────────────────────

	return (
		<div className="space-y-6">
			{/* ─── Header ──────────────────────────────────────────────────── */}
			<div className="rounded-xl border bg-card p-5 sm:p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold tracking-tight">
							AI Providers
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Connect to AI services and manage available models.
						</p>
					</div>
					<Button
						size="sm"
						onClick={() => {
							resetAddForm();
							setShowAddDialog(true);
						}}
					>
						<PlusIcon className="size-4" aria-hidden="true" />
						New connection
					</Button>
				</div>

				<div className="mt-5">
					<SystemStrip providers={providers} models={models} />
				</div>
			</div>

			{/* ─── Content Grid ────────────────────────────────────────────── */}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-6">
					{/* ─── Providers List ────────────────────────────────────── */}
					<section className="rounded-xl border bg-card">
						<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 className="text-base font-semibold">Connections</h3>
								<p className="text-sm text-muted-foreground">
									{providers.length} provider{providers.length !== 1 ? "s" : ""}{" "}
									configured
								</p>
							</div>
							{providers.length > 2 ? (
								<div className="relative w-56 sm:w-64">
									<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										placeholder="Filter…"
										value={providerSearch}
										onChange={(e) => setProviderSearch(e.target.value)}
										className="h-8 pl-9 text-sm"
									/>
								</div>
							) : null}
						</div>

						{loadingProviders ? (
							<div className="space-y-1 p-2">
								<ProviderCardSkeleton />
								<ProviderCardSkeleton />
							</div>
						) : filteredProviders.length === 0 && providers.length === 0 ? (
							<div className="px-5 py-12 text-center">
								<p className="text-sm font-medium">No connections yet</p>
								<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
									Add your first provider to make models available to your
									assistants.
								</p>
								<Button
									size="sm"
									className="mt-4"
									onClick={() => {
										resetAddForm();
										setShowAddDialog(true);
									}}
								>
									<PlusIcon className="size-4" aria-hidden="true" />
									Add first provider
								</Button>
							</div>
						) : filteredProviders.length === 0 ? (
							<div className="px-5 py-8 text-center text-sm text-muted-foreground">
								No provider matches &ldquo;{providerSearch}&rdquo;.
							</div>
						) : (
							<div className="divide-y">
								{filteredProviders.map((provider) => {
									const colors = kindAccent(provider.kind);
									const isSelected = selectedProviderId === provider.id;
									return (
										<div
											key={provider.id}
											role="button"
											tabIndex={0}
											onClick={() => selectProvider(provider.id)}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													selectProvider(provider.id);
												}
											}}
											className={cn(
												"group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none",
												isSelected ? "bg-muted/50" : "",
											)}
										>
											{/* Accent bar */}
											<div
												className={cn(
													"hidden h-8 w-1 shrink-0 rounded-full sm:block",
													colors.bar,
												)}
											/>

											<ProviderTypeIcon kind={provider.kind} />

											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<p className="truncate text-sm font-medium">
														{provider.name}
													</p>
													{isSelected ? (
														<Badge variant="secondary" className="text-xs">
															Active
														</Badge>
													) : null}
												</div>
												<p className="truncate font-mono text-xs text-muted-foreground">
													{provider.baseUrl || "default endpoint"}
												</p>
											</div>

											<span className="hidden text-xs text-muted-foreground sm:inline">
												{KIND_LABELS[provider.kind]}
											</span>

											<HealthIndicator
												status={provider.healthStatus}
												lastChecked={provider.lastCheckedAt}
											/>

											<div
												className="shrink-0"
												onClick={(e) => e.stopPropagation()}
											>
												<Switch
													checked={provider.enabled}
													onCheckedChange={() => toggleProvider(provider)}
													size="sm"
													aria-label={
														provider.enabled
															? "Disable provider"
															: "Enable provider"
													}
												/>
											</div>

											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														size="icon-sm"
														variant="ghost"
														className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
														onClick={(e) => e.stopPropagation()}
														aria-label="Provider actions"
													>
														<MoreHorizontalIcon className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => {
															setEditingProvider(provider);
															setEditName(provider.name);
															setEditBaseUrl(provider.baseUrl ?? "");
															setEditApiKey("");
														}}
													>
														Edit connection
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={busy}
														onClick={() => testProvider(provider.id)}
													>
														<RefreshCwIcon className="size-4" />
														Test connection
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														variant="destructive"
														onClick={() => setDeleteProviderId(provider.id)}
													>
														<Trash2Icon className="size-4" />
														Archive provider
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									);
								})}
							</div>
						)}
					</section>

					{/* ─── Models Section ────────────────────────────────────── */}
					{selectedProvider ? (
						<section className="rounded-xl border bg-card">
							<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<h3 className="text-base font-semibold">Models</h3>
									<p className="text-sm text-muted-foreground">
										Registered models for{" "}
										<span className="font-medium text-foreground">
											{selectedProvider.name}
										</span>
									</p>
								</div>
								<Button
									size="sm"
									variant="outline"
									disabled={busy}
									onClick={discoverProviderModels}
								>
									<RefreshCwIcon className="size-4" aria-hidden="true" />
									Discover
								</Button>
							</div>

							{/* Manual add form */}
							<div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_1fr_auto]">
								<div className="grid gap-1.5">
									<Label htmlFor="model-id" className="text-xs">
										Model ID
									</Label>
									<Input
										id="model-id"
										autoComplete="off"
										value={manualModelId}
										onChange={(e) => setManualModelId(e.target.value)}
										placeholder="gpt-4o-mini"
										className="font-mono text-sm"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="model-display-name" className="text-xs">
										Display name
									</Label>
									<Input
										id="model-display-name"
										autoComplete="off"
										value={manualModelName}
										onChange={(e) => setManualModelName(e.target.value)}
										placeholder="GPT-4o mini"
										className="text-sm"
									/>
								</div>
								<div className="flex items-end">
									<Button
										size="sm"
										disabled={busy || !manualModelId}
										onClick={() => createManualModel()}
									>
										<PlusIcon className="size-4" aria-hidden="true" />
										Add
									</Button>
								</div>
							</div>

							{/* Discovered models */}
							{discoveredModels.length > 0 ? (
								<div className="border-b bg-muted/15 p-4">
									<p className="mb-2 text-xs font-medium text-muted-foreground">
										Discovered ({discoveredModels.length})
									</p>
									<div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-background">
										{discoveredModels.map((model) => {
											const alreadyRegistered = models.some(
												(m) => m.modelId === model.modelId,
											);
											return (
												<div
													key={model.modelId}
													className={cn(
														"flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0",
														alreadyRegistered
															? "opacity-50"
															: "hover:bg-muted/30",
													)}
												>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium">
															{model.displayName || model.modelId}
														</p>
														<p className="truncate font-mono text-xs text-muted-foreground">
															{model.modelId}
														</p>
														{model.description ? (
															<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
																{model.description}
															</p>
														) : null}
														<ModelCapabilities
															capabilities={model.capabilities}
															contextWindow={model.contextWindow}
															maxOutputTokens={model.maxOutputTokens}
															inputTokenCost={model.inputTokenCost}
															outputTokenCost={model.outputTokenCost}
															hostedBy={model.hostedBy}
														/>
													</div>
													<Button
														size="xs"
														variant="outline"
														disabled={busy || alreadyRegistered}
														onClick={() => createManualModel(model)}
													>
														{alreadyRegistered ? "Added" : "Add"}
													</Button>
												</div>
											);
										})}
									</div>
								</div>
							) : null}

							{/* Registered models list */}
							<div className="p-4">
								{models.length > 3 ? (
									<div className="relative mb-3">
										<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											placeholder="Filter models…"
											value={modelSearch}
											onChange={(e) => setModelSearch(e.target.value)}
											className="h-8 pl-9 text-sm"
										/>
									</div>
								) : null}
								{loadingModels ? (
									<div className="space-y-2">
										<Skeleton className="h-11 w-full" />
										<Skeleton className="h-11 w-full" />
									</div>
								) : filteredModels.length === 0 && models.length === 0 ? (
									<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
										No models registered yet.
									</div>
								) : filteredModels.length === 0 ? (
									<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
										No model matches &ldquo;{modelSearch}&rdquo;.
									</div>
								) : (
									<div className="divide-y rounded-lg border">
										{filteredModels.map((model) => (
											<div
												key={model.id}
												className="group flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
											>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium">
														{model.displayName || model.modelId}
													</p>
													<p className="truncate font-mono text-xs text-muted-foreground">
														{model.modelId}
													</p>
													<ModelCapabilities
														capabilities={model.capabilitiesJson}
														contextWindow={model.contextWindow}
														maxOutputTokens={model.maxOutputTokens}
														inputTokenCost={model.inputTokenCost}
														outputTokenCost={model.outputTokenCost}
														enabled={model.enabled}
													/>
												</div>
												<Button
													size="icon-xs"
													variant="ghost"
													aria-label="Remove model"
													className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
													onClick={() => setDeleteModelId(model.id)}
												>
													<Trash2Icon className="size-3.5" />
												</Button>
											</div>
										))}
									</div>
								)}
							</div>
						</section>
					) : providers.length > 0 && !loadingProviders ? (
						<div className="rounded-xl border border-dashed bg-card p-8 text-center">
							<p className="text-sm text-muted-foreground">
								Select a provider to manage its models.
							</p>
						</div>
					) : null}
				</div>

				{/* ─── Sidebar ─────────────────────────────────────────────── */}
				<div className="space-y-6">
					<StatsSidebar models={models} selectedProvider={selectedProvider} />
				</div>
			</div>

			{/* ─── Add Provider Dialog ─────────────────────────────────────── */}
			<Dialog
				open={showAddDialog}
				onOpenChange={(open) => {
					setShowAddDialog(open);
					if (!open) resetAddForm();
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Connect AI provider</DialogTitle>
						<DialogDescription>
							Add an AI service connection for your agents to use.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="add-provider-name">Name</Label>
							<Input
								id="add-provider-name"
								autoComplete="off"
								value={addName}
								onChange={(e) => setAddName(e.target.value)}
								placeholder="Production OpenAI"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-provider-url">Service URL</Label>
							<Input
								id="add-provider-url"
								type="url"
								autoComplete="off"
								value={addBaseUrl}
								onChange={(e) => setAddBaseUrl(e.target.value)}
								placeholder="https://api.openai.com/v1"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-provider-key">API key</Label>
							<Input
								id="add-provider-key"
								type="password"
								autoComplete="off"
								value={addApiKey}
								onChange={(e) => setAddApiKey(e.target.value)}
								placeholder="sk-…"
							/>
						</div>

						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="self-start px-0 text-xs"
							onClick={() => setAddAdvanced((v) => !v)}
						>
							{addAdvanced ? "Hide advanced options" : "Show advanced options"}
						</Button>

						{addAdvanced ? (
							<div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="grid gap-2">
										<Label htmlFor="add-provider-kind">Provider type</Label>
										<Select
											value={addKind}
											onValueChange={(value) => {
												setAddKind(value as ProviderKind);
												setAddAuthType(defaultAuthType(value as ProviderKind));
											}}
										>
											<SelectTrigger id="add-provider-kind">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(KIND_LABELS).map(([value, label]) => (
													<SelectItem key={value} value={value}>
														{label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="add-provider-auth">Authentication</Label>
										<Select
											value={addAuthType}
											onValueChange={(value) =>
												setAddAuthType(value as ProviderAuthType)
											}
										>
											<SelectTrigger id="add-provider-auth">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(AUTH_TYPE_LABELS).map(
													([value, label]) => (
														<SelectItem key={value} value={value}>
															{label}
														</SelectItem>
													),
												)}
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="grid gap-2">
										<Label htmlFor="add-headers">Custom headers</Label>
										<Textarea
											id="add-headers"
											autoComplete="off"
											value={addCustomHeaders}
											onChange={(e) => setAddCustomHeaders(e.target.value)}
											placeholder="X-Team=ai-platform"
											className="min-h-20 font-mono text-xs"
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="add-query">Query params</Label>
										<Textarea
											id="add-query"
											autoComplete="off"
											value={addQueryParams}
											onChange={(e) => setAddQueryParams(e.target.value)}
											placeholder="api-version=2024-10-21"
											className="min-h-20 font-mono text-xs"
										/>
									</div>
								</div>
							</div>
						) : null}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowAddDialog(false)}>
							Cancel
						</Button>
						<Button
							disabled={busy || !addName.trim()}
							onClick={createNewProvider}
						>
							{busy ? (
								<Loader2Icon className="animate-spin" aria-hidden="true" />
							) : (
								<PlusIcon className="size-4" aria-hidden="true" />
							)}
							Connect provider
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ─── Edit Provider Dialog ────────────────────────────────────── */}
			<Dialog
				open={Boolean(editingProvider)}
				onOpenChange={() => setEditingProvider(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit connection</DialogTitle>
						<DialogDescription>
							Update the details for &ldquo;{editingProvider?.name}&rdquo;.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label>Name</Label>
							<Input
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label>Service URL</Label>
							<Input
								value={editBaseUrl}
								onChange={(e) => setEditBaseUrl(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label>
								New API key{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								type="password"
								value={editApiKey}
								onChange={(e) => setEditApiKey(e.target.value)}
								placeholder="Leave blank to keep current key"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditingProvider(null)}>
							Cancel
						</Button>
						<Button disabled={busy} onClick={() => void saveProviderEdit()}>
							Save changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ─── Delete Provider Confirmation ────────────────────────────── */}
			<AlertDialog
				open={Boolean(deleteProviderId)}
				onOpenChange={() => setDeleteProviderId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive this connection?</AlertDialogTitle>
						<AlertDialogDescription>
							The provider will be archived. Existing agent versions may keep
							references to its models.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={busy}
							onClick={() =>
								deleteProviderId && void deleteProvider(deleteProviderId)
							}
						>
							Archive
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* ─── Delete Model Confirmation ───────────────────────────────── */}
			<AlertDialog
				open={Boolean(deleteModelId)}
				onOpenChange={() => setDeleteModelId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove this model?</AlertDialogTitle>
						<AlertDialogDescription>
							The model will be removed from this provider. Assistants already
							bound to it may need reconfiguration.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={busy}
							onClick={() => deleteModelId && void deleteModel(deleteModelId)}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
