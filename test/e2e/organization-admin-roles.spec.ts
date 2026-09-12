import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import {
  ensureE2EAssistant,
  databaseUrl,
  loginWithCredentials,
} from "./fixtures";
import { ensureE2EPermissionUser } from "./fixtures.ensure-e2-emember";

test("organization administrators appoint other organization administrators from People, without platform or ownership escalation", async ({
  browser,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  const people = ["First admin", "Second admin", "Third admin"].map((name) => ({
    name,
    email: `${randomUUID()}@org-admin.test`,
    password: "Org-admin-test-2026!",
  }));
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const contexts = [];
  try {
    for (const [index, user] of people.entries())
      await ensureE2EPermissionUser({
        user,
        roleName: index === 0 ? "organization.admin" : "organization.user",
        roleScope: "organization",
      });
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await loginWithCredentials(page, people[0]);
    await page.request.patch("/api/workspaces", { data: { workspaceId } });
    await page.goto("/en/members");
    await expect(
      page.getByRole("columnheader", {
        name: "Organization role",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(people[1].email);
    await page
      .getByRole("button", {
        name: `Make ${people[1].name} an organization administrator`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "appoint other organization administrators",
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Make ${people[1].name} an organization administrator`,
        exact: true,
      })
      .click();
    await page.route(
      "**/api/workspace/iam",
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Retry organization role grant" },
        }),
      { times: 1 },
    );
    const failed = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workspace/iam") &&
        response.status() === 503,
    );
    await page
      .getByRole("button", { name: "Make administrator", exact: true })
      .click();
    await failed;
    await expect(dialog).toBeVisible();
    await page
      .getByRole("button", { name: "Make administrator", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await page.screenshot({
      path: "/tmp/maiah-organization-admin-desktop.png",
      fullPage: true,
    });
    await expect(
      page.getByRole("button", {
        name: `Make ${people[1].name} an organization administrator`,
        exact: true,
      }),
    ).toHaveCount(0);
    const second = await browser.newContext();
    contexts.push(second);
    const nextPage = await second.newPage();
    await loginWithCredentials(nextPage, people[1]);
    await nextPage.request.patch("/api/workspaces", { data: { workspaceId } });
    await nextPage.goto("/en/members");
    await nextPage
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(people[2].email);
    await nextPage.setViewportSize({ width: 390, height: 844 });
    const appoint = nextPage.getByRole("button", {
      name: `Make ${people[2].name} an organization administrator`,
      exact: true,
    });
    await appoint.focus();
    await nextPage.keyboard.press("Enter");
    await nextPage
      .getByRole("button", { name: "Make administrator", exact: true })
      .click();
    await expect(nextPage.getByRole("dialog")).toBeHidden();
    await nextPage.screenshot({
      path: "/tmp/maiah-organization-admin-mobile.png",
      fullPage: true,
    });
    expect(
      await nextPage
        .locator("body")
        .evaluate((element) => element.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await nextPage.request.get("/api/admin/users")).status()).toBe(403);
    const session = await (
      await nextPage.request.get("/api/auth/get-session")
    ).json();
    expect(session.user.role).toBe("user");
    const granted = await sql.query(
      "select rb.id from role_bindings rb join roles r on r.id=rb.role_id join \"user\" u on u.id=rb.principal_id where u.email=$1 and rb.resource_type='organization' and r.name='organization.admin'",
      [people[2].email],
    );
    expect(granted.rowCount).toBe(1);
    const snapshot = await (
      await nextPage.request.get(
        `/api/workspace/iam?workspaceId=${workspaceId}`,
      )
    ).json();
    const ownerRole = snapshot.roles.find(
      (role: { name: string }) => role.name === "organization.owner",
    );
    const third = (
      await sql.query('select id from "user" where email=$1', [people[2].email])
    ).rows[0];
    const denied = await nextPage.request.post("/api/workspace/iam", {
      data: {
        action: "assignRole",
        workspaceId,
        principalType: "user",
        principalId: third.id,
        scopeType: "organization",
        roleId: ownerRole.id,
      },
    });
    expect(denied.status()).toBe(403);
  } finally {
    for (const context of contexts) await context.close();
    const ids = (
      await sql.query('select id from "user" where email=any($1)', [
        people.map((person) => person.email),
      ])
    ).rows.map((row) => row.id);
    await sql.query("delete from role_bindings where principal_id=any($1)", [
      ids,
    ]);
    await sql.query('delete from "user" where id=any($1)', [ids]);
    await sql.end();
  }
});
