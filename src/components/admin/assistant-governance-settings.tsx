"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	BotOffIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
	Settings2Icon,
	StarIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
	SettingsDisabledNotice,
	SettingsSection,
	SettingsSectionSkeleton,
	SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import { ModelLogo } from "@/components/providers/model-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type Agent = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	logoUrl?: string | null;
	activeVersionId: string | null;
	modelDisplayName?: string | null;
	organizationDisplayOrder?: number;
	isOrganizationDefault?: boolean;
	isGlobal: boolean;
	isRecommended: boolean;
	canEdit?: boolean;
};

function isOrganizationAgent(agent: Agent) {
	return agent.isGlobal || agent.isRecommended;
}

export function AssistantGovernanceSettings() {
	const t = useTranslations("admin.settingsPage.assistantGovernance");
	const tAgents = useTranslations("agents");
	const { workspaceId } = useWorkspace();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [organizationDefaultAgentId, setOrganizationDefaultAgentId] = useState<
		string | null
	>(null);
	const [canAdminCurate, setCanAdminCurate] = useState(false);
	const [loading, setLoading] = useState(true);
	const [savingDefault, setSavingDefault] = useState(false);
	const [movingAgentId, setMovingAgentId] = useState<string | null>(null);

	const organizationAgents = useMemo(
		() => agents.filter(isOrganizationAgent),
		[agents],
	);
	const readyOrganizationAgents = organizationAgents.filter((agent) =>
		Boolean(agent.activeVersionId && agent.modelDisplayName),
	);
	const selectedDefaultId = organizationDefaultAgentId ?? NONE;

	const loadAgents = useCallback(async () => {
		if (!workspaceId) return;
		try {
			const res = await fetch(
				`/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
			);
			if (!res.ok) throw new Error(t("loadFailed"));
			const data = await res.json();
			const nextAgents = Array.isArray(data) ? data : data.agents;
			setAgents(nextAgents);
			setCanAdminCurate(Boolean(data.canAdminCurate));
			setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("loadFailed"));
		} finally {
			setLoading(false);
		}
	}, [t, workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		const timeout = window.setTimeout(() => void loadAgents(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadAgents, workspaceId]);

	async function setOrganizationDefault(agentId: string | null) {
		if (!workspaceId || !canAdminCurate) return;
		setSavingDefault(true);
		try {
			const res = await fetch("/api/workspace/agents/preferences", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					workspaceId,
					scope: "organization",
					defaultAgentId: agentId,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error || t("defaultFailed"));
			}
			const data = (await res.json()) as {
				organizationDefaultAgentId: string | null;
			};
			const nextDefaultId = data.organizationDefaultAgentId ?? null;
			setOrganizationDefaultAgentId(nextDefaultId);
			setAgents((current) =>
				current.map((agent) => ({
					...agent,
					isOrganizationDefault: agent.id === nextDefaultId,
				})),
			);
			toast.success(t("defaultSaved"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("defaultFailed"));
		} finally {
			setSavingDefault(false);
		}
	}

	async function moveOrganizationAgent(agentId: string, direction: -1 | 1) {
		if (!workspaceId || !canAdminCurate) return;
		const currentIndex = organizationAgents.findIndex(
			(agent) => agent.id === agentId,
		);
		const nextIndex = currentIndex + direction;
		if (
			currentIndex < 0 ||
			nextIndex < 0 ||
			nextIndex >= organizationAgents.length
		) {
			return;
		}

		const nextOrganizationAgents = [...organizationAgents];
		const [movedAgent] = nextOrganizationAgents.splice(currentIndex, 1);
		if (!movedAgent) return;
		nextOrganizationAgents.splice(nextIndex, 0, movedAgent);
		const nextAgentIds = nextOrganizationAgents.map((agent) => agent.id);
		setMovingAgentId(agentId);
		setAgents([
			...nextOrganizationAgents.map((agent, index) => ({
				...agent,
				organizationDisplayOrder: index,
			})),
			...agents.filter((agent) => !isOrganizationAgent(agent)),
		]);

		try {
			const res = await fetch("/api/workspace/agents/order", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, agentIds: nextAgentIds }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error || t("orderFailed"));
			}
			toast.success(t("orderSaved"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("orderFailed"));
			await loadAgents();
		} finally {
			setMovingAgentId(null);
		}
	}

	if (loading || !workspaceId) {
		return <SettingsSectionSkeleton rows={4} />;
	}

	const badgeTone = organizationDefaultAgentId ? "success" : "warning";

	return (
		<SettingsSection
			icon={Settings2Icon}
			title={t("title")}
			description={t("description")}
			stagger="stagger-3"
			badge={
				<SettingsStatusBadge
					label={t("status", { count: organizationAgents.length })}
					tone={badgeTone}
				/>
			}
		>
			<div className="space-y-5">
				<SettingsDisabledNotice
					title={t("policyTitle")}
					description={t("policyDescription")}
				/>

				{!canAdminCurate ? (
					<SettingsDisabledNotice
						title={t("adminOnlyTitle")}
						description={t("adminOnlyDescription")}
					/>
				) : organizationAgents.length === 0 ? (
					<div className="rounded-xl border border-dashed bg-background p-5 text-center">
						<BotOffIcon
							className="mx-auto size-6 text-muted-foreground"
							aria-hidden="true"
						/>
						<p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
						<p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
							{t("emptyDescription")}
						</p>
						<Button className="mt-4" size="sm" asChild>
							<Link href="/agents">{t("emptyAction")}</Link>
						</Button>
					</div>
				) : (
					<>
						<div className="grid gap-4 rounded-xl border bg-background p-4 md:grid-cols-[1fr_auto] md:items-end">
							<div className="space-y-2">
								<p className="text-sm font-medium">{t("defaultLabel")}</p>
								<Select
									value={selectedDefaultId}
									onValueChange={(value) =>
										void setOrganizationDefault(value === NONE ? null : value)
									}
									disabled={savingDefault}
								>
									<SelectTrigger>
										<SelectValue placeholder={t("defaultPlaceholder")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>{t("noDefault")}</SelectItem>
										{organizationAgents.map((agent) => (
											<SelectItem key={agent.id} value={agent.id}>
												{agent.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{t("defaultHint")}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								disabled={savingDefault || !organizationDefaultAgentId}
								onClick={() => void setOrganizationDefault(null)}
							>
								{savingDefault ? <Spinner data-icon="inline-start" /> : null}
								{t("clearDefault")}
							</Button>
						</div>

						<div className="rounded-xl border bg-background">
							<div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<p className="text-sm font-medium">{t("orderTitle")}</p>
									<p className="text-xs text-muted-foreground">
										{t("orderDescription")}
									</p>
								</div>
								<Badge variant="outline" className="w-fit">
									{t("readyCount", { count: readyOrganizationAgents.length })}
								</Badge>
							</div>

							<div className="divide-y">
								{organizationAgents.map((agent, index) => {
									const isDefault = agent.id === organizationDefaultAgentId;
									const isReady = Boolean(
										agent.activeVersionId && agent.modelDisplayName,
									);

									return (
										<div
											key={agent.id}
											className={cn(
												"flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center",
												!isReady && "opacity-70",
											)}
										>
											<div className="flex min-w-0 flex-1 items-center gap-3">
												<span className="w-6 text-center text-xs font-medium text-muted-foreground">
													{index + 1}
												</span>
												<ModelLogo
													logoUrl={agent.logoUrl}
													label={agent.name}
													size="md"
												/>
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<p className="truncate text-sm font-medium">
															{agent.name}
														</p>
														{isDefault ? (
															<Badge
																variant="secondary"
																className="gap-1 text-xs"
															>
																<StarIcon
																	className="size-3"
																	aria-hidden="true"
																/>
																{t("defaultBadge")}
															</Badge>
														) : null}
														{agent.isGlobal ? (
															<Badge variant="outline" className="text-xs">
																{t("globalBadge")}
															</Badge>
														) : null}
														{agent.isRecommended ? (
															<Badge variant="outline" className="text-xs">
																{t("recommendedBadge")}
															</Badge>
														) : null}
													</div>
													<p className="truncate text-xs text-muted-foreground">
														{agent.description || agent.slug}
													</p>
													<p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
														{isReady ? (
															<CheckCircle2Icon
																className="size-3 text-success"
																aria-hidden="true"
															/>
														) : null}
														{isReady
															? t("modelReady", {
																	model: agent.modelDisplayName ?? "—",
																})
															: t("modelMissing")}
													</p>
												</div>
											</div>

											<div className="flex shrink-0 items-center justify-end gap-1">
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													disabled={index <= 0 || movingAgentId === agent.id}
													onClick={() =>
														void moveOrganizationAgent(agent.id, -1)
													}
													aria-label={t("moveUp")}
												>
													<ArrowUpIcon
														className="size-3.5"
														aria-hidden="true"
													/>
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													disabled={
														index === organizationAgents.length - 1 ||
														movingAgentId === agent.id
													}
													onClick={() =>
														void moveOrganizationAgent(agent.id, 1)
													}
													aria-label={t("moveDown")}
												>
													<ArrowDownIcon
														className="size-3.5"
														aria-hidden="true"
													/>
												</Button>
												<Button variant="ghost" size="sm" asChild>
													<Link href={`/agents/${agent.id}`}>
														<ExternalLinkIcon
															className="size-3.5"
															aria-hidden="true"
														/>
														{agent.canEdit ? t("edit") : tAgents("configure")}
													</Link>
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</>
				)}
			</div>
		</SettingsSection>
	);
}
