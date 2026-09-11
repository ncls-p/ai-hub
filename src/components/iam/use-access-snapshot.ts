"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import type { AccessSnapshot } from "./access-console.access-member";
import { builtInRoleKey } from "./access-console.resource-transfer-preview";

export function useAccessSnapshot(workspaceId: string | null | undefined) {
  const t = useTranslations("access");
  const loadSequence = useRef(0);
  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(
    async (options?: { preserveData?: boolean }) => {
      if (!workspaceId) return;
      const sequence = ++loadSequence.current;
      if (!options?.preserveData) setLoading(true);
      setRefreshError(null);
      try {
        const data = await fetchJson<AccessSnapshot>(
          `/api/workspace/iam?workspaceId=${workspaceId}`,
        );
        if (sequence !== loadSequence.current) return;
        setSnapshot({
          ...data,
          roles: data.roles.map((role) => {
            const key = role.isSystem ? builtInRoleKey(role.name) : undefined;
            return key
              ? { ...role, description: t(`builtInRoleDescriptions.${key}`) }
              : role;
          }),
        });
      } catch (error) {
        if (sequence !== loadSequence.current) return;
        const message = error instanceof Error ? error.message : t("loadError");
        setRefreshError(message);
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [t, workspaceId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- request lifecycle starts after the active project is known
    void load();
  }, [load]);

  return { snapshot, loading, refreshError, load };
}
