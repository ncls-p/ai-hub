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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";

const steps = [
	{ id: "provider", label: "Provider", icon: PlugZapIcon },
	{ id: "test", label: "Test", icon: CheckCircle2Icon },
	{ id: "model", label: "Model", icon: BotIcon },
	{ id: "agent", label: "Agent", icon: BotIcon },
	{ id: "chat", label: "Chat", icon: MessageSquareIcon },
] as const;

type StepId = (typeof steps)[number]["id"];

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
	const [providerId, setProviderId] = useState<string | null>(null);
	const [modelDbId, setModelDbId] = useState<string | null>(null);
	const [agentId, setAgentId] = useState<string | null>(initialAgentId);
	const [busy, setBusy] = useState(false);
	const [models, setModels] = useState<ProviderModel[]>([]);
	const [testMessage, setTestMessage] = useState("Hello! Please confirm you are ready.");
	const [testSent, setTestSent] = useState(false);
	const [providerForm, setProviderForm] = useState({
		name: "OpenAI Compatible",
		kind: "openai_compatible",
		baseUrl: "",
		apiKey: "",
	});
	const [manualModelId, setManualModelId] = useState("");
	const [agentForm, setAgentForm] = useState({
		name: "My Assistant",
	});

	useEffect(() => {
		if (!workspaceId) return;
		fetch(`/api/workspace/providers?workspaceId=${workspaceId}`)
			.then((res) => (res.ok ? res.json() : []))
			.then((rows: Array<{ id: string }>) => {
				if (Array.isArray(rows) && rows.length > 0) {
					setProviderId(rows[0].id);
					setStep("model");
				}
			})
			.catch(() => {});
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId || !providerId || step !== "model") return;
		let cancelled = false;
		async function loadModels() {
			try {
				const rows = await fetchJson<ProviderModel[]>(
					`/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
				);
				if (!cancelled) {
					setModels(rows);
					if (rows[0]?.id) setModelDbId(rows[0].id);
				}
			} catch {
				if (!cancelled) setModels([]);
			}
		}
		void loadModels();
		return () => {
			cancelled = true;
		};
	}, [workspaceId, providerId, step]);

	async function createProvider() {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					name: providerForm.name,
					kind: providerForm.kind,
					baseUrl: providerForm.baseUrl || undefined,
					apiKey: providerForm.apiKey || undefined,
				}),
			});
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			const provider = (await res.json()) as { id: string };
			setProviderId(provider.id);
			setStep("test");
			toast.success("AI connection created");
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
			const res = await fetch(
				`/api/workspace/providers/${providerId}/test?workspaceId=${workspaceId}`,
				{ method: "POST" },
			);
			if (!res.ok) throw new Error((await res.json()).error || "Test failed");
			toast.success("Connection verified");
			setStep("model");
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
			const res = await fetch(
				`/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
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
			if (!res.ok) throw new Error((await res.json()).error || "Failed");
			const model = (await res.json()) as ProviderModel;
			setModels((current) => [...current, model]);
			setModelDbId(model.id);
			setManualModelId("");
			toast.success("Model registered");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to register model",
			);
		} finally {
			setBusy(false);
		}
	}

	async function createOrUpdateAgent() {
		if (!workspaceId || !providerId || !modelDbId) return;
		setBusy(true);
		try {
			if (agentId) {
				const res = await fetch(
					`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
					{
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							workspaceId,
							providerId,
							modelId: modelDbId,
						}),
					},
				);
				if (!res.ok) throw new Error((await res.json()).error || "Failed");
			} else {
				const res = await fetch("/api/workspace/agents", {
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
				});
				if (!res.ok) throw new Error((await res.json()).error || "Failed");
				const data = (await res.json()) as { agent: { id: string } };
				setAgentId(data.agent.id);
			}
			setStep("chat");
			toast.success("Assistant configured");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to configure assistant",
			);
		} finally {
			setBusy(false);
		}
	}

	async function sendTestMessage() {
		if (!agentId) return;
		setBusy(true);
		try {
			const res = await fetch(`/api/workspace/${agentId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: testMessage }),
			});
			if (!res.ok) {
				const payload = await res.json().catch(() => null);
				throw new Error(payload?.error || "Test message failed");
			}
			setTestSent(true);
			toast.success("Test message sent");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Test message failed",
			);
		} finally {
			setBusy(false);
		}
	}

	async function finish() {
		if (!agentId || !testSent) return;
		setBusy(true);
		try {
			await fetch("/api/onboarding", { method: "POST" });
			onComplete?.(agentId);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to finish setup",
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

	return (
		<div className={mode === "page" ? "flex flex-col gap-6" : "flex flex-col gap-4"}>
			<div className="flex gap-2 overflow-x-auto">
				{steps.map((item, index) => (
					<div
						key={item.id}
						className={`min-w-[4.5rem] flex-1 rounded-lg border px-2 py-2 text-center text-xs ${
							index <= stepIndex
								? "border-primary/40 bg-primary/5"
								: "border-border/60 text-muted-foreground"
						}`}
					>
						{item.label}
					</div>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{step === "provider" && "Add an AI connection"}
						{step === "test" && "Test connection"}
						{step === "model" && "Choose a model"}
						{step === "agent" && "Create your assistant"}
						{step === "chat" && "Send a test message"}
					</CardTitle>
					<CardDescription>
						{step === "provider" &&
							"Connect to OpenAI-compatible or gateway providers."}
						{step === "test" && "Verify credentials before continuing."}
						{step === "model" &&
							"Pick a model from the provider or register one manually."}
						{step === "agent" &&
							"Your assistant will use the selected model."}
						{step === "chat" &&
							"Confirm chat works before finishing setup."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{step === "provider" ? (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="provider-name">Name</Label>
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
							</div>
							<div className="flex flex-col gap-2">
								<Label>Kind</Label>
								<Select
									value={providerForm.kind}
									onValueChange={(value) =>
										setProviderForm({ ...providerForm, kind: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="openai_compatible">
											OpenAI compatible
										</SelectItem>
										<SelectItem value="vercel_ai_gateway">
											Vercel AI Gateway
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="base-url">Base URL (optional)</Label>
								<Input
									id="base-url"
									value={providerForm.baseUrl}
									onChange={(event) =>
										setProviderForm({
											...providerForm,
											baseUrl: event.target.value,
										})
									}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="api-key">API key</Label>
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
							</div>
							<Button onClick={() => void createProvider()} disabled={busy}>
								{busy ? <Loader2 className="animate-spin" /> : "Create connection"}
							</Button>
						</>
					) : null}

					{step === "test" ? (
						<>
							<Button onClick={() => void testProvider()} disabled={busy}>
								{busy ? <Loader2 className="animate-spin" /> : "Run test"}
							</Button>
							<Button variant="outline" onClick={() => setStep("model")}>
								Skip test
							</Button>
						</>
					) : null}

					{step === "model" ? (
						<>
							{models.length > 0 ? (
								<div className="flex flex-col gap-2">
									<Label>Available models</Label>
									<Select
										value={modelDbId ?? undefined}
										onValueChange={setModelDbId}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select a model" />
										</SelectTrigger>
										<SelectContent>
											{models.map((model) => (
												<SelectItem key={model.id} value={model.id}>
													{model.displayName ?? model.modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									No models found. Register one below.
								</p>
							)}
							<div className="flex flex-col gap-2">
								<Label htmlFor="manual-model">Model ID</Label>
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
										disabled={busy || !manualModelId.trim()}
										onClick={() => void registerModel()}
									>
										Register
									</Button>
								</div>
							</div>
							<Button
								onClick={() => setStep("agent")}
								disabled={!modelDbId}
							>
								Continue
							</Button>
						</>
					) : null}

					{step === "agent" ? (
						<>
							{agentId ? (
								<p className="text-sm text-muted-foreground">
									Updating existing assistant with the selected model.
								</p>
							) : (
								<div className="flex flex-col gap-2">
									<Label htmlFor="agent-name">Assistant name</Label>
									<Input
										id="agent-name"
										value={agentForm.name}
										onChange={(event) =>
											setAgentForm({ name: event.target.value })
										}
									/>
								</div>
							)}
							<Button
								onClick={() => void createOrUpdateAgent()}
								disabled={busy || !modelDbId}
							>
								{busy ? (
									<Loader2 className="animate-spin" />
								) : agentId ? (
									"Save model binding"
								) : (
									"Create assistant"
								)}
							</Button>
						</>
					) : null}

					{step === "chat" ? (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="test-message">Test message</Label>
								<Textarea
									id="test-message"
									value={testMessage}
									onChange={(event) => setTestMessage(event.target.value)}
									rows={3}
								/>
							</div>
							<Button
								onClick={() => void sendTestMessage()}
								disabled={busy || !testMessage.trim()}
							>
								{busy ? (
									<Loader2 className="animate-spin" />
								) : (
									"Send test message"
								)}
							</Button>
							<Button
								onClick={() => void finish()}
								disabled={busy || !testSent}
							>
								Finish setup
							</Button>
							{mode === "page" ? (
								<Button variant="outline" asChild>
									<Link href={agentId ? `/chat?agentId=${agentId}` : "/chat"}>
										Go to chat
									</Link>
								</Button>
							) : null}
						</>
					) : null}

					{onCancel ? (
						<Button type="button" variant="ghost" onClick={onCancel}>
							Cancel
						</Button>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
