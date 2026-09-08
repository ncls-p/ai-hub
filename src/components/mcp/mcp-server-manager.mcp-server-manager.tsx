"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import type {
  ResourceAccessOptions,
  ResourceAccessSelection,
} from "@/modules/iam/resource-access-scope";

import { type ShareableResource } from "@/components/marketplace/resource-share-dialog";
import { linesFromTextarea } from "./mcp-server-manager.lines-from-textarea";
import { McpServerManagerView } from "./mcp-server-manager.mcp-server-manager.view";
import { SERVERS_PAGE_SIZE } from "./mcp-server-manager.servers-page-size";
import {
  buildEnv,
  buildHeaders,
  emptyForm,
  serverFormFromServer,
  type McpServerForm,
} from "./mcp-server-manager/form";
import type {
  McpServer,
  McpTool,
  ServerStatusFilter,
} from "./mcp-server-manager/types";

export function useMcpServerManagerController() {
  const t = useTranslations("mcp.serverManager");
  const { workspaceId } = useWorkspace();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ServerStatusFilter>("all");
  const [visibleCount, setVisibleCount] = useState(SERVERS_PAGE_SIZE);
  const [showCreate, setShowCreate] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
  const [form, setForm] = useState<McpServerForm>(emptyForm);
  const [editServer, setEditServer] = useState<McpServer | null>(null);
  const [accessServer, setAccessServer] = useState<McpServer | null>(null);
  const [editForm, setEditForm] = useState<McpServerForm>(emptyForm);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({});
  const [toolSearch, setToolSearch] = useState<Record<string, string>>({});
  const [resourceAccessOptions, setResourceAccessOptions] =
    useState<ResourceAccessOptions | null>(null);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [canManageMcpServers, setCanManageMcpServers] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const permissions = await fetchWorkspacePermissions(workspaceId);
      setCanManageTenantGlobals(permissions.canManageTenantGlobals);
      setCanManageMcpServers(permissions.canManageMcpServers);
      setResourceAccessOptions(permissions.resourceAccessOptions ?? null);
      const res = await fetch(
        `/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
      );
      if (!res.ok) throw new Error(t("loadFailed"));
      let data = (await res.json()) as McpServer[];
      const serversPendingInitialDiscovery = data.filter(
        (server) =>
          server.canEdit &&
          server.enabled &&
          server.transport !== "stdio" &&
          (!server.healthStatus || server.healthStatus === "unknown"),
      );
      if (
        permissions.canManageMcpServers &&
        serversPendingInitialDiscovery.length > 0
      ) {
        await Promise.all(
          serversPendingInitialDiscovery.map((server) =>
            fetch(
              `/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
              { method: "POST" },
            ),
          ),
        );
        const refreshedRes = await fetch(
          `/api/workspace/mcp-servers?workspaceId=${workspaceId}`,
        );
        if (refreshedRes.ok) {
          data = (await refreshedRes.json()) as McpServer[];
        }
      }
      setServers(data);
      const entries = await Promise.all(
        data.map(async (server) => {
          const toolRes = await fetch(
            `/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
          );
          if (!toolRes.ok) throw new Error(t("loadFailed"));
          return [server.id, await toolRes.json()] as const;
        }),
      );
      setToolsByServer(Object.fromEntries(entries));
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
      return;
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async MCP bootstrap
    void load();
  }, [load]);

  const filteredServers = useMemo(() => {
    let result = servers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.transport.toLowerCase().includes(q) ||
          (s.url ?? "").toLowerCase().includes(q) ||
          (s.command ?? "").toLowerCase().includes(q),
      );
    }
    if (filterStatus === "enabled") result = result.filter((s) => s.enabled);
    if (filterStatus === "disabled") result = result.filter((s) => !s.enabled);
    return result;
  }, [servers, search, filterStatus]);
  const visibleServers = filteredServers.slice(0, visibleCount);

  async function openEdit(server: McpServer) {
    if (!workspaceId || !server.canEdit) return;
    setEditServer(server);
    setEditForm(emptyForm);
    setEditLoading(true);
    setShowAdvancedEdit(false);
    try {
      const res = await fetch(
        `/api/workspace/mcp-servers/${server.id}?workspaceId=${workspaceId}`,
      );
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ||
            t("loadServerFailed"),
        );
      }
      const data = (await res.json()) as McpServer;
      setEditServer(data);
      setEditForm(serverFormFromServer(data, data.authHint));
    } catch (error) {
      setEditServer(null);
      toast.error(
        error instanceof Error ? error.message : t("loadServerFailed"),
      );
      return;
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditServer(null);
    setEditLoading(false);
    setShowAdvancedEdit(false);
  }

  async function openAccess(server: McpServer) {
    if (!workspaceId || !server.canEdit) return;
    try {
      const response = await fetch(
        `/api/workspace/mcp-servers/${server.id}?workspaceId=${workspaceId}`,
      );
      const data = (await response.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("loadServerFailed"));
      }
      setAccessServer(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("loadServerFailed"),
      );
    }
  }

  async function saveServerAccess(
    server: McpServer,
    selection: ResourceAccessSelection,
  ) {
    if (!workspaceId) return;
    const response = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        accessScope: selection.scope,
        accessTeamId: selection.scope === "team" ? selection.teamId : undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as McpServer & {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || t("updateFailed"));
    setAccessServer({ ...server, ...data, access: selection });
  }

  async function createServer() {
    if (!workspaceId || !canManageMcpServers || !form.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: form.name.trim(),
          transport: form.transport,
          url: form.url.trim() || undefined,
          command: form.command.trim() || undefined,
          args: linesFromTextarea(form.args),
          requireApproval: form.requireApproval,
          accessScope: form.accessScope,
          accessTeamId:
            form.accessScope === "team" ? form.accessTeamId : undefined,
          headers: buildHeaders(form),
          env: buildEnv(form),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("createFailed"));
      setForm(emptyForm);
      setShowCreate(false);
      setShowAdvancedCreate(false);
      setExpandedServers((current) => ({ ...current, [data.id]: true }));
      notifyDiscoveryResult(data.discovery, "created");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("createFailed"));
      return;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!workspaceId || !editServer) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/mcp-servers/${editServer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: editForm.name.trim(),
          transport: editForm.transport,
          url: editForm.url.trim() || "",
          command: editForm.command.trim() || undefined,
          args: linesFromTextarea(editForm.args),
          enabled: editServer.enabled,
          requireApproval: editForm.requireApproval,
          accessScope: editForm.accessScope,
          accessTeamId:
            editForm.accessScope === "team" ? editForm.accessTeamId : undefined,
          headers: buildHeaders(editForm),
          env: buildEnv(editForm),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as McpServer & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("updateFailed"));
      closeEdit();
      notifyDiscoveryResult(data.discovery, "updated");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("updateFailed"));
      return;
    } finally {
      setBusy(false);
    }
  }

  async function removeServer(serverId: string) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/mcp-servers/${serverId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(t("removeFailed"));
      setDeleteId(null);
      toast.success(t("removed"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("removeFailed"));
      return;
    } finally {
      setBusy(false);
    }
  }

  async function retryDiscovery(serverId: string) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/mcp-servers/${serverId}/tools?workspaceId=${workspaceId}`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        discovered?: number;
        status?: string;
        error?: string;
      };
      if (res.ok) {
        toast.success(
          data.discovered
            ? t("discoverySuccess", { count: data.discovered })
            : t("discoveryEmpty"),
        );
        await load();
      } else {
        toast.error(data.error || t("discoveryFailed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("discoveryFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  function notifyDiscoveryResult(
    discovery: McpServer["discovery"],
    fallback: "created" | "updated",
  ) {
    if (!discovery || discovery.status === "manual") {
      toast.success(t(fallback));
    } else if (discovery.status === "unhealthy") {
      toast.warning(t("savedDiscoveryFailed"));
    } else if (discovery.discovered > 0) {
      toast.success(t("savedWithTools", { count: discovery.discovered }));
    } else {
      toast.success(t("savedWithoutTools"));
    }
  }

  async function patchServer(server: McpServer, body: Record<string, unknown>) {
    if (!workspaceId || !server.canEdit) return;
    try {
      const res = await fetch(`/api/workspace/mcp-servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      if (!res.ok) throw new Error(t("updateFailed"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("updateFailed"));
    }
  }

  async function patchTool(
    serverId: string,
    toolId: string,
    body: Record<string, unknown>,
  ) {
    if (!workspaceId) return;
    try {
      const res = await fetch(
        `/api/workspace/mcp-servers/${serverId}/tools/${toolId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, ...body }),
        },
      );
      if (!res.ok) throw new Error(t("updateToolFailed"));
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("updateToolFailed"),
      );
    }
  }

  return {
    kind: "ready",
    accessServer,
    busy,
    canManageMcpServers,
    canManageTenantGlobals,
    closeEdit,
    createServer,
    deleteId,
    editForm,
    editLoading,
    editServer,
    expandedServers,
    filterStatus,
    filteredServers,
    form,
    load,
    loadError,
    loading,
    openAccess,
    openEdit,
    patchServer,
    patchTool,
    removeServer,
    resourceAccessOptions,
    retryDiscovery,
    saveEdit,
    saveServerAccess,
    search,
    servers,
    setDeleteId,
    setEditForm,
    setExpandedServers,
    setFilterStatus,
    setForm,
    setAccessServer,
    setSearch,
    setShareResource,
    setShowAdvancedCreate,
    setShowAdvancedEdit,
    setShowConnections,
    setShowCreate,
    setToolSearch,
    setVisibleCount,
    shareResource,
    showAdvancedCreate,
    showAdvancedEdit,
    showConnections,
    showCreate,
    t,
    toolSearch,
    toolsByServer,
    visibleCount,
    visibleServers,
    workspaceId,
  } as const;
}

export function McpServerManager(
  ...args: Parameters<typeof useMcpServerManagerController>
) {
  const model = useMcpServerManagerController(...args);
  if (!("kind" in model)) return model;
  return <McpServerManagerView model={model} />;
}
