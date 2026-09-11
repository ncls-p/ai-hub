import { describe, expect, it } from "vitest";
import { personHasProjectAccess } from "@/modules/iam/filter-access-people";

const person = {
  userId: "alice",
  name: "Alice",
  email: "alice@example.test",
  memberStatus: "active" as const,
  assignments: [],
  teams: [{ id: "team-a", name: "A", members: [{ userId: "alice" }] }],
};
const base = {
  organization: { id: "org" },
  roles: [
    { id: "viewer", permissions: ["workspaces.get"] },
    { id: "resource", permissions: ["agents.get"] },
  ],
};

describe("people project access filter", () => {
  it("includes direct, team and organization membership without matching another user's role", () => {
    for (const [principalType, principalId] of [
      ["user", "alice"],
      ["team", "team-a"],
      ["team", "org"],
    ] as const) {
      expect(
        personHasProjectAccess(person, {
          ...base,
          assignments: [
            { id: "binding", principalType, principalId, roleId: "viewer" },
          ],
        }),
      ).toBe(true);
    }
    expect(
      personHasProjectAccess(person, {
        ...base,
        assignments: [
          {
            id: "binding",
            principalType: "user",
            principalId: "bob",
            roleId: "viewer",
          },
        ],
      }),
    ).toBe(false);
  });
  it("does not treat a resource permission as project membership", () => {
    expect(
      personHasProjectAccess(person, {
        ...base,
        assignments: [
          {
            id: "binding",
            principalType: "user",
            principalId: "alice",
            roleId: "resource",
          },
        ],
      }),
    ).toBe(false);
    expect(
      personHasProjectAccess(
        { ...person, platformRole: "admin" },
        { ...base, assignments: [] },
      ),
    ).toBe(true);
  });
});
