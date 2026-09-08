"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";
import type { AgentAccessSelection } from "@/modules/agent/access-scope";
import { toast } from "sonner";
import { AgentsPageView } from "./page.agents-page.view";
import {
  AGENT_TEMPLATES,
  Agent,
  AgentAccessForm,
  AgentAccessOptions,
  slugifyAgentName,
} from "./page.icon-size-class";

export function useAgentsPageController() {
  const t = useTranslations("agents");
  const tList = useTranslations("agents.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canAdminCurate, setCanAdminCurate] = useState(false);
  const [canCreateAgent, setCanCreateAgent] = useState(false);
  const [canExportResources, setCanExportResources] = useState(false);
  const [canImportResources, setCanImportResources] = useState(false);
  const [accessOptions, setAccessOptions] = useState<AgentAccessOptions>({
    scopes: ["private"],
    teams: [],
    projectName: "",
    organizationName: "",
  });
  const [organizationDefaultAgentId, setOrganizationDefaultAgentId] = useState<
    string | null
  >(null);
  const [userDefaultAgentId, setUserDefaultAgentId] = useState<string | null>(
    null,
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [agentKindFilter, setAgentKindFilter] = useState<
    "all" | "assistant" | "orchestrator"
  >("all");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">("grid");
  const [form, setForm] = useState({
    kind: "assistant" as Agent["kind"],
    templateId: "blank",
    name: "",
    slug: "",
    description: "",
    systemPrompt: "",
    promptSuggestions: "",
    sharingMode: "personal" as Agent["sharingMode"],
    shareTargetEmail: "",
    accessScope: "private" as AgentAccessForm["accessScope"],
    accessTeamId: "",
    isGlobal: false,
    isRecommended: false,
    curationLabel: "none",
  });
  const [accessAgent, setAccessAgent] = useState<Agent | null>(null);
  const [updatingDefaultAgentId, setUpdatingDefaultAgentId] = useState<
    string | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshAgents = useCallback(async () => {
    if (!workspaceId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=true`,
        {
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      if (abortRef.current !== controller) return;
      const nextAgents = Array.isArray(data) ? data : data.agents;
      setAgents(nextAgents);
      setCanAdminCurate(Boolean(data.canAdminCurate));
      setCanCreateAgent(Boolean(data.canCreateAgent));
      setCanExportResources(Boolean(data.canExportResources));
      setCanImportResources(Boolean(data.canImportResources));
      if (data.accessOptions) setAccessOptions(data.accessOptions);
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setLoadError(tList("loadErrorDescription"));
      }
      return;
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [tList, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshAgents(), 0);
    return () => {
      window.clearTimeout(timeout);
      abortRef.current?.abort();
    };
  }, [refreshAgents]);

  function applyTemplate(template: (typeof AGENT_TEMPLATES)[number]) {
    const name = tList(template.nameKey);
    setForm((current) => ({
      ...current,
      templateId: template.id,
      name,
      slug: slugifyAgentName(name),
      description: tList(template.descriptionKey),
      systemPrompt: tList(template.promptKey),
      promptSuggestions: template.suggestionKeys
        .map((key) => tList(key))
        .join("\n"),
    }));
  }

  const handleCreate = async () => {
    if (!workspaceId || !form.name.trim()) return;
    const slug = form.slug.trim() || slugifyAgentName(form.name);
    setCreating(true);
    try {
      const res = await fetch("/api/workspace/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          name: form.name.trim(),
          slug,
          description: form.description.trim() || undefined,
          systemPrompt: form.systemPrompt.trim() || undefined,
          promptSuggestions: form.promptSuggestions
            .split(/\n/)
            .map((suggestion) => suggestion.trim())
            .filter(Boolean),
          workspaceId,
          sharingMode: form.sharingMode,
          shareTargetEmail:
            form.sharingMode === "specific_user"
              ? form.shareTargetEmail.trim()
              : undefined,
          accessScope: form.accessScope,
          accessTeamId:
            form.accessScope === "team" ? form.accessTeamId : undefined,
          isGlobal: canAdminCurate ? form.isGlobal : undefined,
          isRecommended: canAdminCurate ? form.isRecommended : undefined,
          curationLabel: canAdminCurate ? form.curationLabel : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || tList("toastCreateFailed"));
      }

      const data = (await res.json()) as { agent?: Agent };
      toast.success(tList("toastCreated"));
      setShowCreateDialog(false);
      setForm({
        kind: "assistant",
        templateId: "blank",
        name: "",
        slug: "",
        description: "",
        systemPrompt: "",
        promptSuggestions: "",
        sharingMode: "personal",
        shareTargetEmail: "",
        accessScope: "private",
        accessTeamId: "",
        isGlobal: false,
        isRecommended: false,
        curationLabel: "none",
      });
      if (data.agent?.id) {
        router.push(`/agents/${data.agent.id}`);
        return;
      }
      await refreshAgents();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastCreateFailed"),
      );
      return;
    } finally {
      setCreating(false);
    }
  };

  async function openAgentAccess(agent: Agent) {
    if (!workspaceId || !agent.canEdit) return;
    try {
      const response = await fetch(
        `/api/workspace/agents/${agent.id}?workspaceId=${workspaceId}`,
      );
      const data = (await response.json().catch(() => ({}))) as Agent & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || tList("toastVisibilityFailed"));
      }
      setAccessAgent(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tList("toastVisibilityFailed"),
      );
    }
  }

  async function saveAgentAccess(selection: AgentAccessSelection) {
    if (!workspaceId || !accessAgent) return;
    const response = await fetch(`/api/workspace/agents/${accessAgent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        baseVersionId: accessAgent.activeVersionId,
        accessScope: selection.scope,
        accessTeamId: selection.scope === "team" ? selection.teamId : undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      agent?: Agent;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || tList("toastVisibilityFailed"));
    }
    setAccessAgent((current) =>
      current
        ? {
            ...current,
            ...(data.agent ?? {}),
            access: selection,
          }
        : null,
    );
  }

  async function setDefaultAgent(
    scope: "organization" | "user",
    agentId: string | null,
    actionAgentId: string,
  ) {
    if (!workspaceId || updatingDefaultAgentId) return;
    setUpdatingDefaultAgentId(actionAgentId);
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, scope, defaultAgentId: agentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || tList("toastDefaultFailed"));
      }
      const data = (await res.json()) as {
        organizationDefaultAgentId: string | null;
        userDefaultAgentId: string | null;
      };
      setOrganizationDefaultAgentId(data.organizationDefaultAgentId ?? null);
      setUserDefaultAgentId(data.userDefaultAgentId ?? null);
      setAgents((current) =>
        current.map((agent) => ({
          ...agent,
          isOrganizationDefault: agent.id === data.organizationDefaultAgentId,
        })),
      );
      toast.success(
        scope === "organization"
          ? tList("toastOrganizationDefaultSaved")
          : tList("toastUserDefaultSaved"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tList("toastDefaultFailed"),
      );
      return;
    } finally {
      setUpdatingDefaultAgentId(null);
    }
  }

  async function setAgentHiddenInChat(agentId: string, hidden: boolean) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_hidden",
          workspaceId,
          agentId,
          hidden,
        }),
      });
      if (!res.ok) throw new Error(tList("toastVisibilityFailed"));
      setAgents((current) =>
        current.map((agent) =>
          agent.id === agentId ? { ...agent, hiddenInChat: hidden } : agent,
        ),
      );
      toast.success(tList(hidden ? "toastHiddenFromChat" : "toastShownInChat"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tList("toastVisibilityFailed"),
      );
    }
  }

  const filteredAgents = agents.filter((agent) => {
    if (agent.hiddenInChat && !agent.canEdit) return false;
    if (agentKindFilter === "assistant" && agent.kind === "orchestrator") {
      return false;
    }
    if (agentKindFilter === "orchestrator" && agent.kind !== "orchestrator") {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(q) ||
      (agent.description ?? "").toLowerCase().includes(q) ||
      agent.slug.toLowerCase().includes(q)
    );
  });

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  return {
    kind: "ready",
    accessAgent,
    accessOptions,
    agentKindFilter,
    agents,
    applyTemplate,
    canAdminCurate,
    canCreateAgent,
    canExportResources,
    canImportResources,
    creating,
    displayMode,
    filteredAgents,
    form,
    handleCreate,
    loadError,
    loading,
    openAgentAccess,
    organizationDefaultAgentId,
    refreshAgents,
    router,
    saveAgentAccess,
    searchQuery,
    setAccessAgent,
    setAgentKindFilter,
    setDefaultAgent,
    setAgentHiddenInChat,
    setDisplayMode,
    setForm,
    setSearchQuery,
    setShowCreateDialog,
    showCreateDialog,
    t,
    tCommon,
    tList,
    updatingDefaultAgentId,
    userDefaultAgentId,
    workspaceId,
  } as const;
}

export default function AgentsPage(
  ...args: Parameters<typeof useAgentsPageController>
) {
  const model = useAgentsPageController(...args);
  if (!("kind" in model)) return model;
  return <AgentsPageView model={model} />;
}
