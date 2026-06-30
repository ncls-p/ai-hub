"use client";

import { Link } from "@/i18n/navigation";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  ImagePlusIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ModelLogo } from "@/components/providers/model-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MetricCell } from "./shared";
import type { Agent, Model, Provider } from "./types";

const MAX_LOGO_BYTES = 256 * 1024;

function readLogoFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      reject(
        new Error("Use a bitmap image such as PNG, JPG, WebP, GIF, or AVIF."),
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error("Logo must stay under 256 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read logo file."));
    reader.readAsDataURL(file);
  });
}

function AgentLogoControls({
  agent,
  agentLabel,
  canEdit,
  onLogoChange,
}: {
  agent: Agent | null;
  agentLabel: string;
  canEdit: boolean;
  onLogoChange: (logoUrl: string | null) => void;
}) {
  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    try {
      onLogoChange(await readLogoFile(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid image file",
      );
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <ModelLogo
        logoUrl={agent?.logoUrl}
        label={agentLabel}
        size="lg"
        imageFit="cover"
        className="rounded-full"
      />
      {canEdit && agent?.id ? (
        <div className="flex items-center gap-1">
          <input
            id={`agent-logo-${agent.id}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/*"
            className="sr-only"
            onChange={(event) => {
              void handleLogoFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <Button size="xs" variant="outline" asChild>
            <label
              htmlFor={`agent-logo-${agent.id}`}
              aria-label="Change assistant logo"
              className="cursor-pointer"
            >
              <ImagePlusIcon data-icon="inline-start" aria-hidden="true" />
              Logo
            </label>
          </Button>
          {agent.logoUrl ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Remove assistant logo"
              onClick={() => onLogoChange(null)}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgentHeaderTitle({
  agent,
  form,
  hasModel,
  providerName,
  modelLabel,
  t,
}: {
  agent: Agent | null;
  form: { name: string };
  hasModel: boolean;
  providerName?: string;
  modelLabel?: string;
  t: ReturnType<typeof useTranslations<"agents">>;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {agent?.name ?? form.name}
        </h2>
        {hasModel ? (
          <Badge
            variant="outline"
            className="gap-1 border-success/30 bg-success/10 text-success"
          >
            <CheckCircle2Icon className="size-3" aria-hidden="true" />
            {t("statusReady")}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <ClockIcon className="size-3" aria-hidden="true" />
            {t("statusMissingModel")}
          </Badge>
        )}
      </div>
      {hasModel ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {providerName}
          {modelLabel ? (
            <span className="ml-1 opacity-70">· {modelLabel}</span>
          ) : null}
        </p>
      ) : agent?.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {agent.description}
        </p>
      ) : null}
    </div>
  );
}

function AgentHeaderActions({
  agent,
  canEdit,
  hasModel,
  onClone,
  onShowDeleteDialog,
  t,
}: {
  agent: Agent | null;
  canEdit: boolean;
  hasModel: boolean;
  onClone: () => void;
  onShowDeleteDialog: () => void;
  t: ReturnType<typeof useTranslations<"agents">>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
      {hasModel && agent?.id ? (
        <Button asChild size="sm">
          <Link href={`/chat?agentId=${agent.id}`}>
            <MessageCircleIcon className="size-4" aria-hidden="true" />
            {t("chat")}
          </Link>
        </Button>
      ) : null}
      {agent?.id && agent.canClone !== false ? (
        <Button variant="outline" size="sm" onClick={onClone}>
          <CopyIcon className="size-4" aria-hidden="true" />
          {t("list.clone")}
        </Button>
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href="/agents">
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("configurePage.back")}</span>
        </Link>
      </Button>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-8">
              <MoreHorizontalIcon className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onShowDeleteDialog}
            >
              <Trash2Icon className="size-4" aria-hidden="true" />
              {t("configurePage.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function AgentHeader({
  agent,
  providers,
  models,
  form,
  totalEnabledTools,
  enabledMcpCount,
  selectedKnowledgeIds,
  canEdit,
  onLogoChangeAction: onLogoChange,
  onCloneAction: onClone,
  onShowDeleteDialogAction: onShowDeleteDialog,
}: {
  agent: Agent | null;
  providers: Provider[];
  models: Model[];
  form: { providerId: string; modelId: string; name: string };
  totalEnabledTools: number;
  enabledMcpCount: number;
  selectedKnowledgeIds: string[];
  canEdit: boolean;
  onLogoChangeAction: (logoUrl: string | null) => void;
  onCloneAction: () => void;
  onShowDeleteDialogAction: () => void;
}) {
  const t = useTranslations("agents");
  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const selectedModel = models.find((m) => m.id === form.modelId);
  const selectedModelLabel =
    selectedModel?.displayName || selectedModel?.modelId;
  const agentLabel = agent?.name ?? form.name;
  const hasModel = Boolean(form.providerId && form.modelId);

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <AgentLogoControls
          agent={agent}
          agentLabel={agentLabel}
          canEdit={canEdit}
          onLogoChange={onLogoChange}
        />
        <AgentHeaderTitle
          agent={agent}
          form={form}
          hasModel={hasModel}
          providerName={selectedProvider?.name}
          modelLabel={selectedModelLabel}
          t={t}
        />
        <AgentHeaderActions
          agent={agent}
          canEdit={canEdit}
          hasModel={hasModel}
          onClone={onClone}
          onShowDeleteDialog={onShowDeleteDialog}
          t={t}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-5">
        <MetricCell label={t("tabs.tools")} value={totalEnabledTools} />
        <MetricCell
          label={t("tabs.knowledge")}
          value={selectedKnowledgeIds.length}
        />
        <MetricCell label="MCP" value={enabledMcpCount} />
      </div>
    </div>
  );
}
