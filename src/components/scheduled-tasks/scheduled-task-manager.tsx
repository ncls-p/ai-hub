"use client";

import { useLocale, useTranslations } from "next-intl";
import {
	CalendarClockIcon,
	Loader2Icon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ChatAgent } from "@/components/chat/chat-types";
import { PageEmptyState } from "@/components/page-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api-client";

const DAILY_FREQUENCY = "daily";
type ScheduleFrequency = typeof DAILY_FREQUENCY | "interval";

type ScheduledTask = {
	id: string;
	title: string;
	prompt: string;
	agentId: string;
	conversationId: string | null;
	frequency: ScheduleFrequency;
	timezone: string;
	timeOfDay: string | null;
	intervalMinutes: number | null;
	enabled: boolean;
	nextRunAt: string;
	lastStatus: string;
	lastError: string | null;
};

const defaultPrompt =
	"Fais-moi un résumé clair et sourcé de l'actualité importante de ce matin en français. Regroupe par thèmes et termine par les points à surveiller.";

function localTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatNextRun(value: string, locale: string) {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function statusVariant(status: string) {
	if (status === "failed") return "destructive" as const;
	if (status === "running") return "default" as const;
	if (status === "success") return "secondary" as const;
	return "outline" as const;
}

function statusToneClass(status: string) {
	if (status === "running")
		return "border-primary/20 bg-primary/10 text-primary";
	return undefined;
}

export function ScheduledTaskManager({
	workspaceId,
	agents,
}: {
	workspaceId: string | null;
	agents: ChatAgent[];
}) {
	const locale = useLocale();
	const t = useTranslations("scheduledTasks");
	const [tasks, setTasks] = useState<ScheduledTask[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [title, setTitle] = useState(t("defaults.title"));
	const [prompt, setPrompt] = useState(defaultPrompt);
	const [frequency, setFrequency] =
		useState<ScheduleFrequency>(DAILY_FREQUENCY);
	const [timeOfDay, setTimeOfDay] = useState("08:00");
	const [intervalMinutes, setIntervalMinutes] = useState("1440");
	const [agentId, setAgentId] = useState(agents[0]?.id ?? "");

	const currentAgentId = useMemo(
		() => agentId || agents[0]?.id || "",
		[agentId, agents],
	);
	const enabledTasks = tasks.filter((task) => task.enabled).length;
	const nextTask = tasks.find((task) => task.enabled) ?? null;
	const statusLabels = {
		idle: t("status.idle"),
		running: t("status.running"),
		success: t("status.success"),
		failed: t("status.failed"),
	};

	useEffect(() => {
		if (!workspaceId) return;

		let cancelled = false;
		async function loadTasks() {
			setLoading(true);
			try {
				const data = await fetchJson<{ tasks: ScheduledTask[] }>(
					`/api/workspace/scheduled-tasks?workspaceId=${workspaceId}`,
				);
				if (!cancelled) setTasks(data.tasks);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("toasts.loadFailed"),
				);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void loadTasks();
		return () => {
			cancelled = true;
		};
	}, [t, workspaceId]);

	async function createTask() {
		if (!workspaceId || !currentAgentId || !title.trim() || !prompt.trim())
			return;
		setSaving(true);
		try {
			const data = await fetchJson<{ task: ScheduledTask }>(
				"/api/workspace/scheduled-tasks",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						agentId: currentAgentId,
						conversationId: null,
						title: title.trim(),
						prompt: prompt.trim(),
						frequency,
						timezone: localTimeZone(),
						timeOfDay: frequency === DAILY_FREQUENCY ? timeOfDay : null,
						intervalMinutes:
							frequency === "interval" ? Number(intervalMinutes) : null,
					}),
				},
			);
			setTasks((current) => [data.task, ...current]);
			toast.success(t("toasts.created"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.createFailed"),
			);
		} finally {
			setSaving(false);
		}
	}

	async function toggleTask(task: ScheduledTask, enabled: boolean) {
		if (!workspaceId) return;
		try {
			const data = await fetchJson<{ task: ScheduledTask }>(
				`/api/workspace/scheduled-tasks/${task.id}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, enabled }),
				},
			);
			setTasks((current) =>
				current.map((item) => (item.id === task.id ? data.task : item)),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.updateFailed"),
			);
		}
	}

	async function deleteTask(taskId: string) {
		if (!workspaceId) return;
		try {
			await fetchJson(
				`/api/workspace/scheduled-tasks/${taskId}?workspaceId=${workspaceId}`,
				{ method: "DELETE" },
			);
			setTasks((current) => current.filter((task) => task.id !== taskId));
			toast.success(t("toasts.deleted"));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toasts.deleteFailed"),
			);
		}
	}

	function formatFrequency(task: ScheduledTask) {
		if (task.frequency === DAILY_FREQUENCY) {
			return t("dailyAt", { time: task.timeOfDay ?? "—" });
		}
		return t("intervalEvery", { minutes: task.intervalMinutes ?? 0 });
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>{t("create.title")}</CardTitle>
						<CardDescription>{t("create.description")}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="scheduled-task-title">{t("fields.title")}</Label>
							<Input
								id="scheduled-task-title"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="scheduled-task-prompt">
								{t("fields.prompt")}
							</Label>
							<Textarea
								id="scheduled-task-prompt"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								rows={7}
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="grid gap-2 sm:col-span-3 xl:col-span-1">
								<Label>{t("fields.assistant")}</Label>
								<Select value={currentAgentId} onValueChange={setAgentId}>
									<SelectTrigger>
										<SelectValue
											placeholder={t("fields.assistantPlaceholder")}
										/>
									</SelectTrigger>
									<SelectContent>
										{agents.map((agent) => (
											<SelectItem key={agent.id} value={agent.id}>
												{agent.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>{t("fields.frequency")}</Label>
								<Select
									value={frequency}
									onValueChange={(value) =>
										setFrequency(value as ScheduleFrequency)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={DAILY_FREQUENCY}>
											{t("frequency.daily")}
										</SelectItem>
										<SelectItem value="interval">
											{t("frequency.interval")}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="scheduled-task-schedule">
									{frequency === DAILY_FREQUENCY
										? t("fields.time")
										: t("fields.minutes")}
								</Label>
								<Input
									id="scheduled-task-schedule"
									type={frequency === DAILY_FREQUENCY ? "time" : "number"}
									min={frequency === DAILY_FREQUENCY ? undefined : 5}
									value={
										frequency === DAILY_FREQUENCY ? timeOfDay : intervalMinutes
									}
									onChange={(event) =>
										frequency === DAILY_FREQUENCY
											? setTimeOfDay(event.target.value)
											: setIntervalMinutes(event.target.value)
									}
								/>
							</div>
						</div>
						<Button
							type="button"
							onClick={() => void createTask()}
							disabled={
								saving ||
								!workspaceId ||
								!currentAgentId ||
								!title.trim() ||
								!prompt.trim()
							}
						>
							{saving ? (
								<Loader2Icon
									className="size-4 animate-spin"
									aria-hidden="true"
								/>
							) : (
								<PlusIcon className="size-4" aria-hidden="true" />
							)}
							{t("create.submit")}
						</Button>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>{t("overview.title")}</CardTitle>
						<CardDescription>
							{t("overview.description", {
								active: enabledTasks,
								total: tasks.length,
							})}
						</CardDescription>
						<CardAction>
							<Badge variant="outline">
								{t("overview.activeCount", { count: enabledTasks })}
							</Badge>
						</CardAction>
					</CardHeader>
					<CardContent>
						{loading ? (
							<div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
								<Loader2Icon
									className="size-4 animate-spin"
									aria-hidden="true"
								/>
								{t("loading")}
							</div>
						) : tasks.length === 0 ? (
							<PageEmptyState
								icon={CalendarClockIcon}
								title={t("empty.title")}
								description={t("empty.description")}
								className="border border-dashed border-border/70 bg-muted/20"
							/>
						) : (
							<div className="grid gap-3">
								{nextTask ? (
									<div className="rounded-xl border border-primary/20 bg-primary/7 p-3 text-sm">
										<p className="font-medium text-primary">
											{t("overview.nextRun")}
										</p>
										<p className="mt-1 text-muted-foreground">
											{nextTask.title} ·{" "}
											{formatNextRun(nextTask.nextRunAt, locale)}
										</p>
									</div>
								) : null}
								{tasks.map((task) => (
									<div
										key={task.id}
										className="grid gap-3 rounded-xl border border-border/70 bg-background/55 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
									>
										<div className="min-w-0">
											<div className="flex min-w-0 flex-wrap items-center gap-2">
												<p className="truncate text-sm font-medium">
													{task.title}
												</p>
												<Badge
													variant={statusVariant(task.lastStatus)}
													className={statusToneClass(task.lastStatus)}
												>
													{statusLabels[
														task.lastStatus as keyof typeof statusLabels
													] ?? task.lastStatus}
												</Badge>
											</div>
											<p className="mt-1 text-xs text-muted-foreground">
												{formatFrequency(task)} ·{" "}
												{t("nextRun", {
													date: formatNextRun(task.nextRunAt, locale),
												})}
											</p>
											{task.lastError ? (
												<p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive">
													{task.lastError}
												</p>
											) : null}
										</div>
										<div className="flex shrink-0 items-center justify-end gap-2">
											<Switch
												checked={task.enabled}
												onCheckedChange={(enabled) =>
													void toggleTask(task, enabled)
												}
												aria-label={t("toggleTask", { title: task.title })}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												onClick={() => void deleteTask(task.id)}
												aria-label={t("deleteTask", { title: task.title })}
											>
												<Trash2Icon className="size-4" aria-hidden="true" />
											</Button>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
