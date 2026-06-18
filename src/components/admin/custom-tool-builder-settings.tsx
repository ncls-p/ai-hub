"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
	SettingsDisabledNotice,
	SettingsSection,
	SettingsSectionSkeleton,
	SettingsStatusBadge,
	SettingsToggleRow,
} from "@/components/admin/settings-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	const t = useTranslations("admin.settingsPage.customToolBuilder");
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
			toast.success(t("saved"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to save settings",
			);
		} finally {
			setSaving(false);
		}
	}

	if (loading || !state || !config) {
		return <SettingsSectionSkeleton rows={5} />;
	}

	const ready = Boolean(
		config.enabled &&
			config.providerId &&
			config.modelId &&
			config.n8nMcpServerId,
	);
	const statusLabel = !config.enabled
		? t("statusDisabled")
		: ready
			? t("statusReady")
			: t("statusIncomplete");
	const statusTone = !config.enabled ? "muted" : ready ? "success" : "warning";

	return (
		<SettingsSection
			icon={WorkflowIcon}
			title={t("title")}
			description={t("description")}
			stagger="stagger-4"
			badge={<SettingsStatusBadge label={statusLabel} tone={statusTone} />}
		>
			<div className="space-y-5">
				<SettingsToggleRow
					id="ctb-enabled"
					label={t("enable")}
					description={t("enableDescription")}
					checked={config.enabled}
					onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
				/>

				{!config.enabled ? (
					<SettingsDisabledNotice
						title={t("disabledTitle")}
						description={t("disabledDescription")}
					/>
				) : null}

				{config.enabled ? (
					<>
						<div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
							<WorkflowIcon
								className="mt-0.5 size-4 shrink-0 text-primary"
								aria-hidden="true"
							/>
							<div>
								<p className="font-medium text-foreground">
									{t("secretsTitle")}
								</p>
								<p className="mt-1">{t("secretsDescription")}</p>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label>{t("provider")}</Label>
								<Select
									value={config.providerId || NONE}
									onValueChange={(nextProviderId) =>
										setConfig({
											...config,
											providerId:
												nextProviderId === NONE ? undefined : nextProviderId,
											modelId: undefined,
										})
									}
								>
									<SelectTrigger>
										<SelectValue placeholder={t("providerPlaceholder")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>{t("notConfigured")}</SelectItem>
										{state.providers.map((provider) => (
											<SelectItem key={provider.id} value={provider.id}>
												{provider.name} · {provider.kind}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>{t("model")}</Label>
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
										<SelectValue placeholder={t("modelPlaceholder")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>{t("notConfigured")}</SelectItem>
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
							<Label>{t("mcpServer")}</Label>
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
									<SelectValue placeholder={t("mcpPlaceholder")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>{t("notConfigured")}</SelectItem>
									{state.mcpServers.map((server) => (
										<SelectItem key={server.id} value={server.id}>
											{server.name} · {server.transport}
											{server.url ? "" : ` · ${t("noUrl")}`}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">{t("mcpHint")}</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<div className="space-y-2">
								<Label>{t("createTool")}</Label>
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
								<Label>{t("validateTool")}</Label>
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
								<Label>{t("activateTool")}</Label>
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
								<Label>{t("credentialTool")}</Label>
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

						<SettingsToggleRow
							id="ctb-activate"
							label={t("allowActivation")}
							description={t("allowActivationDescription")}
							checked={config.allowWorkflowActivation}
							onCheckedChange={(allowWorkflowActivation) =>
								setConfig({ ...config, allowWorkflowActivation })
							}
						/>
					</>
				) : null}

				<div className="flex justify-end border-t border-border/60 pt-4">
					<Button onClick={() => void save()} disabled={saving}>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						{t("save")}
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
