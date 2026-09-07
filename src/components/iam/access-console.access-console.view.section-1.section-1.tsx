import { PermissionMatrix } from "./permission-matrix";
import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessRolesSection1 } from "./access-console.access-console.view.section-1.section-1.section-1";
import { AccessRolesSection2 } from "./access-console.access-console.view.section-1.section-1.section-2";

export function AccessMainSection1({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {} = model;
  return (
    <TabsContent value="roles" className="flex flex-col gap-4">
      <Card className="rounded-none border-0 bg-transparent shadow-none">
        <AccessRolesSection2 model={model} />
        <AccessRolesSection1 model={model} />
      </Card>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          {model.t("simpleAccess.viewMatrix")}
        </summary>
        <div className="pt-4">
          <PermissionMatrix
            snapshot={model.snapshot}
            roleLabel={model.roleLabel}
          />
        </div>
      </details>
    </TabsContent>
  );
}
