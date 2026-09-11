import { usePathname, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab =
    requested && ["access", "teams", "roles", "resources"].includes(requested)
      ? requested
      : "access";
  function selectTab(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "access") next.delete("tab");
    else next.set("tab", value);
    window.history.pushState(
      null,
      "",
      next.size ? `${pathname}?${next}` : pathname,
    );
  }
  const tabClassName =
    "min-h-10 rounded-none data-[state=active]:text-foreground data-[state=active]:after:opacity-100 after:bottom-0";
  return (
    <Tabs value={tab} onValueChange={selectTab} className="min-w-0">
      <TabsList
        variant="line"
        className="grid w-full grid-cols-2 justify-start border-b border-border sm:flex"
      >
        <TabsTrigger className={tabClassName} value="access">
          {t("tabs.people")}
        </TabsTrigger>
        <TabsTrigger className={tabClassName} value="teams">
          {t("tabs.teams")}
        </TabsTrigger>
        <TabsTrigger className={tabClassName} value="roles">
          {t("tabs.roles")}
        </TabsTrigger>
        <TabsTrigger className={tabClassName} value="resources">
          {t("tabs.resources")}
        </TabsTrigger>
      </TabsList>

      <AccessMainSection3 model={model} />

      <TabsContent value="resources">
        <ResourceAccessPanel
          key={workspaceId}
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
