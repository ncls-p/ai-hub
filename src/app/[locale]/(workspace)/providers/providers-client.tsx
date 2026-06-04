"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZapIcon } from "lucide-react";

import { PageLoading } from "@/components/page-loading";
import { ProviderManager } from "@/components/providers/provider-manager";
import { WorkspacePage } from "@/components/workspace-page";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { useWorkspace } from "@/hooks/use-workspace";

type SafeProvider = Parameters<
	typeof ProviderManager
>[0]["initialProviders"][number];
type ProviderModel = Parameters<
	typeof ProviderManager
>[0]["initialModels"][number];

export function ProvidersPageClient() {
	const { workspaceId, workspaces, isLoading } = useWorkspace();
	const [providers, setProviders] = useState<SafeProvider[]>([]);
	const [models, setModels] = useState<ProviderModel[]>([]);
	const [loading, setLoading] = useState(true);

	const activeWorkspace = workspaces.find((w) => w.id === workspaceId);

	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		try {
			const providerRes = await fetch(
				`/api/workspace/providers?workspaceId=${workspaceId}`,
			);
			if (!providerRes.ok) throw new Error("Failed to load providers");
			const providerRows = (await providerRes.json()) as SafeProvider[];
			setProviders(providerRows);

			const first = providerRows[0];
			if (first) {
				const modelRes = await fetch(
					`/api/workspace/providers/${first.id}/models?workspaceId=${workspaceId}`,
				);
				setModels(modelRes.ok ? await modelRes.json() : []);
			} else {
				setModels([]);
			}
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async bootstrap
		void load();
	}, [load, workspaceId]);

	if (isLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	if (!activeWorkspace) {
		return (
			<WorkspacePage title="AI Connections" width="default">
				<Empty className="min-h-80 border border-border/70 bg-background/55">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PlugZapIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No workspace found</EmptyTitle>
						<EmptyDescription>
							Join or create a workspace before configuring AI connections.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</WorkspacePage>
		);
	}

	return (
		<WorkspacePage
			title="Providers"
			description="Connect to AI providers and manage available models for your assistants."
			width="default"
		>
			{loading ? (
				<PageLoading className="min-h-64" label="Loading connections" />
			) : (
				<ProviderManager
					key={workspaceId}
					workspaceId={workspaceId}
					initialProviders={providers}
					initialModels={models}
				/>
			)}
		</WorkspacePage>
	);
}
