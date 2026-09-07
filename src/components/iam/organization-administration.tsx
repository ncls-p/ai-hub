"use client";

import { useWorkspaceShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAccessConsoleController } from "./access-console.access-console";
import { AccessConsoleSection2 } from "./access-console.access-console.view.section-2";

function OrganizationAdministrationContent() {
  const model = useAccessConsoleController({});
  if (!("kind" in model)) return model;
  return (
    <>
      {model.refreshError ? (
        <Alert variant="destructive">
          <AlertTitle>{model.t("refreshFailed")}</AlertTitle>
          <AlertDescription>
            {model.refreshError}
            <Button
              type="button"
              variant="outline"
              onClick={() => void model.load({ preserveData: true })}
            >
              {model.t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <AccessConsoleSection2 model={model} />
    </>
  );
}

export function OrganizationAdministration() {
  const { permissions, permissionsReady } = useWorkspaceShell();
  return permissionsReady && permissions.canManageAccess ? (
    <OrganizationAdministrationContent />
  ) : null;
}
