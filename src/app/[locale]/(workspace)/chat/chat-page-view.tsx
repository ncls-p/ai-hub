"use client";

import { Loader2, MessageSquareIcon, PlusIcon } from "lucide-react";
import { useLocale } from "next-intl";

import { MaiahAnimatedMark } from "@/components/chat/maiah-animated-mark";
import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  CHAT_INTERFACE_MODE,
  CODING_INTERFACE_MODE,
  type InterfaceMode,
} from "./chat-interface-mode";

type ChatTranslator = (key: string, values?: Record<string, string>) => string;

export function ChatPageLoading({ t }: { t: ChatTranslator }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex size-12 items-center justify-center rounded-full border bg-card">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col items-center gap-1 text-sm">
        <span className="font-medium text-foreground">{t("loadingTitle")}</span>
        <span className="text-xs text-muted-foreground">
          {t("loadingDescription")}
        </span>
      </div>
    </div>
  );
}

export function NoAssistantsState({
  canCreateAgent,
  canRunSetup,
  t,
}: {
  canCreateAgent: boolean;
  canRunSetup: boolean;
  t: ChatTranslator;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-4 animate-in-fade">
      <Empty className="min-h-80 w-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("noAssistants")}</EmptyTitle>
          <EmptyDescription>{t("noAssistantsDescription")}</EmptyDescription>
        </EmptyHeader>
        {canRunSetup || canCreateAgent ? (
          <div className="flex justify-center">
            <Button asChild>
              <Link href={canRunSetup ? "/setup" : "/agents"}>
                <PlusIcon className="size-4" aria-hidden="true" />
                {canRunSetup ? t("finishSetup") : t("createAgent")}
              </Link>
            </Button>
          </div>
        ) : null}
      </Empty>
    </div>
  );
}

export function CodeWorkspaceModeBar({
  artifact,
  interfaceMode,
  onModeChange,
}: {
  artifact: CodeWorkspaceArtifact;
  interfaceMode: InterfaceMode;
  onModeChange: (mode: InterfaceMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-3 py-2 sm:px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {artifact.title}
        </p>
        <p className="text-xs text-muted-foreground">
          Code workspace · v{artifact.version}
        </p>
      </div>
      <div className="flex shrink-0 items-center rounded-lg border bg-muted/30 p-0.5">
        <Button
          type="button"
          variant={
            interfaceMode === CHAT_INTERFACE_MODE ? "secondary" : "ghost"
          }
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onModeChange(CHAT_INTERFACE_MODE)}
        >
          Chat
        </Button>
        <Button
          type="button"
          variant={
            interfaceMode === CODING_INTERFACE_MODE ? "secondary" : "ghost"
          }
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onModeChange(CODING_INTERFACE_MODE)}
        >
          Coding
        </Button>
      </div>
    </div>
  );
}

export function EmptyConversationState({
  needsSetup,
  t,
}: {
  needsSetup: boolean;
  t: ChatTranslator;
}) {
  const locale = useLocale() === "fr" ? "fr" : "en";
  const { organizationHeroConfig } = useWorkspace();
  const hero = organizationHeroConfig?.[locale];
  return (
    <div className="empty-chat-hero mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-start px-4 pb-12 animate-in-fade">
      <div className="flex max-w-3xl flex-col items-center text-center">
        <MaiahAnimatedMark />
        <p className="workspace-page-kicker empty-chat-hero__kicker text-[0.62rem]">
          {hero?.kicker ?? t("heroKicker")}
        </p>
        <h1 className="empty-chat-hero__title text-balance font-sans font-medium leading-[0.98] tracking-[-0.06em] text-foreground">
          {hero?.lineOne ?? t("heroLineOne")}
          <br />
          {hero?.lineTwoPrefix ?? "Maiah"}{" "}
          <em className="font-editorial font-normal text-primary">
            {hero?.accent ?? t("heroAccent")}
          </em>{" "}
          {hero?.lineTwoSuffix ?? t("heroLineTwo")}
        </h1>
        {needsSetup ? (
          <p className="mt-5 max-w-md text-sm text-muted-foreground">
            {t("emptySetup")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
