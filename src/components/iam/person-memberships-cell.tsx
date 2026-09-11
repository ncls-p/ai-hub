import { Badge } from "@/components/ui/badge";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { PrincipalMembershipsDialog } from "./principal-memberships-dialog";

export function PersonMembershipsCell({
  model,
  person,
}: {
  model: AccessConsoleViewModel;
  person: AccessConsoleViewModel["visiblePeople"][number];
}) {
  const { t } = model;
  const isMember = person.memberStatus === "active";
  return (
    <>
      <span className="mb-2 hidden text-xs font-medium text-muted-foreground @max-3xl:block">
        {t("teamsColumn")}
      </span>
      {isMember ? (
        <PrincipalMembershipsDialog
          model={model}
          principal={{
            id: person.userId,
            name: person.name,
            type: "user",
          }}
        />
      ) : null}
      <details className="max-w-full">
        <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
          {t("simpleAccess.teamCount", {
            count: person.teams.length,
          })}
        </summary>
        <div className="flex max-w-xs flex-wrap gap-1">
          {person.teams.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            person.teams.map((team) => (
              <Badge
                key={team.id}
                variant="outline"
                className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
              >
                {team.name}
              </Badge>
            ))
          )}
        </div>
      </details>
    </>
  );
}
