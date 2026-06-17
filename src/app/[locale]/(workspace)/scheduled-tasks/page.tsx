"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CalendarClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ChatAgent } from "@/components/chat/chat-types";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { ScheduledTaskManager } from "@/components/scheduled-tasks/scheduled-task-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";

type AgentsPayload = ChatAgent[] | { agents: ChatAgent[] };

function normalizeAgents(payload: AgentsPayload) {
	return Array.isArray(payload) ? payload : payload.agents;
}

export default function ScheduledTasksPage() {
	const t = useTranslations("scheduledTasks");
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [agents, setAgents] = useState<ChatAgent[]>([]);
	const [loadingAgents, setLoadingAgents] = useState(false);

	useEffect(() => {
		if (!workspaceId) return;

		let cancelled = false;
		async function loadAgents() {
			setLoadingAgents(true);
			try {
				const data = await fetchJson<AgentsPayload>(
					`/api/workspace/agents?workspaceId=${workspaceId}`,
				);
				if (!cancelled) setAgents(normalizeAgents(data));
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("toasts.loadAgentsFailed"),
				);
			} finally {
				if (!cancelled) setLoadingAgents(false);
			}
		}

		void loadAgents();
		return () => {
			cancelled = true;
		};
	}, [t, workspaceId]);

	const loading = workspaceLoading || loadingAgents;

	return (
		<WorkspacePage
			title={t("title")}
			description={t("description")}
			width="wide"
		>
			{loading ? (
				<PageLoading label={t("loadingAgents")} />
			) : agents.length === 0 ? (
				<PageEmptyState
					icon={CalendarClockIcon}
					title={t("noAssistants.title")}
					description={t("noAssistants.description")}
					className="surface-panel"
				>
					<div className="flex flex-wrap justify-center gap-2">
						<Button asChild>
							<Link href="/agents">{t("noAssistants.cta")}</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/chat">{t("openChat")}</Link>
						</Button>
					</div>
				</PageEmptyState>
			) : (
				<div className="relative">
					<div
						className="pointer-events-none absolute -right-10 -top-10 hidden size-44 rounded-full bg-primary/8 blur-3xl sm:block"
						aria-hidden="true"
					/>
					<div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/24 p-4 text-sm text-muted-foreground">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<CalendarClockIcon className="size-5" aria-hidden="true" />
						</div>
						<p>{t("sectionHint")}</p>
					</div>
					<ScheduledTaskManager workspaceId={workspaceId} agents={agents} />
				</div>
			)}
		</WorkspacePage>
	);
}
