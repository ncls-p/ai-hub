import { test } from "./access-memberships.fixtures";
import { expect, type Page } from "@playwright/test";
import { ensureE2EUser, ensureE2EMember, e2eMember, login } from "./fixtures";

async function mutate(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("/api/workspace/iam", { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("manages multiple team and project memberships from people and teams", async ({
  page,
  cleanupOrganization,
}) => {
  test.setTimeout(120_000);
  await ensureE2EUser();
  await login(page);
  const primary = await page.request.post("/api/workspaces");
  expect(primary.ok(), await primary.text()).toBe(true);
  await ensureE2EMember();
  const suffix = Date.now();
  const projectName = `Access project ${suffix}`;
  const { project } = await mutate(page, {
    action: "createOrganization",
    organizationName: `Access org ${suffix}`,
    projectName,
  });
  const workspaceId = project.id;
  cleanupOrganization({
    workspaceId,
    organizationName: `Access org ${suffix}`,
    cookies: await page.context().cookies(),
  });
  await mutate(page, {
    action: "addMember",
    workspaceId,
    email: e2eMember.email,
  });
  for (const name of ["Membership team A", "Membership team B"])
    await mutate(page, { action: "createTeam", workspaceId, name });
  const { project: secondProject } = await mutate(page, {
    action: "createProject",
    workspaceId,
    name: `Second project ${suffix}`,
  });
  await page.goto("/en/members");
  await page
    .getByRole("combobox", { name: "Active project", exact: true })
    .click();
  await page.getByRole("option", { name: projectName, exact: true }).click();
  await page
    .getByRole("button", {
      name: `Manage assignments for ${e2eMember.name}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  for (const name of ["Membership team A", "Membership team B"]) {
    await dialog
      .getByRole("button", { name: `Add to team ${name}`, exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: `Add to team ${name}`, exact: true }),
    ).toHaveCount(0);
  }
  for (const name of [projectName, secondProject.name]) {
    await dialog.getByRole("combobox", { name: "Project to manage" }).click();
    await page.getByRole("option", { name, exact: true }).click();
    await dialog
      .getByRole("combobox", { name: "Role in this project", exact: true })
      .click();
    await page.getByRole("option", { name: /Project viewer/i }).click();
    if (name === projectName) {
      await page.route(
        "**/api/workspace/iam",
        (route) =>
          route.fulfill({
            status: 409,
            json: { error: "Assignment changed; retry" },
          }),
        { times: 1 },
      );
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Assignment changed; retry",
      );
      await expect(
        dialog.getByRole("combobox", { name: "Role in this project" }),
      ).toContainText(/Project viewer/i);
    }
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: /^Remove access for / }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Manage assignments for Membership team A",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("combobox", { name: "Role in this project", exact: true })
    .click();
  await page.getByRole("option", { name: /Project viewer/i }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: /^Remove access for / }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const snapshot = await (
    await page.request.get(`/api/workspace/iam?workspaceId=${workspaceId}`)
  ).json();
  const member = snapshot.members.find(
    (item: { email: string }) => item.email === e2eMember.email,
  );
  expect(
    snapshot.teams.filter((team: { members: { userId: string }[] }) =>
      team.members.some((item) => item.userId === member.userId),
    ),
  ).toHaveLength(2);
  expect(
    snapshot.assignments.some(
      (item: { principalId: string; scope: string }) =>
        item.principalId === member.userId && item.scope === "project",
    ),
  ).toBe(true);
  const second = await (
    await page.request.get(`/api/workspace/iam?workspaceId=${secondProject.id}`)
  ).json();
  expect(
    second.assignments.some(
      (item: { principalId: string; scope: string }) =>
        item.principalId === member.userId && item.scope === "project",
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await page.route(
    "**/api/workspace/iam?**",
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Temporary access failure" },
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", {
      name: `Manage assignments for ${e2eMember.name}`,
      exact: true,
    })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Temporary access failure",
  );
  await expect(
    dialog.getByRole("button", { name: /^Remove / }).first(),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: /Retry|Try again/i }).click();
  await expect(
    dialog.getByRole("button", { name: /^Remove access for / }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /^Remove access for / }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Remove/i })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Remove access for / }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: /^Remove .* from the team$/ })
    .first()
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Remove/i })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^Add to team / }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "output/playwright/access-memberships-mobile.png",
    fullPage: true,
  });
});

test("creates, renames and deletes a project from Access", async ({ page }) => {
  await ensureE2EUser();
  await login(page);
  await page.goto("/en/members");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const name = `Project lifecycle ${Date.now()}`;
  await dialog
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("x");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(name);
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Active project", exact: true }),
  ).toHaveText(name);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Rename project", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(`${name} renamed`);
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Active project", exact: true }),
  ).toHaveText(`${name} renamed`);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete project", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  await dialog.locator("#scope-delete-confirmation").fill(`${name} renamed`);
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Active project", exact: true }),
  ).not.toHaveText(`${name} renamed`);
});
