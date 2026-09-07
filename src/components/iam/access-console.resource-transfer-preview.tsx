"use client";

import { RefreshCwIcon, ShieldIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccessResource,
  TransferDestination,
} from "./access-console.access-member";

export type ResourceTransferPreview = {
  source: TransferDestination;
  destination: TransferDestination;
  crossOrganization: boolean;
  items: Array<
    AccessResource & {
      reason: "selected" | "parent" | "dependency" | "dependent" | "history";
    }
  >;
  warnings: string[];
  blockers: string[];
  directAssignments: { kept: number; removed: number };
  secrets: { affected: number; policy: "keep" | "disable" };
  confirmationToken: string;
};

export type ResourceTransferOptions = {
  includeDependencies: boolean;
  accessPolicy: "compatible" | "remove_all";
  ownershipPolicy: "preserve" | "actor";
  secretPolicy: "keep" | "disable";
};

export type MutationPayload = Record<string, unknown> & { action: string };

export const INITIAL_ORGANIZATION_FORM = {
  organizationName: "",
  projectName: "",
};
export const INITIAL_PROJECT_FORM = { name: "" };
export const INITIAL_TEAM_FORM = { name: "", description: "" };
export const INITIAL_ROLE_FORM = {
  displayName: "",
  description: "",
  scopeType: "workspace" as "organization" | "workspace",
  permissions: [] as string[],
};
export const INITIAL_ACCOUNT_FORM = {
  name: "",
  email: "",
  password: "",
  role: "user" as "user" | "admin",
};
export const INITIAL_TRANSFER_OPTIONS: ResourceTransferOptions = {
  includeDependencies: true,
  accessPolicy: "compatible",
  ownershipPolicy: "preserve",
  secretPolicy: "keep",
};

const BUILT_IN_ROLE_KEYS = {
  "organization.owner": "owner",
  "organization.admin": "organizationAdmin",
  "organization.user": "organizationMember",
  "workspace.admin": "projectAdmin",
  "workspace.member": "projectEditor",
  "workspace.viewer": "projectViewer",
  "workspace.knowledge_editor": "knowledgeEditor",
  "workspace.agent_user": "assistantUser",
} as const;

export function builtInRoleKey(roleName: string) {
  return BUILT_IN_ROLE_KEYS[roleName as keyof typeof BUILT_IN_ROLE_KEYS];
}

export function AccessConsoleSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-52 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    </div>
  );
}

export function InitialError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("access");
  return (
    <Empty className="min-h-80 border border-border/70 bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("loadFailed")}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        {t("retry")}
      </Button>
    </Empty>
  );
}
