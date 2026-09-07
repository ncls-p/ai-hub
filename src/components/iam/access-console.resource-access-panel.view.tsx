import { ScopeMigrationDialog } from "@/components/iam/scope-migration-dialog";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { useResourceAccessPanelController } from "./access-console.resource-access-panel";
import { ResourceAccessPanelSection1 } from "./access-console.resource-access-panel.view.section-1";
import { ResourceAccessPanelSection2 } from "./access-console.resource-access-panel.view.section-2";
import { ResourceAccessPanelSection3 } from "./access-console.resource-access-panel.view.section-3";
import { ResourceAccessPanelSection4 } from "./access-console.resource-access-panel.view.section-4";

export type ResourceAccessPanelViewModel = Extract<
  ReturnType<typeof useResourceAccessPanelController>,
  { kind: "ready" }
>;
export function ResourceAccessPanelView({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const { canManageResources, t, workspaceId } = model;
  return (
    <Card className="rounded-none border-0 bg-transparent shadow-none">
      <CardHeader className="grid-cols-1! px-0 sm:grid-cols-[1fr_auto]!">
        <CardTitle>{t("resourcesTitle")}</CardTitle>
        <CardDescription>{t("resourcesDescription")}</CardDescription>
        {canManageResources ? (
          <CardAction className="col-start-1 row-start-auto sm:col-start-2 sm:row-start-1">
            <details>
              <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
                {t("simpleAccess.advancedActions")}
              </summary>
              <div className="pt-2">
                <ScopeMigrationDialog workspaceId={workspaceId} />
              </div>
            </details>
          </CardAction>
        ) : null}
      </CardHeader>
      <ResourceAccessPanelSection4 model={model} />

      <ResourceAccessPanelSection3 model={model} />

      <ResourceAccessPanelSection2 model={model} />

      <ResourceAccessPanelSection1 model={model} />
    </Card>
  );
}
