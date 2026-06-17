"use client";

import { useParams } from "next/navigation";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

import type {
  Agent,
  AgentForm,
  Model,
  Provider,
  BuiltinTool,
  McpServer,
  McpTool,
  CustomTool,
  KnowledgeBase,
  AgentSkill,
  ToolBinding,
  KnowledgeBinding,
  SkillBinding,
  ToolBindingState,
} from "./types";
import { createEmptyForm } from "./types";
import {
  buildAgentFormFromVersion,
  type AgentVersionPayload,
} from "./agent-form-from-version";
import { isMcpToolApprovalForced } from "./utils";
import { TabBadge } from "./shared";
import { AgentHeader } from "./agent-header";
import { EssentialTab } from "./essential-tab";
import { CapabilitiesTab } from "./capabilities-tab";
import { DeleteDialog } from "./delete-dialog";

export default function AgentConfigurePage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const t = useTranslations("agents");

  const [agent, setAgent] = useState<Agent | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("essential");

  const [form, setForm] = useState<AgentForm>(createEmptyForm);
  const [builtinBindings, setBuiltinBindings] = useState<ToolBindingState>({});
  const [mcpBindings, setMcpBindings] = useState<ToolBindingState>({});
  const [customBindings, setCustomBindings] = useState<ToolBindingState>({});
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
    [],
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!agentId || !workspaceId) return;

    const [
      agentRes,
      providersRes,
      toolsRes,
      mcpRes,
      customToolsRes,
      kbRes,
      skillsRes,
      bindingsRes,
      knowledgeBindingsRes,
      skillBindingsRes,
    ] = await Promise.all([
      fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/providers?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/tools?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/mcp-servers?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/custom-tools?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/skills?workspaceId=${workspaceId}`),
      fetch(
        `/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
      ),
      fetch(
        `/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
      ),
      fetch(
        `/api/workspace/agents/${agentId}/skills?workspaceId=${workspaceId}`,
      ),
    ]);

    if (
      !agentRes.ok ||
      !providersRes.ok ||
      !toolsRes.ok ||
      !mcpRes.ok ||
      !customToolsRes.ok ||
      !kbRes.ok ||
      !skillsRes.ok
    ) {
      throw new Error("Unable to load agent settings");
    }

    const nextAgent = (await agentRes.json()) as Agent;

    let activeVersion: AgentVersionPayload | null = null;
    if (nextAgent.activeVersionId) {
      const versionRes = await fetch(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}&versionId=${nextAgent.activeVersionId}`,
      );
      if (versionRes.ok) {
        activeVersion = (await versionRes.json()) as AgentVersionPayload;
      }
    }
    if (!activeVersion) {
      const versionsRes = await fetch(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
      );
      if (versionsRes.ok) {
        const versions = (await versionsRes.json()) as AgentVersionPayload[];
        if (Array.isArray(versions)) {
          activeVersion =
            versions.find((version) => version.isActive) ?? versions[0] ?? null;
        }
      }
    }

    const providerRows = (await providersRes.json()) as Provider[];
    const builtinRows = (await toolsRes.json()) as BuiltinTool[];
    const mcpServerRows = (await mcpRes.json()) as McpServer[];
    const customToolRows = (await customToolsRes.json()) as CustomTool[];
    const kbRows = (await kbRes.json()) as KnowledgeBase[];
    const skillRows = (await skillsRes.json()) as AgentSkill[];
    const toolBindings = bindingsRes.ok
      ? ((await bindingsRes.json()) as ToolBinding[])
      : [];
    const knowledgeBindings = knowledgeBindingsRes.ok
      ? (
          (await knowledgeBindingsRes.json()) as {
            bindings: KnowledgeBinding[];
          }
        ).bindings
      : [];
    const skillBindings = skillBindingsRes.ok
      ? (
          (await skillBindingsRes.json()) as {
            bindings: SkillBinding[];
          }
        ).bindings
      : [];

    const modelRows = (
      await Promise.all(
        providerRows.map(async (provider) => {
          const res = await fetch(
            `/api/workspace/providers/${provider.id}/models?workspaceId=${workspaceId}`,
          );
          return res.ok ? ((await res.json()) as Model[]) : [];
        }),
      )
    ).flat();

    const mcpToolRows = (
      await Promise.all(
        mcpServerRows.map(async (server) => {
          const res = await fetch(
            `/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
          );
          return res.ok ? ((await res.json()) as McpTool[]) : [];
        }),
      )
    ).flat();

    setAgent(nextAgent);
    setProviders(providerRows);
    setModels(modelRows);
    setBuiltinTools(builtinRows);
    setMcpServers(mcpServerRows);
    setMcpTools(mcpToolRows);
    setCustomTools(customToolRows);
    setKnowledgeBases(kbRows);
    setSkills(skillRows);

    setForm(
      buildAgentFormFromVersion(
        nextAgent,
        activeVersion,
        nextAgent.shareTargetEmail,
      ),
    );

    const nextBuiltin: ToolBindingState = {};
    for (const tool of builtinRows) {
      const binding = toolBindings.find(
        (b) => b.toolSource === "builtin" && b.toolId === tool.id,
      );
      nextBuiltin[tool.id] = {
        enabled: Boolean(binding),
        requireApproval: binding?.requireApproval ?? false,
      };
    }
    setBuiltinBindings(nextBuiltin);

    const nextMcp: ToolBindingState = {};
    for (const tool of mcpToolRows) {
      const binding = toolBindings.find(
        (b) => b.toolSource === "mcp" && b.toolId === tool.id,
      );
      nextMcp[tool.id] = {
        enabled: Boolean(binding),
        requireApproval:
          binding?.requireApproval ?? tool.requireApproval ?? false,
      };
    }
    setMcpBindings(nextMcp);

    const nextCustom: ToolBindingState = {};
    for (const tool of customToolRows) {
      const binding = toolBindings.find(
        (b) => b.toolSource === "custom" && b.toolId === tool.id,
      );
      nextCustom[tool.id] = {
        enabled: Boolean(binding),
        requireApproval: binding?.requireApproval ?? true,
      };
    }
    setCustomBindings(nextCustom);
    setSelectedKnowledgeIds(knowledgeBindings.map((b) => b.knowledgeBaseId));
    setSelectedSkillIds(skillBindings.map((b) => b.skillId));
  }, [agentId, workspaceId]);

  useEffect(() => {
    if (!agentId || !workspaceId) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void loadData()
        .catch((error) =>
          toast.error(
            error instanceof Error ? error.message : "Unable to load agent",
          ),
        )
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [agentId, workspaceId, loadData]);

  async function saveEssential(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agent?.canEdit) {
      toast.error(t("configurePage.cloneToEditHint"));
      return;
    }
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const generationSettings = {
        topK: Number(form.generationSettings.topK) || undefined,
        presencePenalty:
          form.generationSettings.presencePenalty === ""
            ? undefined
            : Number(form.generationSettings.presencePenalty),
        frequencyPenalty:
          form.generationSettings.frequencyPenalty === ""
            ? undefined
            : Number(form.generationSettings.frequencyPenalty),
        seed:
          form.generationSettings.seed === ""
            ? undefined
            : Number(form.generationSettings.seed),
        maxRetries:
          form.generationSettings.maxRetries === ""
            ? undefined
            : Number(form.generationSettings.maxRetries),
        stopSequences: form.generationSettings.stopSequences
          .split(/\n|,/)
          .map((sequence) => sequence.trim())
          .filter(Boolean),
      };
      const res = await fetch(`/api/workspace/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: form.name,
          slug: form.slug,
          description: form.description,
          systemPrompt: form.systemPrompt,
          providerId: form.providerId || undefined,
          modelId: form.modelId || undefined,
          temperature: form.temperature,
          topP: form.topP,
          maxOutputTokens: Number(form.maxOutputTokens) || undefined,
          maxToolCalls: Number(form.maxToolCalls),
          toolChoice: form.toolChoice,
          generationSettings,
          responseFormat: form.responseFormat,
          memoryPolicy: form.memoryPolicy,
          guardrails: form.guardrails,
          approvalPolicy: form.approvalPolicy,
          ...(form.sharingMode !== form.originalSharingMode ||
          form.shareTargetEmail.trim()
            ? {
                sharingMode: form.sharingMode,
                shareTargetEmail:
                  form.sharingMode === "specific_user"
                    ? form.shareTargetEmail.trim()
                    : undefined,
              }
            : {}),
          ...(agent?.canAdminCurate
            ? {
                isGlobal: form.isGlobal,
                isRecommended: form.isRecommended,
                curationLabel: form.curationLabel,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error || "Unable to save agent",
        );
      }
      const data = (await res.json()) as {
        agent?: Agent;
        version?: AgentVersionPayload;
      };
      if (data.agent) {
        const updatedAgent = {
          ...data.agent,
          canAdminCurate: agent?.canAdminCurate ?? false,
        };
        setAgent(updatedAgent);
        if (data.version) {
          setForm(
            buildAgentFormFromVersion(
              updatedAgent,
              data.version,
              updatedAgent.shareTargetEmail,
            ),
          );
        } else {
          setForm((current) => ({
            ...current,
            originalSharingMode: data.agent!.sharingMode,
            shareTargetEmail: data.agent!.shareTargetEmail ?? "",
          }));
        }
      }
      toast.success(t("configurePage.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save agent",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCapabilities() {
    if (!agent?.canEdit) {
      toast.error(t("configurePage.cloneToEditHint"));
      return;
    }
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const bindings = [
        ...builtinTools
          .filter((tool) => builtinBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "builtin" as const,
            toolId: tool.id,
            requireApproval: builtinBindings[tool.id]?.requireApproval,
          })),
        ...mcpTools
          .filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "mcp" as const,
            toolId: tool.id,
            mcpServerId: tool.mcpServerId,
            requireApproval:
              isMcpToolApprovalForced(tool, mcpServers) ||
              mcpBindings[tool.id]?.requireApproval,
          })),
        ...customTools
          .filter((tool) => customBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "custom" as const,
            toolId: tool.id,
            requireApproval: customBindings[tool.id]?.requireApproval ?? true,
          })),
      ];
      const [toolsRes, kbRes, skillsRes] = await Promise.all([
        fetch(
          `/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bindings }),
          },
        ),
        fetch(
          `/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              knowledgeBaseIds: selectedKnowledgeIds,
            }),
          },
        ),
        fetch(
          `/api/workspace/agents/${agentId}/skills?workspaceId=${workspaceId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              skillIds: selectedSkillIds,
            }),
          },
        ),
      ]);
      if (!toolsRes.ok || !kbRes.ok || !skillsRes.ok) {
        throw new Error("Unable to save capabilities");
      }
      toast.success(t("configurePage.capabilitiesSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save capabilities",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClone() {
    if (!agentId || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspace/agents/${agentId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            t("list.toastCloneFailed"),
        );
      }
      const data = (await res.json()) as { agent?: Agent };
      toast.success(t("list.toastCloned"));
      if (data.agent?.id) window.location.href = `/agents/${data.agent.id}`;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("list.toastCloneFailed"),
      );
    }
  }

  async function handleDelete() {
    if (!agentId || !workspaceId || !agent?.canEdit) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            "Unable to delete agent",
        );
      }
      toast.success(t("configurePage.deleted"));
      window.location.href = "/agents";
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete agent",
      );
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  if (workspaceLoading || !workspaceId || loading) {
    return <PageLoading label={t("configure")} />;
  }

  const enabledBuiltinCount = builtinTools.filter(
    (tool) => builtinBindings[tool.id]?.enabled,
  ).length;
  const enabledMcpCount = mcpTools.filter(
    (tool) => tool.enabled && mcpBindings[tool.id]?.enabled,
  ).length;
  const enabledCustomCount = customTools.filter(
    (tool) => customBindings[tool.id]?.enabled,
  ).length;
  const totalEnabledTools =
    enabledBuiltinCount + enabledMcpCount + enabledCustomCount;
  const capabilitiesCount =
    totalEnabledTools + selectedKnowledgeIds.length + selectedSkillIds.length;
  const canEdit = agent?.canEdit ?? false;

  return (
    <WorkspacePage
      title={agent?.name ?? t("configure")}
      description={t("configureDescription")}
      width="default"
    >
      <div className="flex flex-col gap-6">
        {!canEdit ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("configurePage.lockedTitle")}
            </p>
            <p className="mt-1">{t("configurePage.lockedDescription")}</p>
          </div>
        ) : null}

        <AgentHeader
          agent={agent}
          providers={providers}
          models={models}
          form={form}
          totalEnabledTools={totalEnabledTools}
          enabledMcpCount={enabledMcpCount}
          selectedKnowledgeIds={selectedKnowledgeIds}
          canEdit={canEdit}
          onCloneAction={() => void handleClone()}
          onShowDeleteDialogAction={() => setShowDeleteDialog(true)}
        />

        <div className="rounded-2xl border bg-card px-5 pb-5 pt-5 animate-in-fade stagger-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full flex-wrap sm:w-auto">
              <TabsTrigger value="essential" className="gap-2">
                {t("tabs.essential")}
              </TabsTrigger>
              <TabsTrigger value="capabilities" className="gap-2">
                {t("tabs.capabilities")}
                <TabBadge count={capabilitiesCount} />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="essential" className="mt-4">
              <EssentialTab
                form={form}
                setFormAction={setForm}
                providers={providers}
                models={models}
                saving={saving}
                canAdminCurate={agent?.canAdminCurate ?? false}
                readOnly={!canEdit}
                onSaveAction={saveEssential}
              />
            </TabsContent>

            <TabsContent value="capabilities" className="mt-4">
              <CapabilitiesTab
                builtinTools={builtinTools}
                builtinBindings={builtinBindings}
                setBuiltinBindingsAction={setBuiltinBindings}
                mcpServers={mcpServers}
                mcpTools={mcpTools}
                mcpBindings={mcpBindings}
                setMcpBindingsAction={setMcpBindings}
                customTools={customTools}
                customBindings={customBindings}
                setCustomBindingsAction={setCustomBindings}
                knowledgeBases={knowledgeBases}
                selectedKnowledgeIds={selectedKnowledgeIds}
                setSelectedKnowledgeIdsAction={setSelectedKnowledgeIds}
                skills={skills}
                selectedSkillIds={selectedSkillIds}
                setSelectedSkillIdsAction={setSelectedSkillIds}
                saving={saving}
                readOnly={!canEdit}
                onSaveAction={() => void saveCapabilities()}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(false);
        }}
        agentName={agent?.name ?? null}
        deleting={deleting}
        onDelete={handleDelete}
      />
    </WorkspacePage>
  );
}
