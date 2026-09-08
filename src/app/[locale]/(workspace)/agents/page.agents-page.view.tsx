import { PlusIcon } from "lucide-react";

import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { ResourcePackageImport } from "@/components/marketplace/resource-package-import";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import type { useAgentsPageController } from "./page.agents-page";
import { AgentsPageSection1 } from "./page.agents-page.view.section-1";
import { AgentsPageSection2 } from "./page.agents-page.view.section-2";
import { ICON_SIZE_CLASS } from "./page.icon-size-class";

export type AgentsPageViewModel = Extract<
  ReturnType<typeof useAgentsPageController>,
  { kind: "ready" }
>;
export function AgentsPageView({ model }: { model: AgentsPageViewModel }) {
  const {
    accessAgent,
    accessOptions,
    agents,
    canCreateAgent,
    canImportResources,
    loading,
    refreshAgents,
    saveAgentAccess,
    setAccessAgent,
    setShowCreateDialog,
    t,
    workspaceId,
  } = model;
  return (
    <WorkspacePage
      title={t("orbitTitle")}
      accentTitle={t("orbitAccent")}
      eyebrow={t("orbitEyebrow")}
      description={t("orbitDescription")}
      width="default"
      actions={
        <>
          {canCreateAgent && canImportResources && !loading && (
            <ResourcePackageImport
              key={workspaceId}
              workspaceId={workspaceId}
            />
          )}
          {canCreateAgent && !loading && agents.length > 0 ? (
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <PlusIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
              {t("create")}
            </Button>
          ) : null}
        </>
      }
    >
      <AgentsPageSection2 model={model} />

      {/* Create dialog */}
      <AgentsPageSection1 model={model} />

      <ResourceAccessDialog
        open={accessAgent !== null}
        workspaceId={workspaceId}
        resource={
          accessAgent
            ? { id: accessAgent.id, name: accessAgent.name, type: "agent" }
            : null
        }
        selection={accessAgent?.access ?? { scope: "private" }}
        options={accessOptions}
        includeDependencies
        onOpenChangeAction={(open) => {
          if (!open) setAccessAgent(null);
        }}
        onScopeSaveAction={saveAgentAccess}
        onSavedAction={refreshAgents}
      />
    </WorkspacePage>
  );
}
