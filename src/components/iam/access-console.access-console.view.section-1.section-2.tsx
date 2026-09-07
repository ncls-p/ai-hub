import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { INITIAL_TEAM_FORM } from "./access-console.resource-transfer-preview";
import { MutatingButton } from "./access-console.scope-path";
import { TeamCard } from "./access-console.team-card";
export function AccessMainSection2({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {
    activeMembers,
    canManageTeams,
    filteredTeams,
    mutate,
    pendingAction,
    setTeamForm,
    setTeamOpen,
    setTeamQuery,
    setVisibleTeamCount,
    t,
    teamForm,
    teamOpen,
    teamQuery,
    visibleTeamCount,
    workspaceId,
  } = model;
  return (
    <TabsContent value="teams">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="grid-cols-1! sm:grid-cols-[1fr_auto]!">
            <CardTitle>{t("teamsTitle")}</CardTitle>
            <CardDescription>{t("teamsDescription")}</CardDescription>
            {model.snapshot.actions.organization["teams.create"] ? (
              <CardAction className="col-start-1 row-start-auto sm:col-start-2 sm:row-start-1">
                <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" size="sm">
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                      {t("createTeam")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("createTeamTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("createTeamDescription")}
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="contents"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const saved = await mutate(
                          "createTeam",
                          {
                            action: "createTeam",
                            workspaceId,
                            ...teamForm,
                          },
                          t("teamCreated"),
                          { close: () => setTeamOpen(false) },
                        );
                        if (saved) {
                          setTeamQuery(teamForm.name);
                          setVisibleTeamCount(20);
                          setTeamForm(INITIAL_TEAM_FORM);
                        }
                      }}
                    >
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="team-name">
                            {t("teamName")}
                          </FieldLabel>
                          <Input
                            id="team-name"
                            required
                            minLength={2}
                            value={teamForm.name}
                            onChange={(event) =>
                              setTeamForm({
                                ...teamForm,
                                name: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="team-description">
                            {t("descriptionLabel")}
                          </FieldLabel>
                          <Textarea
                            id="team-description"
                            value={teamForm.description}
                            onChange={(event) =>
                              setTeamForm({
                                ...teamForm,
                                description: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </FieldGroup>
                      <DialogFooter>
                        <MutatingButton
                          pending={pendingAction === "createTeam"}
                        >
                          {t("createTeam")}
                        </MutatingButton>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="relative max-w-md">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="team-search"
                className="pl-9"
                value={teamQuery}
                placeholder={t("searchTeams")}
                aria-label={t("searchTeams")}
                onChange={(event) => {
                  setTeamQuery(event.target.value);
                  setVisibleTeamCount(20);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {filteredTeams.length === 0 ? (
          <Empty className="min-h-64 border border-border/70 lg:col-span-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {teamQuery ? t("noSearchResults") : t("noTeams")}
              </EmptyTitle>
              <EmptyDescription>
                {teamQuery
                  ? t("noSearchResultsDescription")
                  : t("noTeamsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          filteredTeams.slice(0, visibleTeamCount).map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              members={activeMembers}
              canManage={canManageTeams}
              canDelete={model.snapshot.actions.organization["teams.delete"]}
              pending={pendingAction}
              onEdit={(value) =>
                mutate(
                  `edit-team-${team.id}`,
                  {
                    action: "updateTeam",
                    workspaceId,
                    teamId: team.id,
                    expectedUpdatedAt: team.updatedAt,
                    ...value,
                  },
                  t("simpleAccess.teamUpdated"),
                )
              }
              onAdd={(userId) =>
                mutate(
                  `team-${team.id}`,
                  {
                    action: "addTeamMember",
                    workspaceId,
                    teamId: team.id,
                    userId,
                  },
                  t("teamMemberAdded"),
                )
              }
              onRemove={(userId) =>
                mutate(
                  `team-member-${team.id}-${userId}`,
                  {
                    action: "removeTeamMember",
                    workspaceId,
                    teamId: team.id,
                    userId,
                  },
                  t("teamMemberRemoved"),
                )
              }
              onDelete={() =>
                mutate(
                  `delete-team-${team.id}`,
                  {
                    action: "deleteTeam",
                    workspaceId,
                    teamId: team.id,
                  },
                  t("teamDeleted"),
                )
              }
            />
          ))
        )}
        {filteredTeams.length > visibleTeamCount ? (
          <div className="flex justify-center lg:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleTeamCount((count) => count + 20)}
            >
              {t("showMore", {
                count: Math.min(20, filteredTeams.length - visibleTeamCount),
              })}
            </Button>
          </div>
        ) : null}
      </div>
    </TabsContent>
  );
}
