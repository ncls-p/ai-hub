"use client";

import { useEffect, useMemo, useState } from "react";
import { BotIcon, WorkflowIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";

const NONE = "__none__";

type BuilderConfig = {
	enabled: boolean;
	workspaceId?: string;
	providerId?: string;
	modelId?: string;
	n8nMcpServerId?: string;
	createWorkflowToolName: string;
	validateWorkflowToolName: string;
	activateWorkflowToolName: string;
	credentialToolName: string;
	allowWorkflowActivation: boolean;
};

type AdminState = {
	config: BuilderConfig;
	providers: Array<{
		id: string;
		workspaceId: string;
		name: string;
		kind: string;
	}>;
	models: Array<{
		id: string;
		providerId: string;
		modelId: string;
		displayName: string | null;
	}>;
	mcpServers: Array<{
		id: string;
		workspaceId: string;
		name: string;
		transport: string;
		url: string | null;
	}>;
};

export function CustomToolBuilderSettings() {
	const [state, setState] = useState<AdminState | null>(null);
	const [config, setConfig] = useState<BuilderConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch("/api/admin/custom-tool-builder");
				if (!res.ok)
					throw new Error("Unable to load custom tool builder settings");
				const data = (await res.json()) as AdminState;
				if (!cancelled) {
					setState(data);
					setConfig(data.config);
				}
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Unable to load settings",
				);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const providerId = config?.providerId;
	const filteredModels = useMemo(() => {
		if (!state || !providerId) return [];
		return state.models.filter((model) => model.providerId === providerId);
	}, [state, providerId]);

	async function save() {
		if (!config) return;
		setSaving(true);
		try {
			const body = {
				...config,
				workspaceId: config.workspaceId || undefined,
				providerId: config.providerId || undefined,
				modelId: config.modelId || undefined,
				n8nMcpServerId: config.n8nMcpServerId || undefined,
			};
			const res = await fetch("/api/admin/custom-tool-builder", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok)
				throw new Error((await res.json()).error || "Unable to save settings");
			const nextConfig = (await res.json()) as BuilderConfig;
			setConfig(nextConfig);
			toast.success("Custom tool builder settings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save settings",
			);
		} finally {
			setSaving(false);
		}
	}

	if (loading || !state || !config) {
		return (
			<Card>
				<CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
					<Spinner /> Loading custom tool builder settings…
				</CardContent>
			</Card>
		);
	}

	const ready = Boolean(
		config.enabled &&
			config.providerId &&
			config.modelId &&
			config.n8nMcpServerId,
	);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="flex items-center gap-2">
							<WorkflowIcon className="size-5" aria-hidden="true" />
							Custom tool builder
						</CardTitle>
						<CardDescription>
							Configure the LLM and n8n MCP used by the user-facing custom tool
							creation page.
						</CardDescription>
					</div>
					<Badge variant={ready ? "secondary" : "outline"}>
						{ready ? "Ready" : "Incomplete"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<Alert>
					<BotIcon className="size-4" aria-hidden="true" />
					<AlertTitle>Secrets stay out of the model context</AlertTitle>
					<AlertDescription>
						The builder can request a secure modal. Submitted values are
						encrypted server-side and the LLM only receives opaque credential
						refs.
					</AlertDescription>
				</Alert>

				<div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
					<div>
						<Label htmlFor="ctb-enabled">Enable builder</Label>
						<p className="text-xs text-muted-foreground">
							When disabled, the public builder API refuses requests.
						</p>
					</div>
					<Switch
						id="ctb-enabled"
						checked={config.enabled}
						onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label>LLM provider</Label>
						<Select
							value={config.providerId || NONE}
							onValueChange={(providerId) =>
								setConfig({
									...config,
									providerId: providerId === NONE ? undefined : providerId,
									modelId: undefined,
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Not configured</SelectItem>
								{state.providers.map((provider) => (
									<SelectItem key={provider.id} value={provider.id}>
										{provider.name} · {provider.kind}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Model</Label>
						<Select
							value={config.modelId || NONE}
							onValueChange={(modelId) =>
								setConfig({
									...config,
									modelId: modelId === NONE ? undefined : modelId,
								})
							}
							disabled={!config.providerId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select model" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Not configured</SelectItem>
								{filteredModels.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.displayName || model.modelId}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-2">
					<Label>n8n MCP server</Label>
					<Select
						value={config.n8nMcpServerId || NONE}
						onValueChange={(n8nMcpServerId) =>
							setConfig({
								...config,
								n8nMcpServerId:
									n8nMcpServerId === NONE ? undefined : n8nMcpServerId,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select n8n MCP server" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>Not configured</SelectItem>
							{state.mcpServers.map((server) => (
								<SelectItem key={server.id} value={server.id}>
									{server.name} · {server.transport}
									{server.url ? "" : " · no URL"}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						For the web app, use an SSE or streamable HTTP MCP URL. Stdio
						configs are useful for desktop clients but cannot be called by this
						route.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-4">
					<div className="space-y-2">
						<Label>Create workflow tool</Label>
						<Input
							value={config.createWorkflowToolName}
							onChange={(event) =>
								setConfig({
									...config,
									createWorkflowToolName: event.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Validate workflow tool</Label>
						<Input
							value={config.validateWorkflowToolName}
							onChange={(event) =>
								setConfig({
									...config,
									validateWorkflowToolName: event.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Update/activate tool</Label>
						<Input
							value={config.activateWorkflowToolName}
							onChange={(event) =>
								setConfig({
									...config,
									activateWorkflowToolName: event.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Credential tool</Label>
						<Input
							value={config.credentialToolName}
							onChange={(event) =>
								setConfig({
									...config,
									credentialToolName: event.target.value,
								})
							}
						/>
					</div>
				</div>

				<div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
					<div>
						<Label htmlFor="ctb-activate">Allow workflow activation</Label>
						<p className="text-xs text-muted-foreground">
							Keep this off to require human review before production
							activation.
						</p>
					</div>
					<Switch
						id="ctb-activate"
						checked={config.allowWorkflowActivation}
						onCheckedChange={(allowWorkflowActivation) =>
							setConfig({ ...config, allowWorkflowActivation })
						}
					/>
				</div>

				<Button onClick={save} disabled={saving}>
					{saving ? <Spinner data-icon="inline-start" /> : null}
					Save builder settings
				</Button>
			</CardContent>
		</Card>
	);
}
