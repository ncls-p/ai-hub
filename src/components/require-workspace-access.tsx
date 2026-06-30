"use client";

import { useEffect, useMemo, useState } from "react";

import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import type { WorkspacePermissions } from "@/lib/workspace-nav";

type WorkspacePermissionKey = keyof WorkspacePermissions;

type AccessMode = "all" | "any";

function isAllowed(
  permissions: WorkspacePermissions,
  required: WorkspacePermissionKey[],
  mode: AccessMode,
) {
  if (required.length === 0) return true;
  return mode === "all"
    ? required.every((permission) => permissions[permission])
    : required.some((permission) => permissions[permission]);
}

export function RequireWorkspaceAccess({
  children,
  required,
  mode = "all",
  redirectTo = "/chat",
}: {
  children: React.ReactNode;
  required: WorkspacePermissionKey | WorkspacePermissionKey[];
  mode?: AccessMode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { workspaceId, isLoading } = useWorkspace();
  const requiredValue = Array.isArray(required) ? required.join(",") : required;
  const requiredKey = `${mode}:${requiredValue}`;
  const requiredPermissions = useMemo(
    () => requiredValue.split(",") as WorkspacePermissionKey[],
    [requiredValue],
  );
  const [access, setAccess] = useState<{
    status: "allowed" | "denied";
    workspaceId: string;
    requiredKey: string;
  } | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!workspaceId) {
      router.replace(redirectTo);
      return;
    }

    const currentWorkspaceId = workspaceId;
    let cancelled = false;

    async function checkAccess() {
      try {
        const permissions = await fetchWorkspacePermissions(currentWorkspaceId);
        if (cancelled) return;
        if (isAllowed(permissions, requiredPermissions, mode)) {
          setAccess({
            status: "allowed",
            workspaceId: currentWorkspaceId,
            requiredKey,
          });
          return;
        }
      } catch {
        // Deny closed if permissions cannot be loaded.
      }

      if (!cancelled) {
        setAccess({
          status: "denied",
          workspaceId: currentWorkspaceId,
          requiredKey,
        });
        router.replace(redirectTo);
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    mode,
    redirectTo,
    requiredKey,
    requiredPermissions,
    router,
    workspaceId,
  ]);

  const isCurrentAccessAllowed =
    access?.status === "allowed" &&
    access.workspaceId === workspaceId &&
    access.requiredKey === requiredKey;

  if (!isCurrentAccessAllowed) {
    return <PageLoading label="Checking access" />;
  }

  return children;
}
