"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	CheckCircle2Icon,
	Loader2,
	MessageSquareIcon,
	PlugZapIcon,
	PlusIcon,
	RefreshCwIcon,
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
	Field,
	FieldContent,
	FieldDescription,
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
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const steps = [
	{ id: "provider", icon: PlugZapIcon },
	{ id: "model", icon: CheckCircle2Icon },
	{ id: "agent", icon: MessageSquareIcon },
] as const;

type StepId = (typeof steps)[number]["id"];
type ProviderKind = "openai-compatible" | "dragonfly" | "vercel-ai-gateway";
type ProviderAuthType = "bearer" | "x-api-key" | "gateway";

type ProviderSummary = {
	id: string;
	name: string;
	kind: ProviderKind;
};

type ProviderModel = {
	id: string;
	modelId: string;
	displayName: string | null;
	capabilitiesJson?: Record<string, boolean> | null;
	contextWindow?: number | null;
	maxOutputTokens?: number | null;
	inputTokenCost?: string | null;
	outputTokenCost?: string | null;
	enabled?: boolean;
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

function slugify(value: string) {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "assistant"
	);
}

function defaultAuthType(kind: ProviderKind): ProviderAuthType {
	if (kind === "dragonfly") return "x-api-key";
	if (kind === "vercel-ai-gateway") return "gateway";
	return "bearer";
}

function formatModelNumber(value: number | null | undefined) {
	return typeof value === "number" && value > 0
		? new Intl.NumberFormat().format(value)
		: null;
}

function ModelMetadata({
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
	const t = useTranslations("setup.modelMetadata");
	const enabledCapabilities = Object.entries(capabilities ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key);
	const contextWindowLabel = formatModelNumber(contextWindow);
	const maxOutputTokensLabel = formatModelNumber(maxOutputTokens);

	if (
		enabled !== false &&
		!hostedBy &&
		!contextWindowLabel &&
		!maxOutputTokensLabel &&
		!inputTokenCost &&
		!outputTokenCost &&
		enabledCapabilities.length === 0
	) {
		return null;
	}

	return (
		<div className="mt-2 flex flex-wrap gap-1.5">
			{enabled === false ? (
				<Badge variant="outline">{t("disabled")}</Badge>
			) : null}
			{hostedBy ? <Badge variant="outline">{hostedBy}</Badge> : null}
			{contextWindowLabel ? (
				<Badge variant="outline">
					{t("context", { value: contextWindowLabel })}
				</Badge>
			) : null}
			{maxOutputTokensLabel ? (
				<Badge variant="outline">
					{t("maxOutput", { value: maxOutputTokensLabel })}
				</Badge>
			) : null}
			{inputTokenCost ? (
				<Badge variant="outline">{t("input", { value: inputTokenCost })}</Badge>
			) : null}
			{outputTokenCost ? (
				<Badge variant="outline">
					{t("output", { value: outputTokenCost })}
				</Badge>
			) : null}
			{enabledCapabilities.map((capability) => (
				<Badge key={capability} variant="secondary" className="capitalize">
					{capability}
				</Badge>
			))}
		</div>
	);
}

/* ── Stepper ── */

function SetupStepper({ currentStep }: { currentStep: StepId }) {
	const t = useTranslations("setup.steps");
	const stepIndex = steps.findIndex((s) => s.id === currentStep);

	return (
		<div className="-mx-1 overflow-x-auto px-1 pb-1">
			<div className="flex min-w-max items-center gap-0">
				{steps.map((item, i) => {
					const isActive = i === stepIndex;
					const isComplete = i < stepIndex;

					return (
						<div key={item.id} className="flex items-center gap-0">
							<div
								className={cn(
									"flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out",
									isComplete
										? "border-primary/30 bg-primary/8 text-primary"
										: isActive
											? "border-primary bg-primary/6 text-primary shadow-sm shadow-primary/10"
											: "border-border/60 text-muted-foreground",
								)}
							>
								<div
									className={cn(
										"flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
										isComplete
											? "bg-primary text-primary-foreground"
											: isActive
												? "bg-primary/20 text-primary"
												: "bg-muted text-muted-foreground",
									)}
								>
									{isComplete ? (
										<CheckCircle2Icon className="size-3.5" aria-hidden="true" />
									) : (
										i + 1
									)}
								</div>
								<span
									className={cn(
										"font-medium",
										!isActive && !isComplete && "text-muted-foreground",
									)}
								>
									{t(item.id)}
								</span>
							</div>
							{i < steps.length - 1 ? (
								<div
									className={cn(
										"mx-2 h-px w-8 sm:w-16 transition-colors",
										i < stepIndex ? "bg-primary/40" : "bg-border/60",
									)}
								/>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/* ── Wizard ── */

export type SetupWizardProps = {
	mode?: "page" | "dialog";
	initialAgentId?: string | null;
	onCompleteAction?: (agentId: string) => void;
	onCancelAction?: () => void;
};

export function SetupWizard({
	mode = "page",
	initialAgentId = null,
	onCompleteAction,
	onCancelAction,
}: SetupWizardProps) {
	const t = useTranslations("setup");
	const { workspaceId } = useWorkspace();
	const [step, setStep] = useState<StepId>("provider");
	const [providers, setProviders] = useState<ProviderSummary[]>([]);
	const [providerId, setProviderId] = useState<string | null>(null);
	const [modelDbId, setModelDbId] = useState<string | null>(null);
	const [agentId, setAgentId] = useState<string | null>(initialAgentId);
	const [busy, setBusy] = useState(false);
	const [loadingProviders, setLoadingProviders] = useState(true);
	const [loadingModels, setLoadingModels] = useState(false);
	const [discoveringModels, setDiscoveringModels] = useState(false);
	const [models, setModels] = useState<ProviderModel[]>([]);
	const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
		[],
	);
	const [providerForm, setProviderForm] = useState<{
		name: string;
		kind: ProviderKind;
		baseUrl: string;
		apiKey: string;
	}>({
		name: t("defaultProviderName"),
		kind: "openai-compatible",
		baseUrl: "",
		apiKey: "",
	});
	const [manualModelId, setManualModelId] = useState("");
	const [agentForm, setAgentForm] = useState({
		name: t("defaultAssistantName"),
	});

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;

		async function loadProviders() {
			setLoadingProviders(true);
			try {
				const rows = await fetchJson<ProviderSummary[]>(
					`/api/workspace/providers?workspaceId=${workspaceId}`,
				);
				if (cancelled) return;
				setProviders(rows);
				if (rows[0]) {
					setProviderId(rows[0].id);
					setStep("model");
				}
			} catch {
				if (!cancelled) setProviders([]);
			} finally {
				if (!cancelled) setLoadingProviders(false);
			}
		}

		void loadProviders();
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId || !providerId) return;
		let cancelled = false;

		async function loadModels() {
			setLoadingModels(true);
			try {
				const rows = await fetchJson<ProviderModel[]>(
					`/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
				);
				if (cancelled) return;
				setModels(rows);
				setDiscoveredModels([]);
				setModelDbId((current) =>
					current && rows.some((model) => model.id === current)
						? current
						: (rows[0]?.id ?? null),
				);
			} catch {
				if (!cancelled) {
					setModels([]);
					setDiscoveredModels([]);
					setModelDbId(null);
				}
			} finally {
				if (!cancelled) setLoadingModels(false);
			}
		}

		void loadModels();
		return () => {
			cancelled = true;
		};
	}, [workspaceId, providerId]);

	async function discoverProviderModels() {
		if (!workspaceId || !providerId) return;
		setDiscoveringModels(true);
		try {
			const rows = await fetchJson<DiscoveredModel[]>(
				`/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}&action=discover`,
			);
			setDiscoveredModels(rows);
			if (rows.length === 0) {
				toast.info(t("toasts.noModelsReturned"));
			} else {
				toast.success(t("toasts.modelsDiscovered", { count: rows.length }));
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.discoverFailed"),
			);
		} finally {
			setDiscoveringModels(false);
		}
	}

	async function createProvider() {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const provider = await fetchJson<ProviderSummary>(
				"/api/workspace/providers",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						name: providerForm.name,
						kind: providerForm.kind,
						authType: defaultAuthType(providerForm.kind),
						baseUrl: providerForm.baseUrl || undefined,
						apiKey: providerForm.apiKey || undefined,
					}),
				},
			);
			setProviders((current) => [provider, ...current]);
			setProviderId(provider.id);
			setStep("model");
			toast.success(t("toasts.providerSaved"));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("toasts.providerCreateFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function testProvider() {
		if (!workspaceId || !providerId) return;
		setBusy(true);
		try {
			const data = await fetchJson<{ status?: string; message?: string }>(
				`/api/workspace/providers/${providerId}/test`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId }),
				},
			);
			if (data.status === "healthy") {
				toast.success(data.message || t("toasts.connectionVerified"));
			} else {
				toast.error(data.message || t("toasts.connectionIssue"));
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("toasts.connectionTestFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function addAndSelectModel(discoveredModel?: DiscoveredModel) {
		const modelId = discoveredModel?.modelId ?? manualModelId.trim();
		const displayName =
			discoveredModel?.displayName ?? discoveredModel?.modelId ?? modelId;
		if (!workspaceId || !providerId || !modelId) return;
		setBusy(true);
		try {
			const model = await fetchJson<ProviderModel>(
				`/api/workspace/providers/${providerId}/models`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						modelId,
						displayName,
						capabilitiesJson: discoveredModel?.capabilities,
						contextWindow: discoveredModel?.contextWindow,
						maxOutputTokens: discoveredModel?.maxOutputTokens,
						inputTokenCost: discoveredModel?.inputTokenCost,
						outputTokenCost: discoveredModel?.outputTokenCost,
					}),
				},
			);
			setModels((current) => [...current, model]);
			setModelDbId(model.id);
			setManualModelId("");
			toast.success(t("toasts.modelSelected"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.modelAddFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function finishSetup() {
		if (!workspaceId || !providerId || !modelDbId) return;
		setBusy(true);
		try {
			let completedAgentId = agentId;

			if (completedAgentId) {
				await fetchJson(`/api/workspace/agents/${completedAgentId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						providerId,
						modelId: modelDbId,
					}),
				});
			} else {
				const data = await fetchJson<{ agent: { id: string } }>(
					"/api/workspace/agents",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							workspaceId,
							name: agentForm.name,
							slug: slugify(agentForm.name),
							systemPrompt: "",
							providerId,
							modelId: modelDbId,
						}),
					},
				);
				completedAgentId = data.agent.id;
				setAgentId(completedAgentId);
			}

			await fetch("/api/onboarding", { method: "POST" });
			toast.success(t("toasts.assistantReady"));
			if (completedAgentId) onCompleteAction?.(completedAgentId);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.finishFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	if (!workspaceId) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const selectedProvider = providers.find(
		(provider) => provider.id === providerId,
	);
	const selectedModel = models.find((model) => model.id === modelDbId);

	return (
		<div className="flex flex-col gap-6">
			<SetupStepper currentStep={step} />

			{/* ── Step: Provider ── */}
			{step === "provider" && (
				<Card className="animate-in-up">
					<CardHeader>
						<CardTitle className="flex items-center gap-2.5">
							<PlugZapIcon className="size-5 text-primary" aria-hidden="true" />
							{t("providerTitle")}
						</CardTitle>
						<CardDescription>{t("providerStepDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="provider-name">
									{t("connectionName")}
								</FieldLabel>
								<FieldContent>
									<Input
										id="provider-name"
										name="setup-provider-name"
										autoComplete="organization"
										placeholder={t("connectionNamePlaceholder")}
										value={providerForm.name}
										onChange={(event) =>
											setProviderForm({
												...providerForm,
												name: event.target.value,
											})
										}
									/>
								</FieldContent>
							</Field>

							<Field>
								<FieldLabel htmlFor="provider-kind">
									{t("providerType")}
								</FieldLabel>
								<FieldContent>
									<Select
										value={providerForm.kind}
										onValueChange={(value) =>
											setProviderForm({
												...providerForm,
												kind: value as ProviderKind,
											})
										}
									>
										<SelectTrigger id="provider-kind" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="openai-compatible">
												OpenAI-compatible
											</SelectItem>
											<SelectItem value="vercel-ai-gateway">
												Vercel AI Gateway
											</SelectItem>
											<SelectItem value="dragonfly">Dragonfly</SelectItem>
										</SelectContent>
									</Select>
								</FieldContent>
							</Field>

							<Field>
								<FieldLabel htmlFor="base-url">{t("serviceUrl")}</FieldLabel>
								<FieldContent>
									<Input
										id="base-url"
										name="setup-provider-base-url"
										inputMode="url"
										autoComplete="url"
										placeholder="https://api.openai.com/v1"
										value={providerForm.baseUrl}
										onChange={(event) =>
											setProviderForm({
												...providerForm,
												baseUrl: event.target.value,
											})
										}
									/>
									<FieldDescription>{t("serviceUrlHint")}</FieldDescription>
								</FieldContent>
							</Field>

							<Field>
								<FieldLabel htmlFor="api-key">{t("apiKey")}</FieldLabel>
								<FieldContent>
									<Input
										id="api-key"
										name="setup-provider-api-key"
										type="password"
										autoComplete="off"
										placeholder="sk-…"
										value={providerForm.apiKey}
										onChange={(event) =>
											setProviderForm({
												...providerForm,
												apiKey: event.target.value,
											})
										}
									/>
								</FieldContent>
							</Field>

							<div className="flex flex-wrap gap-2 pt-2">
								<Button
									type="button"
									onClick={() => void createProvider()}
									disabled={busy || !providerForm.name.trim()}
								>
									{busy ? (
										<Loader2 className="animate-spin" aria-hidden="true" />
									) : (
										<PlugZapIcon data-icon="inline-start" aria-hidden="true" />
									)}
									{t("saveContinue")}
								</Button>
								{providers.length > 0 ? (
									<Button
										type="button"
										variant="outline"
										disabled={loadingProviders}
										onClick={() => setStep("model")}
									>
										{t("useExistingConnection")}
									</Button>
								) : null}
							</div>
						</FieldGroup>
					</CardContent>
				</Card>
			)}

			{/* ── Step: Model ── */}
			{step === "model" && (
				<Card className="animate-in-up">
					<CardHeader>
						<CardTitle className="flex items-center gap-2.5">
							<CheckCircle2Icon
								className="size-5 text-primary"
								aria-hidden="true"
							/>
							{t("modelTitle")}
						</CardTitle>
						<CardDescription>{t("modelStepDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							{providers.length > 0 ? (
								<Field>
									<FieldLabel htmlFor="setup-provider">
										{t("connection")}
									</FieldLabel>
									<FieldContent>
										<Select
											value={providerId ?? undefined}
											onValueChange={(value) => {
												setProviderId(value);
												setModelDbId(null);
											}}
										>
											<SelectTrigger id="setup-provider" className="w-full">
												<SelectValue placeholder={t("selectConnection")} />
											</SelectTrigger>
											<SelectContent>
												{providers.map((provider) => (
													<SelectItem key={provider.id} value={provider.id}>
														{provider.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FieldContent>
								</Field>
							) : null}

							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => void testProvider()}
									disabled={busy || !providerId}
								>
									{busy ? (
										<Loader2 className="animate-spin" aria-hidden="true" />
									) : (
										<CheckCircle2Icon
											data-icon="inline-start"
											aria-hidden="true"
										/>
									)}
									{t("testConnection")}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => void discoverProviderModels()}
									disabled={discoveringModels || !providerId}
								>
									{discoveringModels ? (
										<Loader2 className="animate-spin" aria-hidden="true" />
									) : (
										<RefreshCwIcon
											data-icon="inline-start"
											aria-hidden="true"
										/>
									)}
									{t("discoverModels")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setStep("provider")}
								>
									{t("changeConnection")}
								</Button>
							</div>

							{/* Discovered models */}
							{discoveredModels.length > 0 && (
								<div className="rounded-xl border border-border/70 overflow-hidden">
									<div className="border-b border-border/60 bg-muted/30 px-4 py-3">
										<p className="text-sm font-medium">
											{t("availableModels", { count: discoveredModels.length })}
										</p>
										<FieldDescription>
											{t("discoveredModelsHint")}
										</FieldDescription>
									</div>
									<div className="max-h-72 overflow-y-auto divide-y divide-border/40">
										{discoveredModels.map((model) => {
											const savedModel = models.find(
												(m) => m.modelId === model.modelId,
											);
											const isSelected = savedModel?.id === modelDbId;
											return (
												<div
													key={model.modelId}
													className={cn(
														"flex items-start justify-between gap-3 px-4 py-3 transition-[background-color] duration-150 ease-out hover:bg-muted/30",
														isSelected && "bg-primary/5",
													)}
												>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="text-sm font-medium">
																{model.displayName || model.modelId}
															</p>
															{isSelected && (
																<Badge
																	variant="secondary"
																	className="bg-primary/10 text-primary"
																>
																	{t("selected")}
																</Badge>
															)}
														</div>
														<p className="truncate text-xs text-muted-foreground">
															{model.modelId}
														</p>
														{model.description && (
															<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
																{model.description}
															</p>
														)}
														<ModelMetadata
															capabilities={model.capabilities}
															contextWindow={model.contextWindow}
															maxOutputTokens={model.maxOutputTokens}
															inputTokenCost={model.inputTokenCost}
															outputTokenCost={model.outputTokenCost}
															hostedBy={model.hostedBy}
														/>
													</div>
													<Button
														type="button"
														size="sm"
														variant={isSelected ? "secondary" : "outline"}
														disabled={busy || isSelected}
														onClick={() => {
															if (savedModel) {
																setModelDbId(savedModel.id);
																toast.success(t("toasts.modelSelected"));
																return;
															}
															void addAndSelectModel(model);
														}}
													>
														{isSelected ? (
															t("selected")
														) : savedModel ? (
															t("useModel")
														) : (
															<>
																<PlusIcon
																	data-icon="inline-start"
																	aria-hidden="true"
																/>
																{t("useModel")}
															</>
														)}
													</Button>
												</div>
											);
										})}
									</div>
								</div>
							)}

							{/* Saved models selector */}
							{models.length > 0 && (
								<Field>
									<FieldLabel htmlFor="setup-model">
										{t("modelForAssistant")}
									</FieldLabel>
									<FieldContent>
										<Select
											value={modelDbId ?? undefined}
											onValueChange={setModelDbId}
											disabled={loadingModels}
										>
											<SelectTrigger id="setup-model" className="w-full">
												<SelectValue placeholder={t("selectModel")} />
											</SelectTrigger>
											<SelectContent>
												{models.map((model) => (
													<SelectItem key={model.id} value={model.id}>
														{model.displayName ?? model.modelId}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{selectedModel && (
											<ModelMetadata
												capabilities={selectedModel.capabilitiesJson}
												contextWindow={selectedModel.contextWindow}
												maxOutputTokens={selectedModel.maxOutputTokens}
												inputTokenCost={selectedModel.inputTokenCost}
												outputTokenCost={selectedModel.outputTokenCost}
												enabled={selectedModel.enabled}
											/>
										)}
									</FieldContent>
								</Field>
							)}

							{/* Manual model ID */}
							<Field>
								<FieldLabel htmlFor="manual-model">
									{t("manualModelLabel")}
								</FieldLabel>
								<FieldContent>
									<div className="flex gap-2">
										<Input
											id="manual-model"
											name="setup-manual-model"
											autoComplete="off"
											placeholder="gpt-4o-mini…"
											value={manualModelId}
											onChange={(event) => setManualModelId(event.target.value)}
										/>
										<Button
											type="button"
											variant="outline"
											disabled={busy || !providerId || !manualModelId.trim()}
											onClick={() => void addAndSelectModel()}
										>
											{t("addModel")}
										</Button>
									</div>
								</FieldContent>
							</Field>

							{models.length === 0 && (
								<FieldDescription>{t("noRegisteredModels")}</FieldDescription>
							)}

							<Button
								type="button"
								className="mt-2"
								onClick={() => setStep("agent")}
								disabled={!modelDbId}
							>
								{t("continue")}
							</Button>
						</FieldGroup>
					</CardContent>
				</Card>
			)}

			{/* ── Step: Agent ── */}
			{step === "agent" && (
				<Card className="animate-in-up">
					<CardHeader>
						<CardTitle className="flex items-center gap-2.5">
							<MessageSquareIcon
								className="size-5 text-primary"
								aria-hidden="true"
							/>
							{t("agentTitle")}
						</CardTitle>
						<CardDescription>{t("agentStepDescription")}</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							{/* Summary */}
							<div className="rounded-xl border border-border/70 bg-muted/30 p-4">
								<div className="flex flex-col gap-2 text-sm">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											{t("connection")}
										</span>
										<span className="font-medium">
											{selectedProvider?.name}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">{t("model")}</span>
										<span className="font-medium">
											{selectedModel?.displayName ?? selectedModel?.modelId}
										</span>
									</div>
								</div>
							</div>

							{agentId ? (
								<FieldDescription>{t("currentAssistantHint")}</FieldDescription>
							) : (
								<Field>
									<FieldLabel htmlFor="agent-name">
										{t("assistantName")}
									</FieldLabel>
									<FieldContent>
										<Input
											id="agent-name"
											name="setup-agent-name"
											autoComplete="off"
											placeholder={t("assistantNamePlaceholder")}
											value={agentForm.name}
											onChange={(event) =>
												setAgentForm({ name: event.target.value })
											}
										/>
									</FieldContent>
								</Field>
							)}

							<div className="flex flex-wrap gap-2 pt-2">
								<Button
									type="button"
									onClick={() => void finishSetup()}
									disabled={
										busy || !modelDbId || (!agentId && !agentForm.name.trim())
									}
								>
									{busy ? (
										<Loader2 className="animate-spin" aria-hidden="true" />
									) : (
										<MessageSquareIcon
											data-icon="inline-start"
											aria-hidden="true"
										/>
									)}
									{t("startChat")}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => setStep("model")}
								>
									{t("back")}
								</Button>
								{mode === "page" && (
									<Button variant="ghost" asChild>
										<Link href={agentId ? `/chat?agentId=${agentId}` : "/chat"}>
											{t("skipForNow")}
										</Link>
									</Button>
								)}
							</div>
						</FieldGroup>
					</CardContent>
				</Card>
			)}

			{onCancelAction && (
				<Button type="button" variant="ghost" onClick={onCancelAction}>
					{t("cancel")}
				</Button>
			)}
		</div>
	);
}
