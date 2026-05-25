"use client";

import { useCallback, useMemo, useState } from "react";
import {
    CheckCircle2Icon,
    KeyRoundIcon,
    Loader2Icon,
    PlusIcon,
    PlugZapIcon,
    RefreshCwIcon,
    Trash2Icon,
    XCircleIcon,
} from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
    enabled: boolean;
};

type DiscoveredModel = {
    modelId: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
    contextWindow?: number;
    maxOutputTokens?: number;
};

const KIND_LABELS: Record<ProviderKind, string> = {
    "openai-compatible": "OpenAI-compatible",
    dragonfly: "Dragonfly",
    "vercel-ai-gateway": "Vercel AI Gateway",
    native: "Native",
};

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

function healthBadge(status: string | null) {
    if (status === "healthy") {
        return (
            <Badge variant="secondary" className="gap-1 text-emerald-600">
                <CheckCircle2Icon className="size-3" /> Healthy
            </Badge>
        );
    }

    if (status === "unhealthy") {
        return (
            <Badge variant="secondary" className="gap-1 text-destructive">
                <XCircleIcon className="size-3" /> Unhealthy
            </Badge>
        );
    }

    return <Badge variant="outline">Untested</Badge>;
}

export function ProviderManager({
    workspaceId,
    initialProviders,
    initialModels,
}: {
    workspaceId: string;
    initialProviders: SafeProvider[];
    initialModels: ProviderModel[];
}) {
    const [providers, setProviders] =
        useState<SafeProvider[]>(initialProviders);
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
    const [showProviderForm, setShowProviderForm] = useState(false);

    const [kind, setKind] = useState<ProviderKind>("openai-compatible");
    const [name, setName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [customHeaders, setCustomHeaders] = useState("");
    const [queryParams, setQueryParams] = useState("");

    const [manualModelId, setManualModelId] = useState("");
    const [manualModelName, setManualModelName] = useState("");

    const selectedProvider = useMemo(
        () =>
            providers.find((provider) => provider.id === selectedProviderId) ??
            null,
        [providers, selectedProviderId],
    );

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
        void loadModelsForProvider(providerId);
    }

    async function createNewProvider() {
        setBusy(true);
        try {
            const authType = defaultAuthType(kind);
            const res = await fetch("/api/workspace/providers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    kind,
                    name,
                    baseUrl,
                    authType,
                    apiKey,
                    headersJson: parsePairs(customHeaders),
                    queryParamsJson: parsePairs(queryParams),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to create provider");
            }

            const provider = (await res.json()) as SafeProvider;
            setProviders((prev) => [provider, ...prev]);
            setSelectedProviderId(provider.id);
            setShowProviderForm(false);
            setName("");
            setBaseUrl("");
            setApiKey("");
            setCustomHeaders("");
            setQueryParams("");
            toast.success("Provider created");
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function testProvider(providerId: string) {
        setBusy(true);
        try {
            const res = await fetch(
                `/api/workspace/providers/${providerId}/test`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId }),
                },
            );
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
                body: JSON.stringify({
                    workspaceId,
                    enabled: !provider.enabled,
                }),
            });
            if (!res.ok) throw new Error("Failed to update provider");
            await loadProviders();
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function deleteProvider(providerId: string) {
        if (
            !window.confirm(
                "Archive this provider? Existing agent versions may keep references.",
            )
        )
            return;
        setBusy(true);
        try {
            const res = await fetch(
                `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
                { method: "DELETE" },
            );
            if (!res.ok) throw new Error("Failed to archive provider");
            setProviders((prev) => prev.filter((p) => p.id !== providerId));
            if (selectedProviderId === providerId) setSelectedProviderId(null);
            toast.success("Provider archived");
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function createManualModel(model: DiscoveredModel | null = null) {
        if (!selectedProviderId) return;
        const modelId = model?.modelId ?? manualModelId;
        const displayName = model?.displayName ?? manualModelName ?? modelId;
        if (!modelId) return;

        setBusy(true);
        try {
            const res = await fetch(
                `/api/workspace/providers/${selectedProviderId}/models`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId,
                        modelId,
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
            if (!res.ok)
                throw new Error(data.error || "Failed to discover models");
            setDiscoveredModels(data as DiscoveredModel[]);
            toast.success(
                `Discovered ${(data as DiscoveredModel[]).length} models`,
            );
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
            toast.success("Model removed");
            await loadModelsForProvider(selectedProviderId);
        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
            <div className="flex flex-col gap-4">
                <Card>
                    <CardHeader className="border-b border-border/70 pb-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                                <CardTitle>Provider registry</CardTitle>
                                <CardDescription>
                                    Secure keys, base URLs, health, and provider
                                    model mappings.
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="secondary">
                                    {providers.length} configured
                                </Badge>
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        setShowProviderForm((v) => !v)
                                    }
                                >
                                    <PlusIcon
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Add provider
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-5">
                        {showProviderForm ? (
                            <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="provider-kind">
                                            Provider type
                                        </Label>
                                        <select
                                            id="provider-kind"
                                            value={kind}
                                            onChange={(event) =>
                                                setKind(
                                                    event.target
                                                        .value as ProviderKind,
                                                )
                                            }
                                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                                        >
                                            {Object.entries(KIND_LABELS).map(
                                                ([value, label]) => (
                                                    <option
                                                        key={value}
                                                        value={value}
                                                    >
                                                        {label}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="provider-name">
                                            Name
                                        </Label>
                                        <Input
                                            id="provider-name"
                                            value={name}
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            placeholder="Production OpenAI"
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="provider-base-url">
                                        Base URL
                                    </Label>
                                    <Input
                                        id="provider-base-url"
                                        value={baseUrl}
                                        onChange={(e) =>
                                            setBaseUrl(e.target.value)
                                        }
                                        placeholder="https://api.openai.com"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="provider-api-key">
                                        API key
                                    </Label>
                                    <Input
                                        id="provider-api-key"
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) =>
                                            setApiKey(e.target.value)
                                        }
                                        placeholder="Stored encrypted at rest"
                                    />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="provider-headers">
                                            Custom headers
                                        </Label>
                                        <textarea
                                            id="provider-headers"
                                            value={customHeaders}
                                            onChange={(e) =>
                                                setCustomHeaders(e.target.value)
                                            }
                                            placeholder="X-Team=ai-platform"
                                            className="min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="provider-query">
                                            Query params
                                        </Label>
                                        <textarea
                                            id="provider-query"
                                            value={queryParams}
                                            onChange={(e) =>
                                                setQueryParams(e.target.value)
                                            }
                                            placeholder="api-version=2024-10-21"
                                            className="min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() =>
                                            setShowProviderForm(false)
                                        }
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={busy || !name}
                                        onClick={createNewProvider}
                                    >
                                        {busy ? (
                                            <Loader2Icon className="animate-spin" />
                                        ) : (
                                            <PlusIcon />
                                        )}
                                        Save provider
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {loadingProviders ? (
                            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                                <Loader2Icon className="mr-2 size-4 animate-spin" />{" "}
                                Loading providers…
                            </div>
                        ) : providers.length === 0 ? (
                            <Empty className="min-h-80 border border-border/70 bg-background/55">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <PlugZapIcon aria-hidden="true" />
                                    </EmptyMedia>
                                    <EmptyTitle>
                                        No providers configured
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        Add an OpenAI-compatible, Dragonfly, or
                                        Vercel AI Gateway provider to power your
                                        agents.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() =>
                                            setShowProviderForm(true)
                                        }
                                    >
                                        <PlusIcon
                                            data-icon="inline-start"
                                            aria-hidden="true"
                                        />{" "}
                                        Add provider
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        ) : (
                            <div className="grid gap-3">
                                {providers.map((provider) => (
                                    <div
                                        key={provider.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() =>
                                            selectProvider(provider.id)
                                        }
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" ||
                                                event.key === " "
                                            ) {
                                                event.preventDefault();
                                                selectProvider(provider.id);
                                            }
                                        }}
                                        className={cn(
                                            "cursor-pointer rounded-2xl border p-4 text-left transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                            selectedProviderId === provider.id
                                                ? "border-primary/50 bg-primary/5"
                                                : "border-border/70 bg-background/55 hover:bg-muted/40",
                                        )}
                                    >
                                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold">
                                                        {provider.name}
                                                    </h3>
                                                    {healthBadge(
                                                        provider.healthStatus,
                                                    )}
                                                    {!provider.enabled ? (
                                                        <Badge variant="outline">
                                                            Disabled
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {KIND_LABELS[provider.kind]}{" "}
                                                    · {provider.authType} ·{" "}
                                                    {provider.baseUrl ||
                                                        "default endpoint"}
                                                </p>
                                            </div>
                                            <div
                                                className="flex flex-wrap gap-2"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        testProvider(
                                                            provider.id,
                                                        )
                                                    }
                                                >
                                                    <RefreshCwIcon /> Test
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        toggleProvider(provider)
                                                    }
                                                >
                                                    {provider.enabled
                                                        ? "Disable"
                                                        : "Enable"}
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="destructive"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        deleteProvider(
                                                            provider.id,
                                                        )
                                                    }
                                                >
                                                    <Trash2Icon /> Archive
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {selectedProvider ? (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                <div>
                                    <CardTitle>Model registry</CardTitle>
                                    <CardDescription>
                                        Add model IDs manually or discover
                                        supported models from{" "}
                                        {selectedProvider.name}.
                                    </CardDescription>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={discoverProviderModels}
                                >
                                    <RefreshCwIcon data-icon="inline-start" />{" "}
                                    Discover
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 sm:grid-cols-[1fr_1fr_auto]">
                                <div className="grid gap-2">
                                    <Label htmlFor="model-id">Model ID</Label>
                                    <Input
                                        id="model-id"
                                        value={manualModelId}
                                        onChange={(e) =>
                                            setManualModelId(e.target.value)
                                        }
                                        placeholder="gpt-4o-mini"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="model-name">
                                        Display name
                                    </Label>
                                    <Input
                                        id="model-name"
                                        value={manualModelName}
                                        onChange={(e) =>
                                            setManualModelName(e.target.value)
                                        }
                                        placeholder="GPT-4o mini"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        disabled={busy || !manualModelId}
                                        onClick={() => createManualModel()}
                                    >
                                        <PlusIcon /> Add
                                    </Button>
                                </div>
                            </div>

                            {discoveredModels.length > 0 ? (
                                <div className="rounded-2xl border border-border/70 p-4">
                                    <p className="mb-3 text-sm font-medium">
                                        Discovered models
                                    </p>
                                    <div className="grid gap-2">
                                        {discoveredModels
                                            .slice(0, 12)
                                            .map((model) => (
                                                <div
                                                    key={model.modelId}
                                                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                                                >
                                                    <span className="truncate text-sm">
                                                        {model.displayName ||
                                                            model.modelId}
                                                    </span>
                                                    <Button
                                                        size="xs"
                                                        variant="outline"
                                                        disabled={
                                                            busy ||
                                                            models.some(
                                                                (m) =>
                                                                    m.modelId ===
                                                                    model.modelId,
                                                            )
                                                        }
                                                        onClick={() =>
                                                            createManualModel(
                                                                model,
                                                            )
                                                        }
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ) : null}

                            <Separator />

                            {loadingModels ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    Loading models…
                                </div>
                            ) : models.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
                                    No models registered for this provider yet.
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {models.map((model) => (
                                        <div
                                            key={model.id}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/55 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">
                                                    {model.displayName ||
                                                        model.modelId}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {model.modelId}
                                                </p>
                                            </div>
                                            <Button
                                                size="icon-xs"
                                                variant="ghost"
                                                aria-label="Remove model"
                                                onClick={() =>
                                                    deleteModel(model.id)
                                                }
                                            >
                                                <Trash2Icon />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : null}
            </div>

            <div className="flex flex-col gap-4">
                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRoundIcon
                                className="size-4 text-primary"
                                aria-hidden="true"
                            />
                            Secret handling
                        </CardTitle>
                        <CardDescription>
                            API keys and custom header values are encrypted
                            before storage and are never returned to the
                            browser.
                        </CardDescription>
                    </CardHeader>
                </Card>
                <Card size="sm">
                    <CardHeader>
                        <CardTitle>Supported types</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        {Object.values(KIND_LABELS)
                            .filter((label) => label !== "Native")
                            .map((type) => (
                                <Badge key={type} variant="outline">
                                    {type}
                                </Badge>
                            ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
