import { test } from "./access-memberships.fixtures";
import { expect, type Page } from "@playwright/test";
import {
  ensureE2EUser,
  ensureE2EMember,
  e2eMember,
  login,
  loginWithCredentials,
} from "./fixtures";

async function mutate(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/workspace/iam", { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("keeps membership and project management read-only without delegated permissions", async ({
  page,
  cleanupOrganization,
}) => {
  await ensureE2EUser();
  await login(page);
  const primary = await page.request.post("/api/workspaces");
  expect(primary.ok(), await primary.text()).toBe(true);
  await ensureE2EMember();
  const name = `Read-only access ${Date.now()}`;
  const { project } = await mutate(page, {
    action: "createOrganization",
    organizationName: name,
    projectName: name,
  });
  const workspaceId = project.id;
  cleanupOrganization({
    workspaceId,
    organizationName: name,
    cookies: await page.context().cookies(),
  });
  await mutate(page, {
    action: "createRole",
    workspaceId,
    displayName: "Access reader",
    scopeType: "workspace",
    permissions: ["workspaces.get", "roles.get"],
  });
  let snapshot = await (
    await page.request.get(`/api/workspace/iam?workspaceId=${workspaceId}`)
  ).json();
  const role = snapshot.roles.find(
    (item: { displayName: string }) => item.displayName === "Access reader",
  );
  await mutate(page, {
    action: "addMember",
    workspaceId,
    email: e2eMember.email,
    projectRoleId: role.id,
  });
  await mutate(page, {
    action: "createTeam",
    workspaceId,
    name: "Read-only team",
  });
  snapshot = await (
    await page.request.get(`/api/workspace/iam?workspaceId=${workspaceId}`)
  ).json();
  const member = snapshot.members.find(
    (item: { email: string }) => item.email === e2eMember.email,
  );
  await page.context().clearCookies();
  await loginWithCredentials(page, e2eMember);
  await page.goto("/en/members");
  await page
    .getByRole("combobox", { name: "Active project", exact: true })
    .click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `Manage assignments for ${e2eMember.name}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Access reader", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /^Add|^Remove/ }),
  ).toHaveCount(0);
  const denied = await page.request.post("/api/workspace/iam", {
    data: {
      action: "addTeamMember",
      workspaceId,
      teamId: snapshot.teams[0].id,
      userId: member.userId,
    },
  });
  expect(denied.status()).toBe(403);
});
