"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
	BotIcon,
	CheckCircle2Icon,
	Loader2,
	MessageSquareIcon,
	PlugZapIcon,
} from "lucide-react";
import { toast } from "sonner";

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

const steps = [
	{ id: "provider", label: "Connect", icon: PlugZapIcon },
	{ id: "model", label: "Model", icon: CheckCircle2Icon },
	{ id: "agent", label: "Assistant", icon: BotIcon },
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

export type SetupWizardProps = {
	mode?: "page" | "dialog";
	initialAgentId?: string | null;
	onComplete?: (agentId: string) => void;
	onCancel?: () => void;
};

export function SetupWizard({
	mode = "page",
	initialAgentId = null,
	onComplete,
	onCancel,
}: SetupWizardProps) {
	const { workspaceId } = useWorkspace();
	const [step, setStep] = useState<StepId>("provider");
	const [providers, setProviders] = useState<ProviderSummary[]>([]);
	const [providerId, setProviderId] = useState<string | null>(null);
	const [modelDbId, setModelDbId] = useState<string | null>(null);
	const [agentId, setAgentId] = useState<string | null>(initialAgentId);
	const [busy, setBusy] = useState(false);
	const [loadingProviders, setLoadingProviders] = useState(true);
	const [loadingModels, setLoadingModels] = useState(false);
	const [models, setModels] = useState<ProviderModel[]>([]);
	const [providerForm, setProviderForm] = useState<{
		name: string;
		kind: ProviderKind;
		baseUrl: string;
		apiKey: string;
	}>({
		name: "OpenAI connection",
		kind: "openai-compatible",
		baseUrl: "",
		apiKey: "",
	});
	const [manualModelId, setManualModelId] = useState("");
	const [agentForm, setAgentForm] = useState({
		name: "My Assistant",
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
				setModelDbId((current) =>
					current && rows.some((model) => model.id === current)
						? current
						: (rows[0]?.id ?? null),
				);
			} catch {
				if (!cancelled) {
					setModels([]);
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

	async function createProvider() {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const provider = await fetchJson<ProviderSummary>("/api/workspace/providers", {
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
			});
			setProviders((current) => [provider, ...current]);
			setProviderId(provider.id);
			setStep("model");
			toast.success("AI connection saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create connection",
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
				toast.success(data.message || "Connection verified");
			} else {
				toast.error(data.message || "Connection test returned an issue");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Connection test failed",
			);
		} finally {
			setBusy(false);
		}
	}

	async function registerModel() {
		if (!workspaceId || !providerId || !manualModelId.trim()) return;
		setBusy(true);
		try {
			const model = await fetchJson<ProviderModel>(
				`/api/workspace/providers/${providerId}/models`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						modelId: manualModelId.trim(),
						displayName: manualModelId.trim(),
					}),
				},
			);
			setModels((current) => [...current, model]);
			setModelDbId(model.id);
			setManualModelId("");
			toast.success("Model added");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to add model",
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
							systemPrompt: "You are a helpful assistant.",
							providerId,
							modelId: modelDbId,
						}),
					},
				);
				completedAgentId = data.agent.id;
				setAgentId(completedAgentId);
			}

			await fetch("/api/onboarding", { method: "POST" });
			toast.success("Assistant is ready");
			if (completedAgentId) onComplete?.(completedAgentId);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to finish setup",
			);
		} finally {
			setBusy(false);
		}
	}

	if (!workspaceId) {
		return (
			<div className="flex items-center justify-center py-10">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const stepIndex = steps.findIndex((item) => item.id === step);
	const selectedProvider = providers.find((provider) => provider.id === providerId);

	return (
		<div className={mode === "page" ? "flex flex-col gap-6" : "flex flex-col gap-4"}>
			<div className="grid grid-cols-3 gap-2">
				{steps.map((item, index) => {
					const Icon = item.icon;
					const isActive = item.id === step;
					const isComplete = index < stepIndex;
					return (
						<div
							key={item.id}
							className={`flex min-h-16 flex-col justify-center rounded-lg border px-3 py-2 text-xs ${
								isActive || isComplete
									? "border-primary/40 bg-primary/5"
									: "border-border/60 text-muted-foreground"
							}`}
						>
							<div className="flex items-center gap-2 font-medium">
								<Icon className="size-4" aria-hidden="true" />
								{item.label}
							</div>
						</div>
					);
				})}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{step === "provider" && "Connect an AI provider"}
						{step === "model" && "Choose the model"}
						{step === "agent" && "Create your assistant"}
					</CardTitle>
					<CardDescription>
						{step === "provider" &&
							"Add one connection. Advanced routing and extra providers can wait."}
						{step === "model" &&
							"Use an existing model or add the model ID your provider supports."}
						{step === "agent" &&
							"Name the assistant. You can add tools and knowledge later."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{step === "provider" ? (
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="provider-name">Connection name</FieldLabel>
								<FieldContent>
									<Input
										id="provider-name"
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
								<FieldLabel htmlFor="provider-kind">Provider type</FieldLabel>
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
								<FieldLabel htmlFor="base-url">Service URL</FieldLabel>
								<FieldContent>
									<Input
										id="base-url"
										placeholder="https://api.openai.com/v1"
										value={providerForm.baseUrl}
										onChange={(event) =>
											setProviderForm({
												...providerForm,
												baseUrl: event.target.value,
											})
										}
									/>
									<FieldDescription>
										Leave blank only if your selected provider has a default
										endpoint.
									</FieldDescription>
								</FieldContent>
							</Field>
							<Field>
								<FieldLabel htmlFor="api-key">API key</FieldLabel>
								<FieldContent>
									<Input
										id="api-key"
										type="password"
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
							<div className="flex flex-wrap gap-2">
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
									Save connection
								</Button>
								{providers.length > 0 ? (
									<Button
										type="button"
										variant="outline"
										disabled={loadingProviders}
										onClick={() => setStep("model")}
									>
										Use existing
									</Button>
								) : null}
							</div>
						</FieldGroup>
					) : null}

					{step === "model" ? (
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="setup-provider">Connection</FieldLabel>
								<FieldContent>
									<Select
										value={providerId ?? undefined}
										onValueChange={(value) => {
											setProviderId(value);
											setModelDbId(null);
										}}
									>
										<SelectTrigger id="setup-provider" className="w-full">
											<SelectValue placeholder="Select connection" />
										</SelectTrigger>
										<SelectContent>
											{providers.map((provider) => (
												<SelectItem key={provider.id} value={provider.id}>
													{provider.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedProvider ? (
										<FieldDescription>
											Using {selectedProvider.name}.
										</FieldDescription>
									) : null}
								</FieldContent>
							</Field>
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
									Test connection
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setStep("provider")}
								>
									Add another connection
								</Button>
							</div>
							{models.length > 0 ? (
								<Field>
									<FieldLabel htmlFor="setup-model">Model</FieldLabel>
									<FieldContent>
										<Select
											value={modelDbId ?? undefined}
											onValueChange={setModelDbId}
											disabled={loadingModels}
										>
											<SelectTrigger id="setup-model" className="w-full">
												<SelectValue placeholder="Select model" />
											</SelectTrigger>
											<SelectContent>
												{models.map((model) => (
													<SelectItem key={model.id} value={model.id}>
														{model.displayName ?? model.modelId}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FieldContent>
								</Field>
							) : (
								<FieldDescription>
									No saved models yet. Add a model ID below.
								</FieldDescription>
							)}
							<Field>
								<FieldLabel htmlFor="manual-model">Add model ID</FieldLabel>
								<FieldContent>
									<div className="flex gap-2">
										<Input
											id="manual-model"
											placeholder="gpt-4o-mini"
											value={manualModelId}
											onChange={(event) => setManualModelId(event.target.value)}
										/>
										<Button
											type="button"
											variant="outline"
											disabled={busy || !providerId || !manualModelId.trim()}
											onClick={() => void registerModel()}
										>
											Add
										</Button>
									</div>
								</FieldContent>
							</Field>
							<Button
								type="button"
								onClick={() => setStep("agent")}
								disabled={!modelDbId}
							>
								Continue
							</Button>
						</FieldGroup>
					) : null}

					{step === "agent" ? (
						<FieldGroup>
							{agentId ? (
								<FieldDescription>
									This will attach the selected model to the current assistant.
								</FieldDescription>
							) : (
								<Field>
									<FieldLabel htmlFor="agent-name">Assistant name</FieldLabel>
									<FieldContent>
										<Input
											id="agent-name"
											value={agentForm.name}
											onChange={(event) =>
												setAgentForm({ name: event.target.value })
											}
										/>
									</FieldContent>
								</Field>
							)}
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									onClick={() => void finishSetup()}
									disabled={busy || !modelDbId || (!agentId && !agentForm.name.trim())}
								>
									{busy ? (
										<Loader2 className="animate-spin" aria-hidden="true" />
									) : (
										<MessageSquareIcon
											data-icon="inline-start"
											aria-hidden="true"
										/>
									)}
									Finish and chat
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => setStep("model")}
								>
									Back
								</Button>
								{mode === "page" ? (
									<Button variant="ghost" asChild>
										<Link href={agentId ? `/chat?agentId=${agentId}` : "/chat"}>
											Skip for now
										</Link>
									</Button>
								) : null}
							</div>
						</FieldGroup>
					) : null}

					{onCancel ? (
						<Button
							type="button"
							variant="ghost"
							className="mt-4"
							onClick={onCancel}
						>
							Cancel
						</Button>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
