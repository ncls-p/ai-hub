import { RefreshCwIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { useAccessConsoleController } from "./access-console.access-console";
import { AccessConsoleSection1 } from "./access-console.access-console.view.section-1";
import { AccessProjectSelector } from "./access-project-selector";

export type AccessConsoleViewModel = Extract<
  ReturnType<typeof useAccessConsoleController>,
  { kind: "ready" }
>;
export function AccessConsoleView({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { canManageAnything, load, refreshError, t } = model;
  return (
    <div className="flex flex-col gap-5">
      {refreshError ? (
        <Alert variant="destructive">
          <ShieldIcon aria-hidden="true" />
          <AlertTitle>{t("refreshFailed")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{refreshError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load({ preserveData: true })}
            >
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <AccessProjectSelector />

      {!canManageAnything ? (
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>{t("readOnlyTitle")}</AlertTitle>
          <AlertDescription>{t("readOnlyDescription")}</AlertDescription>
        </Alert>
      ) : null}

      <AccessConsoleSection1 model={model} />
    </div>
  );
}
