"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
	ArrowRightIcon,
	CheckCircle2Icon,
	EyeIcon,
	SendIcon,
	SparklesIcon,
	Trash2Icon,
	WorkflowIcon,
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

type BuilderMessage = {
	role: "user" | "assistant";
	content: string;
};

type SecretField = {
	name: string;
	label: string;
	type: "secret" | "text" | "url" | "email" | "password";
	required: boolean;
	description?: string;
};

type SecretRequest = {
	id: string;
	title: string;
	description: string | null;
	fields: SecretField[];
	expiresAt: string;
};

type WorkflowPreview = {
	title: string;
	summary: string;
	steps: Array<{ label: string; description: string; kind?: string }>;
	inputs?: string[];
	outputs?: string[];
	status: "draft" | "needs_secrets" | "ready" | "created";
};

type ProgressEvent = {
	label: string;
	status: "done" | "pending";
};

type RegisteredTool = {
	id: string;
	name: string;
	status: string;
};

type CustomTool = {
	id: string;
	name: string;
	description: string | null;
	status: string;
	n8nWorkflowId: string | null;
	metadataJson?: { workflowPreview?: WorkflowPreview } | null;
	createdAt: string;
};

const examples = [
	"Crée un tool qui envoie une notification Slack quand mon assistant détecte une opportunité commerciale.",
	"Je veux un tool qui appelle une API interne avec une clé API et résume le résultat.",
	"Crée un tool qui ajoute une ligne dans Google Sheets à partir d'un nom, email et statut.",
];

function userSafeText(value: string) {
	return value.replace(/n8n/gi, "moteur d’automatisation");
}

export function CustomToolBuilder() {
	const { workspaceId } = useWorkspace();
	const [messages, setMessages] = useState<BuilderMessage[]>([
		{
			role: "assistant",
			content:
				"Décris le tool custom que tu veux créer. Si des credentials sont nécessaires, j'ouvrirai une modal sécurisée : je ne verrai jamais les secrets en clair.",
		},
	]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [secretRequest, setSecretRequest] = useState<SecretRequest | null>(
		null,
	);
	const [pendingSecretRequest, setPendingSecretRequest] =
		useState<SecretRequest | null>(null);
	const [secretValues, setSecretValues] = useState<Record<string, string>>({});
	const [credentialRefs, setCredentialRefs] = useState<
		Array<{ requestId: string; credentialRef: string }>
	>([]);
	const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
	const [workflowPreview, setWorkflowPreview] =
		useState<WorkflowPreview | null>(null);
	const [customTools, setCustomTools] = useState<CustomTool[]>([]);
	const [loadingTools, setLoadingTools] = useState(false);
	const [actionCount, setActionCount] = useState(0);
	const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);

	const lastSecretRequestId = secretRequest?.id;
	const canSend = Boolean(workspaceId && input.trim() && !busy);

	const loadTools = useCallback(async () => {
		if (!workspaceId) return;
		setLoadingTools(true);
		try {
			const res = await fetch(
				`/api/workspace/custom-tools?workspaceId=${workspaceId}`,
			);
			if (!res.ok) return;
			setCustomTools((await res.json()) as CustomTool[]);
		} finally {
			setLoadingTools(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		const timeout = window.setTimeout(() => void loadTools(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadTools]);

	async function runBuilder(
		nextMessages: BuilderMessage[],
		nextCredentialRefs = credentialRefs,
	) {
		if (!workspaceId) return;
		setBusy(true);
		try {
			const res = await fetch("/api/workspace/custom-tools/builder", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					messages: nextMessages,
					credentialRefs: nextCredentialRefs,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Builder failed");
			if (data.message) {
				setMessages((current) => [
					...current,
					{ role: "assistant", content: userSafeText(data.message) },
				]);
			}
			if (data.workflowPreviews?.length) {
				setWorkflowPreview(data.workflowPreviews.at(-1) as WorkflowPreview);
			}
			if (typeof data.actionCount === "number") {
				setActionCount(data.actionCount);
			}
			if (data.progressEvents?.length) {
				setProgressEvents(data.progressEvents as ProgressEvent[]);
			}
			if (data.secretRequests?.length) {
				setPendingSecretRequest(data.secretRequests[0]);
				setSecretValues({});
			}
			if (data.registeredTools?.length) {
				setRegisteredTools((current) => [...data.registeredTools, ...current]);
				await loadTools();
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unable to run builder";
			toast.error(message);
			setMessages((current) => [
				...current,
				{ role: "assistant", content: `Erreur: ${message}` },
			]);
		} finally {
			setBusy(false);
		}
	}

	async function sendMessage(content = input) {
		if (!workspaceId || !content.trim()) return;
		const nextMessages = [
			...messages,
			{ role: "user" as const, content: content.trim() },
		];
		setMessages(nextMessages);
		setInput("");
		await runBuilder(nextMessages);
	}

	function previewForTool(tool: {
		name: string;
		description?: string | null;
		status: string;
		metadataJson?: { workflowPreview?: WorkflowPreview } | null;
	}) {
		return (
			tool.metadataJson?.workflowPreview ?? {
				title: tool.name,
				summary: tool.description || "Tool custom enregistré.",
				status: tool.status === "workflow_created" ? "created" : "draft",
				steps: [
					{
						label: "Entrée assistant",
						description: "L’assistant prépare les données à envoyer au tool.",
					},
					{
						label: "Action du tool",
						description: "Le workflow exécute l’action configurée.",
					},
					{
						label: "Résultat",
						description: "Le résultat est retourné à l’assistant.",
					},
				],
			}
		);
	}

	async function removeCustomTool(toolId: string) {
		if (!workspaceId) return;
		if (!window.confirm("Supprimer ce tool et son workflow ?")) return;
		try {
			const res = await fetch(
				`/api/workspace/custom-tools/${toolId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Suppression impossible");
			setRegisteredTools((current) =>
				current.filter((tool) => tool.id !== toolId),
			);
			setCustomTools((current) => current.filter((tool) => tool.id !== toolId));
			toast.success(
				data.workflowDeleteError
					? "Tool supprimé, workflow distant à vérifier"
					: "Tool et workflow supprimés",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Suppression impossible",
			);
		}
	}

	async function submitSecrets() {
		if (!workspaceId || !secretRequest) return;
		try {
			const res = await fetch(
				`/api/workspace/custom-tools/secrets/${secretRequest.id}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						values: secretValues,
						provider: secretRequest.title,
						label: secretRequest.title,
					}),
				},
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Unable to submit secrets");
			const ref = {
				requestId: secretRequest.id,
				credentialRef: data.credentialRef as string,
			};
			const nextCredentialRefs = [...credentialRefs, ref];
			const visibleMessages: BuilderMessage[] = [
				...messages,
				{
					role: "assistant",
					content: "Connexion sécurisée reçue. Je continue automatiquement.",
				},
			];
			const builderMessages: BuilderMessage[] = [
				...visibleMessages,
				{
					role: "user",
					content:
						"La connexion sécurisée est fournie. Continue automatiquement la création du tool avec la référence opaque disponible.",
				},
			];
			setCredentialRefs(nextCredentialRefs);
			setMessages(visibleMessages);
			setSecretRequest(null);
			setPendingSecretRequest(null);
			setSecretValues({});
			toast.success("Secrets stored securely");
			await runBuilder(builderMessages, nextCredentialRefs);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to submit secrets",
			);
		}
	}

	const statusSummary = useMemo(() => {
		const total = customTools.length + registeredTools.length;
		return total > 0
			? `${total} custom tool${total > 1 ? "s" : ""}`
			: "No tools yet";
	}, [customTools.length, registeredTools.length]);
	const displayedTools: Array<{
		id: string;
		name: string;
		status: string;
		description?: string | null;
		metadataJson?: { workflowPreview?: WorkflowPreview } | null;
	}> = Array.from(
		new Map(
			[...registeredTools, ...customTools].map((tool) => [tool.id, tool]),
		).values(),
	);

	return (
		<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
			<Card className="min-h-[680px]">
				<CardHeader>
					<div className="flex items-center justify-between gap-3">
						<CardTitle className="flex items-center gap-2">
							<SparklesIcon
								className="size-5 text-primary"
								aria-hidden="true"
							/>
							Créer un tool
						</CardTitle>
						<Badge variant="secondary">Secrets protégés</Badge>
					</div>
				</CardHeader>
				<CardContent className="flex h-[560px] flex-col gap-4">
					<div className="flex-1 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-4">
						<div className="space-y-4">
							{messages.map((message, index) => (
								<div
									key={`${message.role}-${index}`}
									className={cn(
										"max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
										message.role === "user"
											? "ml-auto bg-primary text-primary-foreground"
											: "bg-background text-foreground border border-border/70",
									)}
								>
									{message.content}
								</div>
							))}
							{pendingSecretRequest ? (
								<div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
									<p className="text-sm font-medium">Connexion requise</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{pendingSecretRequest.fields
											.map((field) => field.label)
											.join(", ")}
									</p>
									<Button
										type="button"
										size="sm"
										className="mt-3"
										onClick={() => setSecretRequest(pendingSecretRequest)}
									>
										Ouvrir la fenêtre sécurisée
									</Button>
								</div>
							) : null}
							{busy ? (
								<div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
									<Spinner /> Création en cours…
								</div>
							) : null}
							{progressEvents.length > 0 ? (
								<div className="space-y-1 rounded-2xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
									{progressEvents.map((event, index) => (
										<div
											key={`${event.label}-${index}`}
											className="flex items-center justify-between gap-3"
										>
											<span>{event.label}</span>
											<span>{event.status === "done" ? "✓" : "…"}</span>
										</div>
									))}
								</div>
							) : null}
							{!busy && actionCount > 0 ? (
								<div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
									{actionCount} action{actionCount > 1 ? "s" : ""} effectuée
									{actionCount > 1 ? "s" : ""}
								</div>
							) : null}
						</div>
					</div>

					<div className="space-y-3">
						<div className="flex flex-wrap gap-2">
							{examples.map((example) => (
								<Button
									key={example}
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setInput(example)}
								>
									{example.slice(0, 54)}…
								</Button>
							))}
						</div>
						<div className="flex gap-2">
							<Textarea
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="Décris le tool, son input, son résultat attendu, et les services à connecter…"
								className="min-h-24"
							/>
							<Button
								className="self-stretch"
								onClick={() => sendMessage()}
								disabled={!canSend}
							>
								{busy ? <Spinner /> : <SendIcon />}
								<span className="sr-only">Send</span>
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="space-y-5">
				<Card className="overflow-visible">
					<CardHeader>
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="flex items-center gap-2">
								<WorkflowIcon className="size-5" aria-hidden="true" />
								Schéma
							</CardTitle>
							<Badge variant="outline">
								{workflowPreview?.status === "created"
									? "Créé"
									: workflowPreview?.status === "ready"
										? "Prêt"
										: workflowPreview?.status === "needs_secrets"
											? "Connexion requise"
											: "Brouillon"}
							</Badge>
						</div>
					</CardHeader>
					<CardContent>
						{workflowPreview ? (
							<div className="space-y-4">
								<div>
									<p className="font-heading text-base font-semibold">
										{workflowPreview.title}
									</p>
									<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
										{workflowPreview.summary}
									</p>
								</div>
								<div className="relative overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_36%),linear-gradient(180deg,color-mix(in_oklch,var(--muted)_70%,transparent),transparent)] p-4">
									<svg
										className="pointer-events-none absolute inset-0 size-full opacity-70"
										aria-hidden="true"
									>
										<defs>
											<pattern
												id="schema-grid"
												width="24"
												height="24"
												patternUnits="userSpaceOnUse"
											>
												<path
													d="M 24 0 L 0 0 0 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="0.5"
												/>
											</pattern>
										</defs>
										<rect
											width="100%"
											height="100%"
											fill="url(#schema-grid)"
											className="text-border"
										/>
									</svg>
									<div className="relative space-y-3">
										{workflowPreview.steps.map((step, index) => (
											<div
												key={`${step.label}-${index}`}
												className="flex items-center gap-2"
											>
												<div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-background/90 p-3 shadow-sm backdrop-blur">
													<div className="flex items-center gap-2">
														<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
															{index + 1}
														</span>
														<p className="truncate text-sm font-medium">
															{step.label}
														</p>
													</div>
													<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
														{step.description}
													</p>
												</div>
												{index < workflowPreview.steps.length - 1 ? (
													<ArrowRightIcon className="size-4 shrink-0 text-primary" />
												) : (
													<CheckCircle2Icon className="size-4 shrink-0 text-primary" />
												)}
											</div>
										))}
									</div>
								</div>
							</div>
						) : (
							<div className="rounded-3xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
								Le schéma apparaîtra ici.
							</div>
						)}
					</CardContent>
				</Card>

				{displayedTools.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Créés</CardTitle>
							<CardDescription>
								{loadingTools ? "Chargement…" : statusSummary}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							{displayedTools.slice(0, 5).map((tool) => (
								<div
									key={tool.id}
									className="rounded-xl border border-border/70 p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<p className="truncate text-sm font-medium">{tool.name}</p>
										<Badge variant="outline">{tool.status}</Badge>
									</div>
									<div className="mt-2 flex gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setWorkflowPreview(previewForTool(tool))}
										>
											<EyeIcon className="size-3" aria-hidden="true" />
											Voir
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => void removeCustomTool(tool.id)}
										>
											<Trash2Icon className="size-3" aria-hidden="true" />
											Supprimer
										</Button>
									</div>
								</div>
							))}
						</CardContent>
					</Card>
				) : null}
			</div>

			<Dialog
				open={Boolean(secretRequest)}
				onOpenChange={(open) => !open && setSecretRequest(null)}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{secretRequest?.title ?? "Credentials"}</DialogTitle>
						<DialogDescription>
							{secretRequest?.description ??
								"Renseigne ces champs. Ils seront envoyés uniquement au backend et chiffrés."}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						{secretRequest?.fields.map((field) => (
							<div
								key={`${lastSecretRequestId}-${field.name}`}
								className="space-y-2"
							>
								<Label htmlFor={field.name}>
									{field.label}
									{field.required ? " *" : ""}
								</Label>
								<Input
									id={field.name}
									type={
										field.type === "secret" || field.type === "password"
											? "password"
											: field.type
									}
									value={secretValues[field.name] ?? ""}
									onChange={(event) =>
										setSecretValues((current) => ({
											...current,
											[field.name]: event.target.value,
										}))
									}
									required={field.required}
								/>
								{field.description ? (
									<p className="text-xs text-muted-foreground">
										{field.description}
									</p>
								) : null}
							</div>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSecretRequest(null)}>
							Cancel
						</Button>
						<Button onClick={submitSecrets}>Store securely</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
