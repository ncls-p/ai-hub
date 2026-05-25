import { PlusIcon, PlugZapIcon } from "lucide-react";

import { ProviderManager } from "@/components/providers/provider-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { getSession } from "@/modules/auth/session";
import {
	listModels,
	listProviders,
	toSafeProvider,
} from "@/modules/provider/use-cases";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";

function serialize(value: unknown) {
	return JSON.parse(JSON.stringify(value));
}

export default async function ProvidersPage() {
	const session = await getSession();

	if (!session) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PlugZapIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Sign in required</EmptyTitle>
						<EmptyDescription>
							Sign in to manage workspace AI providers.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const workspaceRows = await getWorkspacesByUserId(session.user.id);
	const workspace = workspaceRows[0]?.workspace;

	if (!workspace) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PlugZapIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No workspace found</EmptyTitle>
						<EmptyDescription>
							Create a workspace before configuring providers.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button type="button" disabled>
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Workspace setup coming next
						</Button>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	const providers = await listProviders(workspace.id);
	const safeProviders = providers.map(toSafeProvider);
	const firstProvider = providers[0];
	const models = firstProvider ? await listModels(firstProvider.id) : [];

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Providers</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Model access, encrypted
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Register AI gateways once, then route agents through the right
						provider without exposing credentials to teammates.
					</p>
				</div>
				<Card className="bg-primary/5 sm:w-64">
					<CardContent className="py-3 text-sm text-muted-foreground">
						Managing workspace:{" "}
						<span className="font-medium text-foreground">
							{workspace.name}
						</span>
					</CardContent>
				</Card>
			</div>

			<ProviderManager
				workspaceId={workspace.id}
				initialProviders={serialize(safeProviders)}
				initialModels={serialize(models)}
			/>
		</div>
	);
}
