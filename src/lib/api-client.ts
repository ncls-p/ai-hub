import type { WorkspacePermissions } from "@/lib/workspace-nav";

type WorkspaceRow = {
  workspace?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  organization?: {
    name?: string;
  };
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  organizationName: string;
};

export async function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  try {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return [];

    const rows = (await res.json()) as WorkspaceRow[];
    if (!Array.isArray(rows)) return [];

    return rows
      .map((row) => {
        const id = row.workspace?.id;
        if (!id) return null;
        return {
          id,
          name: row.workspace?.name ?? "Workspace",
          slug: row.workspace?.slug ?? "main",
          organizationName: row.organization?.name ?? "Organization",
        };
      })
      .filter((row): row is WorkspaceSummary => row !== null);
  } catch {
    return [];
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(
      (error as { error?: string } | null)?.error ??
        `Request failed: ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export async function fetchPendingToolCount(
  workspaceId: string,
): Promise<number> {
  const res = await fetch(
    `/api/workspace/tool-invocations?workspaceId=${workspaceId}&status=awaiting_approval`,
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

export async function fetchWorkspacePermissions(
  workspaceId: string,
): Promise<WorkspacePermissions> {
  return fetchJson<WorkspacePermissions>(
    `/api/workspace/permissions?workspaceId=${workspaceId}`,
  );
}
