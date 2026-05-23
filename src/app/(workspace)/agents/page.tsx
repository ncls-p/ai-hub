import { BotIcon, PlusIcon, WorkflowIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default function AgentsPage() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Agents</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Versioned agent workspace
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Design assistants with model settings, tools, knowledge, and
						deployment-safe configuration versions.
					</p>
				</div>
				<Button type="button">
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					New agent
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BotIcon className="size-4 text-primary" aria-hidden="true" />
							Agent catalog
						</CardTitle>
						<CardDescription>
							Centralize every assistant your team builds and runs.
						</CardDescription>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<WorkflowIcon
								className="size-4 text-primary"
								aria-hidden="true"
							/>
							Safe versions
						</CardTitle>
						<CardDescription>
							Promote changes through draft, test, and production workflows.
						</CardDescription>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Tool-ready</CardTitle>
						<CardDescription>
							Prepare agents for retrieval, actions, and provider routing.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardContent>
					<Empty className="min-h-72 border border-border/70 bg-background/55">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<BotIcon aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>No agents yet</EmptyTitle>
							<EmptyDescription>
								Create your first agent to start configuring model behavior,
								tools, and knowledge sources.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button type="button" size="sm">
								<PlusIcon data-icon="inline-start" aria-hidden="true" />
								Create agent
							</Button>
						</EmptyContent>
					</Empty>
				</CardContent>
			</Card>
		</div>
	);
}
