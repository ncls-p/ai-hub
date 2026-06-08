"use client";

import { useEffect, useState } from "react";
import { MessageSquareTextIcon, SparklesIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const NONE = "__none__";

type ChatAutomationConfig = {
	enabled: boolean;
	providerId?: string;
	modelId?: string;
	generateTitles: boolean;
	generateSuggestions: boolean;
};

type ChatAutomationState = {
	config: ChatAutomationConfig;
	providers: Array<{ id: string; name: string; kind: string }>;
	models: Array<{
		id: string;
		providerId: string;
		modelId: string;
		displayName: string | null;
	}>;
};

export function ChatAutomationSettings() {
	const [state, setState] = useState<ChatAutomationState | null>(null);
	const [config, setConfig] = useState<ChatAutomationConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch("/api/admin/chat-automation");
				if (!res.ok) throw new Error("Unable to load chat automation settings");
				const data = (await res.json()) as ChatAutomationState;
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

	const filteredModels =
		state && config?.providerId
			? state.models.filter((model) => model.providerId === config.providerId)
			: [];

	async function save() {
		if (!config) return;
		setSaving(true);
		try {
			const res = await fetch("/api/admin/chat-automation", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...config,
					providerId: config.providerId || undefined,
					modelId: config.modelId || undefined,
				}),
			});
			if (!res.ok) {
				throw new Error((await res.json()).error || "Unable to save settings");
			}
			const nextConfig = (await res.json()) as ChatAutomationConfig;
			setConfig(nextConfig);
			toast.success("Chat automation settings saved");
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
					<Spinner /> Loading chat automation settings…
				</CardContent>
			</Card>
		);
	}

	const ready = Boolean(config.enabled && config.providerId && config.modelId);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<CardTitle className="flex items-center gap-2">
							<MessageSquareTextIcon className="size-5" aria-hidden="true" />
							Chat automation
						</CardTitle>
						<CardDescription>
							Choose the small model used for conversation titles and next-message
							suggestions.
						</CardDescription>
					</div>
					<Badge variant={ready ? "secondary" : "outline"}>
						{ready ? "Ready" : "Incomplete"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
					<div>
						<Label htmlFor="chat-automation-enabled">Enable automation</Label>
						<p className="text-xs text-muted-foreground">
							When disabled, chat falls back to simple local titles.
						</p>
					</div>
					<Switch
						id="chat-automation-enabled"
						checked={config.enabled}
						onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label>Provider</Label>
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

				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
						<span>
							<span className="flex items-center gap-2 text-sm font-medium">
								<SparklesIcon className="size-4" aria-hidden="true" />
								Titles
							</span>
							<span className="text-xs text-muted-foreground">
								Generate concise conversation names.
							</span>
						</span>
						<Switch
							checked={config.generateTitles}
							onCheckedChange={(generateTitles) =>
								setConfig({ ...config, generateTitles })
							}
						/>
					</label>
					<label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
						<span>
							<span className="flex items-center gap-2 text-sm font-medium">
								<SparklesIcon className="size-4" aria-hidden="true" />
								Next suggestions
							</span>
							<span className="text-xs text-muted-foreground">
								Suggest useful follow-up messages.
							</span>
						</span>
						<Switch
							checked={config.generateSuggestions}
							onCheckedChange={(generateSuggestions) =>
								setConfig({ ...config, generateSuggestions })
							}
						/>
					</label>
				</div>

				<div className="flex justify-end">
					<Button onClick={() => void save()} disabled={saving}>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						Save chat automation
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
