import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  ensureE2EUser,
  ensureE2EMember,
  e2eMember,
  e2eUser,
  login,
  loginWithCredentials,
  databaseUrl,
} from "./fixtures";
test("admin impersonation displays a persistent banner and restores the original session", async ({
  page,
  browser,
}) => {
  await ensureE2EUser();
  await login(page);
  await page.request.post("/api/workspaces");
  await ensureE2EMember();
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const independent = await browser.newContext();
  const memberPage = await independent.newPage();
  try {
    await loginWithCredentials(memberPage, e2eMember);
    const users = (
      await sql.query('select id,email from "user" where email=any($1)', [
        [e2eUser.email, e2eMember.email],
      ])
    ).rows;
    const member = users.find((u) => u.email === e2eMember.email),
      admin = users.find((u) => u.email === e2eUser.email);
    const forbidden = await memberPage.request.post(
      "/api/auth/admin/impersonate-user",
      { data: { userId: admin.id } },
    );
    expect(forbidden.status()).toBe(403);
    await page.goto("/en/members");
    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(e2eMember.email);
    await page
      .getByRole("button", {
        name: `Actions for ${e2eMember.name}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("menuitem", {
        name: `Impersonate ${e2eMember.name}`,
        exact: true,
      })
      .click();
    await page.waitForURL("**/en/chat");
    const banner = page
      .getByRole("status")
      .filter({ hasText: `${e2eMember.name}` });
    await expect(banner).toContainText("Impersonation active");
    const session = await page.request.get("/api/auth/get-session");
    expect((await session.json()).session.impersonatedBy).toBe(admin.id);
    const denied = await page.request.get("/api/admin/users");
    expect(denied.status()).toBe(403);
    await page.goto("/en/agents");
    await expect(banner).toBeVisible();
    await page.route(
      "**/api/auth/admin/stop-impersonating",
      (r) => r.fulfill({ status: 503, json: { error: "Retry" } }),
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Stop impersonating", exact: true })
      .click();
    await expect(banner.getByRole("alert")).toBeVisible();
    await expect(banner).toBeVisible();
    await page
      .getByRole("button", { name: "Stop impersonating", exact: true })
      .click();
    await page.waitForURL("**/en/members");
    await expect(
      page.getByRole("button", { name: "Stop impersonating", exact: true }),
    ).toHaveCount(0);
    const restored = await page.request.get("/api/auth/get-session");
    expect((await restored.json()).user.id).toBe(admin.id);
    const originalMember = await memberPage.request.get(
      "/api/auth/get-session",
    );
    expect((await originalMember.json()).user.id).toBe(member.id);
    const events = await sql.query(
      "select action from audit_events where actor_principal_id=$1 and resource_id=$2 and action like 'user.impersonation.%'",
      [admin.id, member.id],
    );
    expect(events.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        "user.impersonation.started",
        "user.impersonation.stopped",
      ]),
    );
  } finally {
    await independent.close();
    await sql.end();
  }
});
