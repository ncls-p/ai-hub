import type {
  AccessViewAssignment,
  AccessViewPerson,
  AccessViewTeam,
} from "./access-view-model";

type Person = AccessViewPerson<AccessViewAssignment, AccessViewTeam>;
type ProjectAccess = {
  roles: { id: string; permissions: string[] }[];
  assignments: (AccessViewAssignment & { roleId: string })[];
  organization: { id: string };
};

export function personHasProjectAccess(
  person: Person,
  snapshot: ProjectAccess,
) {
  if (person.platformRole === "admin") return true;
  const readableRoleIds = new Set(
    snapshot.roles
      .filter((role) => role.permissions.includes("workspaces.get"))
      .map((role) => role.id),
  );
  return snapshot.assignments.some(
    (assignment) =>
      readableRoleIds.has(assignment.roleId) &&
      ((assignment.principalType === "user" &&
        assignment.principalId === person.userId) ||
        (assignment.principalType === "team" &&
          (person.teams.some((team) => team.id === assignment.principalId) ||
            assignment.principalId === snapshot.organization.id))),
  );
}
