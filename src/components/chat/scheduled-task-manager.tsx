"use client";

import { CalendarClockIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import type { ChatAgent } from "@/components/chat/chat-types";

type ScheduledTask = {
	id: string;
	title: string;
	prompt: string;
	agentId: string;
	conversationId: string | null;
	frequency: "daily" | "interval";
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

function formatNextRun(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export function ScheduledTaskManager({
	workspaceId,
	agents,
	selectedAgentId,
	activeConversationId,
}: {
	workspaceId: string | null;
	agents: ChatAgent[];
	selectedAgentId: string | null;
	activeConversationId: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [tasks, setTasks] = useState<ScheduledTask[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [title, setTitle] = useState("Résumé d'actualité");
	const [prompt, setPrompt] = useState(defaultPrompt);
	const [frequency, setFrequency] = useState<"daily" | "interval">("daily");
	const [timeOfDay, setTimeOfDay] = useState("08:00");
	const [intervalMinutes, setIntervalMinutes] = useState("1440");
	const [agentId, setAgentId] = useState(selectedAgentId ?? "");
	const [useCurrentConversation, setUseCurrentConversation] = useState(true);

	const currentAgentId = useMemo(
		() => agentId || selectedAgentId || agents[0]?.id || "",
		[agentId, agents, selectedAgentId],
	);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen && selectedAgentId && !agentId) {
			setAgentId(selectedAgentId);
		}
		setOpen(nextOpen);
	}

	useEffect(() => {
		if (!open || !workspaceId) return;
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
					error instanceof Error ? error.message : "Unable to load schedules",
				);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void loadTasks();
		return () => {
			cancelled = true;
		};
	}, [open, workspaceId]);

	async function createTask() {
		if (!workspaceId || !currentAgentId) return;
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
						conversationId:
							useCurrentConversation && activeConversationId
								? activeConversationId
								: null,
						title,
						prompt,
						frequency,
						timezone: localTimeZone(),
						timeOfDay: frequency === "daily" ? timeOfDay : null,
						intervalMinutes:
							frequency === "interval" ? Number(intervalMinutes) : null,
					}),
				},
			);
			setTasks((current) => [data.task, ...current]);
			toast.success("Tâche planifiée créée");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to create task",
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
				error instanceof Error ? error.message : "Unable to update task",
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
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to delete task",
			);
		}
	}

	return (
		<Dialog open={open} onOpenChange={updateOpen}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!workspaceId}
				>
					<CalendarClockIcon className="size-4" aria-hidden="true" />
					Planifier
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Tâches planifiées</DialogTitle>
					<DialogDescription>
						Déclenche automatiquement un prompt dans ce chat, par exemple un
						résumé d&apos;actualité tous les matins.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 rounded-xl border border-border/70 p-4">
					<div className="grid gap-2">
						<Label>Titre</Label>
						<Input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Prompt</Label>
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							rows={5}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="grid gap-2">
							<Label>Assistant</Label>
							<Select value={currentAgentId} onValueChange={setAgentId}>
								<SelectTrigger>
									<SelectValue placeholder="Assistant" />
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
							<Label>Fréquence</Label>
							<Select
								value={frequency}
								onValueChange={(value) =>
									setFrequency(value as "daily" | "interval")
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="daily">Tous les jours</SelectItem>
									<SelectItem value="interval">Toutes les X minutes</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-2">
							<Label>{frequency === "daily" ? "Heure" : "Minutes"}</Label>
							<Input
								type={frequency === "daily" ? "time" : "number"}
								min={frequency === "daily" ? undefined : 5}
								value={frequency === "daily" ? timeOfDay : intervalMinutes}
								onChange={(event) =>
									frequency === "daily"
										? setTimeOfDay(event.target.value)
										: setIntervalMinutes(event.target.value)
								}
							/>
						</div>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 p-3">
						<div>
							<p className="text-sm font-medium">
								Utiliser la conversation active
							</p>
							<p className="text-xs text-muted-foreground">
								Sinon, une nouvelle conversation sera créée au premier
								déclenchement.
							</p>
						</div>
						<Switch
							checked={useCurrentConversation}
							disabled={!activeConversationId}
							onCheckedChange={setUseCurrentConversation}
						/>
					</div>
					<Button
						type="button"
						onClick={() => void createTask()}
						disabled={saving}
					>
						{saving ? <Loader2Icon className="animate-spin" /> : null}
						Créer la tâche
					</Button>
				</div>

				<div className="grid gap-2">
					{loading ? (
						<p className="text-sm text-muted-foreground">Chargement…</p>
					) : null}
					{tasks.map((task) => (
						<div
							key={task.id}
							className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{task.title}</p>
								<p className="text-xs text-muted-foreground">
									Prochain lancement : {formatNextRun(task.nextRunAt)}
								</p>
								{task.lastError ? (
									<p className="mt-1 text-xs text-destructive">
										{task.lastError}
									</p>
								) : null}
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Switch
									checked={task.enabled}
									onCheckedChange={(enabled) => void toggleTask(task, enabled)}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={() => void deleteTask(task.id)}
								>
									<Trash2Icon className="size-4" aria-hidden="true" />
								</Button>
							</div>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
