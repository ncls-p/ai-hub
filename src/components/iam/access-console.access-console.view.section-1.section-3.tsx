import { SearchIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessPeopleBranch1 } from "./access-console.access-console.view.section-1.section-3.branch-1";
import { AccessPeopleBranch2 } from "./access-console.access-console.view.section-1.section-3.branch-2";
import { AccessPeopleBranch3 } from "./access-console.access-console.view.section-1.section-3.branch-3";
import { AccessPeopleBranch4 } from "./access-console.access-console.view.section-1.section-3.branch-4";
import { AccessPeopleBranch5 } from "./access-console.access-console.view.section-1.section-3.branch-5";

export function AccessMainSection3({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    canManageMembers,
    canManageOrganizationAccess,
    canManageProjectAccess,
    people,
    peopleQuery,
    selectedPeople,
    setPeopleQuery,
    setVisiblePeopleCount,
    t,
    visiblePeople,
  } = model;
  return (
    <TabsContent value="access" className="flex flex-col gap-4">
      <Card className="rounded-none border-0 bg-transparent shadow-none">
        <CardHeader className="grid-cols-1! px-0 lg:grid-cols-[1fr_auto]!">
          <CardTitle>{t("assignmentsTitle")}</CardTitle>
          <CardDescription>{t("assignmentsDescription")}</CardDescription>
          {canManageMembers ||
          canManageProjectAccess ||
          canManageOrganizationAccess ? (
            <AccessPeopleBranch5 model={model} />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="people-search"
                className="pl-9"
                value={peopleQuery}
                placeholder={t("searchPeople")}
                aria-label={t("searchPeople")}
                onChange={(event) => {
                  setPeopleQuery(event.target.value);
                  setVisiblePeopleCount(25);
                }}
              />
            </div>
            {selectedPeople.length > 0 &&
            (canManageProjectAccess || canManageOrganizationAccess) ? (
              <AccessPeopleBranch4 model={model} />
            ) : null}
          </div>

          {people.length === 0 ? (
            <AccessPeopleBranch3 model={model} />
          ) : (
            <AccessPeopleBranch2 model={model} />
          )}
          {people.length > visiblePeople.length ? (
            <AccessPeopleBranch1 model={model} />
          ) : null}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
