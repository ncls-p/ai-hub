import {
  EyeIcon,
  EyeOffIcon,
  MoreHorizontal,
  PencilIcon,
  Share2,
  StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourcePackageExport } from "@/components/marketplace/resource-package-export";
import { cn } from "@/lib/utils";
import type { AgentsPageViewModel } from "./page.agents-page.view";
import { ICON_SIZE_CLASS } from "./page.icon-size-class";

export function AgentCardActions({
  agent,
  model,
  isReady,
  isUserDefault,
}: {
  agent: AgentsPageViewModel["filteredAgents"][number];
  model: AgentsPageViewModel;
  isReady: boolean;
  isUserDefault: boolean;
}) {
  const {
    canExportResources,
    workspaceId,
    router,
    tList,
    updatingDefaultAgentId,
    setDefaultAgent,
    setAgentHiddenInChat,
    openAgentAccess,
  } = model;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-10 shrink-0 rounded-full text-muted-foreground transition-[background-color,color,scale] hover:text-foreground active:scale-[0.96]"
          aria-label={tList("agentActionsNamed", {
            name: agent.name,
          })}
        >
          <MoreHorizontal className={ICON_SIZE_CLASS} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {isReady ? (
          <DropdownMenuItem
            className="min-h-10"
            onClick={() => router.push(`/agents/${agent.id}`)}
          >
            <PencilIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
            {agent.canEdit ? tList("customize") : tList("viewDetails")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="min-h-10"
          disabled={updatingDefaultAgentId !== null}
          onClick={() =>
            void setDefaultAgent(
              "user",
              isUserDefault ? null : agent.id,
              agent.id,
            )
          }
        >
          <StarIcon
            className={cn(
              ICON_SIZE_CLASS,
              isUserDefault && "fill-current text-primary",
            )}
            aria-hidden="true"
          />
          {isUserDefault ? tList("clearMyDefault") : tList("setMyDefault")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-10"
          onClick={() =>
            void setAgentHiddenInChat(agent.id, !agent.hiddenInChat)
          }
        >
          {agent.hiddenInChat ? (
            <EyeIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
          ) : (
            <EyeOffIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
          )}
          {agent.hiddenInChat
            ? tList("showInChatSelector")
            : agent.canEdit
              ? tList("hideFromChatSelector")
              : tList("removeSharedAssistant")}
        </DropdownMenuItem>
        {canExportResources && agent.activeVersionId && (
          <ResourcePackageExport
            presentation="menu-item"
            workspaceId={workspaceId}
            resource={{
              kind: "agent",
              id: agent.id,
              name: agent.name,
            }}
          />
        )}
        {agent.canEdit && agent.kind !== "orchestrator" ? (
          <DropdownMenuItem
            className="min-h-10"
            onClick={() => void openAgentAccess(agent)}
          >
            <Share2 className={ICON_SIZE_CLASS} aria-hidden="true" />
            {tList("manageAccess")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
