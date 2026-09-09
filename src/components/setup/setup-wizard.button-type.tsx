"use client";

import { CheckCircle2Icon, MessageSquareIcon, PlugZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";

const steps = [
  { id: "provider", icon: PlugZapIcon },
  { id: "model", icon: CheckCircle2Icon },
  { id: "agent", icon: MessageSquareIcon },
] as const;

export type StepId = (typeof steps)[number]["id"];
export type ProviderKind =
  "openai-compatible" | "dragonfly" | "vercel-ai-gateway";
type ProviderAuthType = "bearer" | "x-api-key" | "gateway";

export type ProviderSummary = {
  id: string;
  name: string;
  kind: ProviderKind;
};

export type ProviderModel = {
  id: string;
  modelId: string;
  displayName: string | null;
  capabilitiesJson?: Record<string, boolean> | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  inputTokenCost?: string | null;
  outputTokenCost?: string | null;
  enabled?: boolean;
};

export function defaultAuthType(kind: ProviderKind): ProviderAuthType {
  if (kind === "dragonfly") return "x-api-key";
  if (kind === "vercel-ai-gateway") return "gateway";
  return "bearer";
}

function formatModelNumber(value: number | null | undefined) {
  return typeof value === "number" && value > 0
    ? new Intl.NumberFormat().format(value)
    : null;
}

export function ModelMetadata({
  capabilities,
  contextWindow,
  maxOutputTokens,
  inputTokenCost,
  outputTokenCost,
  hostedBy,
  enabled,
}: {
  capabilities?: Record<string, boolean> | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  inputTokenCost?: string | null;
  outputTokenCost?: string | null;
  hostedBy?: string | null;
  enabled?: boolean;
}) {
  const t = useTranslations("setup.modelMetadata");
  const enabledCapabilities = Object.entries(capabilities ?? {})
    .filter(([, value]) => value)
    .map(([key]) => key);
  const contextWindowLabel = formatModelNumber(contextWindow);
  const maxOutputTokensLabel = formatModelNumber(maxOutputTokens);

  const hasNoMetadata =
    enabled !== false &&
    !hostedBy &&
    !contextWindowLabel &&
    !maxOutputTokensLabel &&
    !inputTokenCost &&
    !outputTokenCost &&
    enabledCapabilities.length === 0;
  if (hasNoMetadata) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {enabled === false ? (
        <Badge variant={OUTLINE_VARIANT}>{t("disabled")}</Badge>
      ) : null}
      {hostedBy ? <Badge variant={OUTLINE_VARIANT}>{hostedBy}</Badge> : null}
      {contextWindowLabel ? (
        <Badge variant={OUTLINE_VARIANT}>
          {t("context", { value: contextWindowLabel })}
        </Badge>
      ) : null}
      {maxOutputTokensLabel ? (
        <Badge variant={OUTLINE_VARIANT}>
          {t("maxOutput", { value: maxOutputTokensLabel })}
        </Badge>
      ) : null}
      {inputTokenCost ? (
        <Badge variant={OUTLINE_VARIANT}>
          {t("input", { value: inputTokenCost })}
        </Badge>
      ) : null}
      {outputTokenCost ? (
        <Badge variant={OUTLINE_VARIANT}>
          {t("output", { value: outputTokenCost })}
        </Badge>
      ) : null}
      {enabledCapabilities.map((capability) => (
        <Badge key={capability} variant="secondary" className="capitalize">
          {capability}
        </Badge>
      ))}
    </div>
  );
}

/* ── Stepper ── */

export function SetupStepper({ currentStep }: { currentStep: StepId }) {
  const t = useTranslations("setup.steps");
  const stepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max items-center gap-0">
        {steps.map((item, i) => {
          const isActive = i === stepIndex;
          const isComplete = i < stepIndex;

          return (
            <div key={item.id} className="flex items-center gap-0">
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out",
                  isComplete
                    ? "border-primary/30 bg-primary/8 text-primary"
                    : isActive
                      ? "border-primary bg-primary/6 text-primary shadow-sm shadow-primary/10"
                      : "border-border/60 text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    "font-medium",
                    !isActive && !isComplete && "text-muted-foreground",
                  )}
                >
                  {t(item.id)}
                </span>
              </div>
              {i < steps.length - 1 ? (
                <div
                  className={cn(
                    "mx-2 h-px w-8 sm:w-16 transition-colors",
                    i < stepIndex ? "bg-primary/40" : "bg-border/60",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Wizard ── */

export type SetupWizardProps = {
  mode?: "page" | "dialog";
  initialAgentId?: string | null;
  onCompleteAction?: (agentId: string) => void;
  onCancelAction?: () => void;
};
