"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { MessageSquareIcon, Settings2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import type { AgentForm, Model, Provider } from "./types";

export function OverviewTab({
	agentId,
	form,
	models,
	providers,
	knowledgeCount,
	toolsCount,
	onOpenModelTab,
}: {
	agentId: string;
	form: AgentForm;
	models: Model[];
	providers: Provider[];
	knowledgeCount: number;
	toolsCount: number;
	onOpenModelTab?: () => void;
}) {
	const t = useTranslations("agents.overview");
	const model = models.find((m) => m.id === form.modelId);
	const provider = providers.find((p) => p.id === form.providerId);
	const modelLabel =
		model && provider
			? `${provider.name} · ${model.displayName || model.modelId}`
			: t("notConfigured");

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("description")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-3">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{t("model")}
						</p>
						<p className="mt-1 text-sm font-medium">{modelLabel}</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{t("knowledgeCount", { count: knowledgeCount })}
						</p>
						<p className="mt-1 text-sm font-medium">{knowledgeCount}</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{t("toolsCount", { count: toolsCount })}
						</p>
						<p className="mt-1 text-sm font-medium">{toolsCount}</p>
					</div>
				</CardContent>
				<div className="flex flex-wrap gap-2 border-t border-border/50 px-6 pb-6">
					<Button asChild>
						<Link href={`/chat?agentId=${agentId}`}>
							<MessageSquareIcon className="size-4" aria-hidden="true" />
							{t("testInChat")}
						</Link>
					</Button>
					{onOpenModelTab ? (
						<Button type="button" variant="outline" onClick={onOpenModelTab}>
							<Settings2Icon className="size-4" aria-hidden="true" />
							{t("model")}
						</Button>
					) : null}
				</div>
			</Card>
		</div>
	);
}
