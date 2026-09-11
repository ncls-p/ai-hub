import { Button } from "@/components/ui/button";
import type { AccessSnapshot } from "./access-console.access-member";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import type {
  MembershipMutation,
  MembershipPrincipal,
} from "./principal-memberships-dialog";
import { ConfirmRemovalButton } from "./access-console.scope-path";

export function PersonTeamMemberships({
  snapshot,
  principal,
  mutate,
  disabled,
  t,
}: {
  snapshot: AccessSnapshot;
  principal: MembershipPrincipal;
  mutate: MembershipMutation;
  disabled: boolean;
  t: AccessConsoleViewModel["t"];
}) {
  const canManage = snapshot.actions.organization["teams.update"];
  return (
    <section className="flex flex-col gap-2" aria-label={t("tabs.teams")}>
      <h3 className="text-sm font-medium">{t("tabs.teams")}</h3>
      {snapshot.teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTeams")}</p>
      ) : (
        snapshot.teams.map((team) => {
          const member = team.members.some(
            (person) => person.userId === principal.id,
          );
          return (
            <div
              key={team.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{team.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(member ? "memberships.member" : "memberships.notMember")}
                </p>
              </div>
              {canManage ? (
                member ? (
                  <ConfirmRemovalButton
                    pending={disabled}
                    label={t("removeTeamMember", { name: principal.name })}
                    title={t("removeTeamMemberTitle", { name: principal.name })}
                    description={t("removeTeamMemberDescription", {
                      team: team.name,
                    })}
                    onConfirm={() =>
                      void mutate({
                        action: "removeTeamMember",
                        teamId: team.id,
                        userId: principal.id,
                      })
                    }
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    aria-label={t("memberships.joinTeam", { team: team.name })}
                    onClick={() =>
                      void mutate({
                        action: "addTeamMember",
                        teamId: team.id,
                        userId: principal.id,
                      })
                    }
                  >
                    {t("add")}
                  </Button>
                )
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
