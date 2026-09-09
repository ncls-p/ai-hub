"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { DiscoveredModel } from "@/components/providers/provider-manager/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { ONBOARDING_TOOL_PRESET } from "@/modules/agent/onboarding-tools";
import {
  ProviderModel,
  ProviderSummary,
  SetupWizardProps,
  StepId,
  defaultAuthType,
} from "./setup-wizard.button-type";
import { createSetupProviderForm } from "./setup-wizard.provider-form";
import {
  SetupWizardLoadError,
  SetupWizardLoading,
} from "./setup-wizard.status";
import { useSetupWizardCatalog } from "./setup-wizard.use-catalog";

export function useSetupWizardController({
  mode = "page",
  initialAgentId = null,
  onCompleteAction,
  onCancelAction,
}: SetupWizardProps) {
  const t = useTranslations("setup");
  const { workspaceId } = useWorkspace();
  const [step, setStep] = useState<StepId>("provider");
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelDbId, setModelDbId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [busy, setBusy] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providersLoadError, setProvidersLoadError] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsLoadError, setModelsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );
  const [providerForm, setProviderForm] = useState(() =>
    createSetupProviderForm(t("defaultProviderName")),
  );
  const [manualModelId, setManualModelId] = useState("");
  const [agentForm, setAgentForm] = useState({
    name: t("defaultAssistantName"),
  });

  useSetupWizardCatalog({
    workspaceId,
    providerId,
    loadAttempt,
    setLoadingProviders,
    setProvidersLoadError,
    setProviders,
    setProviderId,
    setStep,
    setLoadingModels,
    setModelsLoadError,
    setModels,
    setDiscoveredModels,
    setModelDbId,
  });

  async function createProvider() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const provider = await fetchJson<ProviderSummary>(
        "/api/workspace/providers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: providerForm.name,
            kind: providerForm.kind,
            authType: defaultAuthType(providerForm.kind),
            baseUrl: providerForm.baseUrl || undefined,
            apiKey: providerForm.apiKey || undefined,
            ...(providerForm.kind === "openai-compatible"
              ? {
                  openaiCompatibleApiRoute:
                    providerForm.openaiCompatibleApiRoute,
                }
              : {}),
          }),
        },
      );
      setProviders((current) => [provider, ...current]);
      setProviderId(provider.id);
      setStep("model");
      toast.success(t("toasts.providerSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.providerCreateFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  async function addAndSelectModel() {
    const modelId = manualModelId.trim();
    const displayName = modelId;
    if (!workspaceId) return;
    if (!providerId) return;
    if (!modelId) return;
    setBusy(true);
    try {
      const model = await fetchJson<ProviderModel>(
        `/api/workspace/providers/${providerId}/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            modelId,
            displayName,
          }),
        },
      );
      setModels((current) => [...current, model]);
      setModelDbId(model.id);
      setManualModelId("");
      toast.success(t("toasts.modelSelected"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.modelAddFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  async function addDiscoveredModel(modelId: string) {
    if (!workspaceId || !providerId) return;
    const candidate = discoveredModels.find(
      (model) => model.modelId === modelId,
    );
    if (!candidate) return;
    setBusy(true);
    try {
      const model = await fetchJson<ProviderModel>(
        `/api/workspace/providers/${providerId}/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            modelId: candidate.modelId,
            displayName: candidate.displayName ?? candidate.modelId,
            capabilitiesJson: candidate.capabilities,
            contextWindow: candidate.contextWindow,
            maxOutputTokens: candidate.maxOutputTokens,
            inputTokenCost: candidate.inputTokenCost,
            outputTokenCost: candidate.outputTokenCost,
            imageGenerationConfigJson: candidate.imageGeneration,
            sustainabilityConfigJson: candidate.sustainability,
          }),
        },
      );
      setModels([model]);
      setModelDbId(model.id);
      toast.success(t("toasts.modelSelected"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.modelAddFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!workspaceId) return;
    if (!providerId) return;
    if (!modelDbId) return;
    setBusy(true);
    try {
      let completedAgentId = agentId;

      if (completedAgentId) {
        const currentAgent = await fetchJson<{
          activeVersionId: string | null;
        }>(
          `/api/workspace/agents/${completedAgentId}?workspaceId=${workspaceId}`,
        );
        await fetchJson(`/api/workspace/agents/${completedAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            baseVersionId: currentAgent.activeVersionId,
            providerId,
            modelId: modelDbId,
          }),
        });
      } else {
        const data = await fetchJson<{ agent: { id: string } }>(
          "/api/workspace/agents",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              name: agentForm.name,
              systemPrompt: "",
              providerId,
              modelId: modelDbId,
              toolPreset: ONBOARDING_TOOL_PRESET,
            }),
          },
        );
        completedAgentId = data.agent.id;
        setAgentId(completedAgentId);
      }

      const onboardingResponse = await fetch("/api/onboarding", {
        method: "POST",
      });
      if (!onboardingResponse.ok) {
        toast.warning(t("toasts.onboardingMarkerFailed"));
      }
      toast.success(t("toasts.assistantReady"));
      if (completedAgentId) onCompleteAction?.(completedAgentId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.finishFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  if (!workspaceId) {
    return <SetupWizardLoading />;
  }

  if (providersLoadError || (step === "model" && modelsLoadError)) {
    return (
      <SetupWizardLoadError
        title={
          providersLoadError ? t("providerLoadFailed") : t("modelLoadFailed")
        }
        description={t("loadFailedDescription")}
        retryLabel={t("retry")}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    );
  }

  return {
    kind: "ready",
    addAndSelectModel,
    addDiscoveredModel,
    agentForm,
    agentId,
    busy,
    createProvider,
    discoveredModels,
    finishSetup,
    loadingModels,
    loadingProviders,
    manualModelId,
    mode,
    modelDbId,
    models,
    onCancelAction,
    providerForm,
    providerId,
    providers,
    selectedModel: models.find((model) => model.id === modelDbId),
    selectedProvider: providers.find((provider) => provider.id === providerId),
    setAgentForm,
    setManualModelId,
    setModelDbId,
    setProviderForm,
    setProviderId,
    setStep,
    step,
    t,
  } as const;
}
