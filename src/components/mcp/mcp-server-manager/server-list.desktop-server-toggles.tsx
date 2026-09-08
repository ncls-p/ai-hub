"use client";

import {
  MoreHorizontal,
  PencilIcon,
  RefreshCwIcon,
  Share2,
  ShieldAlert,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ServerListProps } from "./server-list.server-list-props";
import type { McpServer } from "./types";
import { useWorkspace } from "@/hooks/use-workspace";
import { ResourcePackageExport } from "@/components/marketplace/resource-package-export";

export function DesktopServerToggles({
  server,
  onToggleEnabledAction,
  onToggleServerApprovalAction,
}: Pick<
  ServerListProps,
  "onToggleEnabledAction" | "onToggleServerApprovalAction"
> & {
  server: McpServer;
}) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div
      className="hidden items-center gap-3 sm:flex"
      onClick={(e) => e.stopPropagation()}
    >
      <LabeledSwitch
        label={t("enabled")}
        ariaLabel={t("enableNamed", { name: server.name })}
        checked={server.enabled}
        disabled={!server.canEdit}
        onCheckedChange={(checked) => onToggleEnabledAction(server, checked)}
      />
      <LabeledSwitch
        label={t("approval")}
        ariaLabel={t("approvalNamed", { name: server.name })}
        checked={server.requireApproval}
        disabled={!server.canEdit}
        onCheckedChange={(checked) =>
          onToggleServerApprovalAction(server, checked)
        }
      />
    </div>
  );
}

export function MobileServerToggles({
  server,
  onToggleEnabledAction,
  onToggleServerApprovalAction,
}: ServerListProps & { server: McpServer }) {
  const t = useTranslations("mcp.serverManager");
  return (
    <div className="flex items-center gap-4 border-t border-border/30 px-4 pt-2 pb-1 sm:hidden">
      <LabeledSwitch
        label={t("enabled")}
        ariaLabel={t("enableNamed", { name: server.name })}
        checked={server.enabled}
        disabled={!server.canEdit}
        onCheckedChange={(checked) => onToggleEnabledAction(server, checked)}
      />
      <LabeledSwitch
        label={t("approval")}
        ariaLabel={t("approvalNamed", { name: server.name })}
        checked={server.requireApproval}
        disabled={!server.canEdit}
        onCheckedChange={(checked) =>
          onToggleServerApprovalAction(server, checked)
        }
      />
      {server.requireApproval ? (
        <Badge variant="secondary">
          <ShieldAlert className="size-3" aria-hidden="true" />
          {t("approval")}
        </Badge>
      ) : null}
      {server.hasHeaders ? (
        <Badge variant="secondary">{t("apiKey")}</Badge>
      ) : null}
    </div>
  );
}

export function LabeledSwitch({
  label,
  ariaLabel,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function ServerActions({
  server,
  onEditServerAction,
  onDeleteServerAction,
  onRetryDiscoveryAction,
  onShareServerAction,
}: Pick<
  ServerListProps,
  | "onEditServerAction"
  | "onDeleteServerAction"
  | "onRetryDiscoveryAction"
  | "onShareServerAction"
> & { server: McpServer }) {
  const tShare = useTranslations("marketplace.share");
  const { workspaceId } = useWorkspace();
  const t = useTranslations("mcp.serverManager");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("serverActions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ResourcePackageExport
          presentation="menu-item"
          workspaceId={workspaceId}
          resource={{ kind: "mcp_server", id: server.id, name: server.name }}
        />
        {server.healthStatus === "unhealthy" ? (
          <DropdownMenuItem
            disabled={!server.canEdit}
            onClick={() => onRetryDiscoveryAction(server.id)}
          >
            <RefreshCwIcon className="size-4" />
            {t("retryDiscovery")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onShareServerAction(server)}
        >
          <Share2 className="size-4" />
          {tShare("action")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!server.canEdit}
          onClick={() => onEditServerAction(server)}
        >
          <PencilIcon className="size-4" />
          {t("editServer")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!server.canEdit}
          variant="destructive"
          onClick={() => onDeleteServerAction(server.id)}
        >
          <Trash2Icon className="size-4" />
          {t("removeServer")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
