import { BoxesIcon, UsersIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessMainSection1 } from "./access-console.access-console.view.section-1.section-1";
import { AccessMainSection2 } from "./access-console.access-console.view.section-1.section-2";
import { AccessMainSection3 } from "./access-console.access-console.view.section-1.section-3";
import { ResourceAccessPanel } from "./access-console.resource-access-panel";

export function AccessConsoleSection1({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { snapshot, t, workspaceId } = model;
  return (
    <Tabs defaultValue="access" className="min-w-0">
      <TabsList className="grid! h-auto w-full grid-cols-2 rounded-xl! sm:flex! sm:w-fit">
        <TabsTrigger value="access">
          <UsersIcon data-icon="inline-start" aria-hidden="true" />
          {t("tabs.people")}
        </TabsTrigger>
        <TabsTrigger value="teams">{t("tabs.teams")}</TabsTrigger>
        <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
        <TabsTrigger value="resources">
          <BoxesIcon data-icon="inline-start" aria-hidden="true" />
          {t("tabs.resources")}
        </TabsTrigger>
      </TabsList>

      <AccessMainSection3 model={model} />

      <TabsContent value="resources">
        <ResourceAccessPanel
          workspaceId={workspaceId}
          organizationId={snapshot.organization.id}
          definitions={snapshot.resourceDefinitions}
          canManageResources={snapshot.capabilities.canManageProjectAccess}
        />
      </TabsContent>

      <AccessMainSection2 model={model} />

      <AccessMainSection1 model={model} />
    </Tabs>
  );
}
