"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
	WorkspaceContext,
	type WorkspaceContextValue,
	type WorkspaceSummary,
} from "@/hooks/use-workspace";
import {
	fetchWorkspaces,
	getStoredWorkspaceId,
	setStoredWorkspaceId,
} from "@/lib/api-client";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
	const [workspaceId, setWorkspaceIdState] = useState<string | null>(() =>
		getStoredWorkspaceId(),
	);
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const [isLoading, setIsLoading] = useState(() => !getStoredWorkspaceId());
	const [error, setError] = useState<string | null>(null);

	const setWorkspaceId = useCallback((nextWorkspaceId: string) => {
		setStoredWorkspaceId(nextWorkspaceId);
		setWorkspaceIdState(nextWorkspaceId);
	}, []);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const rows = await fetchWorkspaces();
			setWorkspaces(rows);
			const stored = getStoredWorkspaceId();
			const active =
				(stored && rows.some((row) => row.id === stored) ? stored : null) ??
				rows[0]?.id ??
				null;
			if (active) {
				setStoredWorkspaceId(active);
				setWorkspaceIdState(active);
			} else {
				setWorkspaceIdState(null);
				setError("No workspace found");
			}
		} catch {
			setError("Unable to load workspace");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (workspaceId && workspaces.length > 0) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async workspace bootstrap
		void refresh();
	}, [workspaceId, workspaces.length, refresh]);

	const activeWorkspace = workspaces.find(
		(workspace) => workspace.id === workspaceId,
	);

	const value = useMemo<WorkspaceContextValue>(
		() => ({
			workspaceId,
			workspaces,
			organizationName: activeWorkspace?.organizationName ?? null,
			isLoading,
			error,
			setWorkspaceId,
			refresh,
		}),
		[
			workspaceId,
			workspaces,
			activeWorkspace?.organizationName,
			isLoading,
			error,
			setWorkspaceId,
			refresh,
		],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}
