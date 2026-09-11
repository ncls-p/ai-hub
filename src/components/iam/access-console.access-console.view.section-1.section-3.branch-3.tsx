import { ShieldIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
export function AccessPeopleBranch3({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { peopleQuery, t } = model;
  const filtered = Boolean(
    peopleQuery || model.peopleTeamId !== "all" || model.peopleProjectOnly,
  );
  return (
    <Empty className="min-h-52">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {filtered ? t("noSearchResults") : t("noAssignments")}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? t("noSearchResultsDescription")
            : t("noAssignmentsDescription")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
