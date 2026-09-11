import { Button } from "@/components/ui/button";
import { GovernanceSelect } from "./governance-select";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";

export function AccessPeopleFilters({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const { t, snapshot, peopleTeamId, peopleProjectOnly } = model;
  function resetSelection() {
    model.setSelectedPeople([]);
    model.setVisiblePeopleCount(25);
  }
  const active =
    peopleTeamId !== "all" || peopleProjectOnly || Boolean(model.peopleQuery);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <GovernanceSelect
          label={t("filters.team")}
          value={peopleTeamId}
          options={[
            { id: "all", name: t("filters.allTeams") },
            ...snapshot.teams,
          ]}
          onChange={(id) => {
            model.setPeopleTeamId(id);
            resetSelection();
          }}
        />
        <GovernanceSelect
          label={t("filters.project")}
          value={peopleProjectOnly ? model.workspaceId : "all"}
          options={[
            { id: "all", name: t("filters.allProjects") },
            ...snapshot.projects,
          ]}
          onChange={(id) => {
            model.setPeopleProjectOnly(id !== "all");
            if (id !== "all") model.setWorkspaceId(id);
            resetSelection();
          }}
        />
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">
          {t("filters.resultCount", {
            count: model.people.length,
            total: model.totalPeopleCount,
          })}
        </p>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              model.setPeopleTeamId("all");
              model.setPeopleProjectOnly(false);
              model.setPeopleQuery("");
              resetSelection();
            }}
          >
            {t("filters.clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
