import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  ensureE2EUser,
  ensureE2EMember,
  e2eMember,
  login,
  loginWithCredentials,
  databaseUrl,
} from "./fixtures";

test("isolates branding, title generation and navigation per organization and switches context from the history footer", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await ensureE2EUser();
  await login(page);
  await page.request.post("/api/workspaces");
  await ensureE2EMember();
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const orgIds: string[] = [];
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  try {
    for (const name of ["Amber", "Violet"]) {
      const response = await page.request.post("/api/organizations", {
        data: { action: "createOrganization", name: `${name} ${Date.now()}` },
      });
      expect(response.ok(), await response.text()).toBe(true);
      orgIds.push((await response.json()).organization.id);
    }
    const [amber, violet] = orgIds;
    const projects = [];
    for (const [org, name] of [
      [amber, "Amber project"],
      [amber, "Amber sibling"],
      [violet, "Violet project"],
    ]) {
      const response = await page.request.post("/api/organizations", {
        data: { action: "createProject", organizationId: org, name },
      });
      expect(response.ok()).toBe(true);
      projects.push((await response.json()).project);
    }
    const missing = await page.request.get("/api/admin/chat-automation");
    expect(missing.status()).toBe(400);
    const customized = await page.request.patch(
      `/api/admin/chat-automation?organizationId=${amber}`,
      {
        data: {
          enabled: false,
          generateTitles: false,
          generateSuggestions: false,
        },
      },
    );
    expect(customized.ok(), await customized.text()).toBe(true);
    expect(
      (
        await (
          await page.request.get(
            `/api/admin/chat-automation?organizationId=${violet}`,
          )
        ).json()
      ).config,
    ).toMatchObject({
      enabled: false,
      generateTitles: true,
      generateSuggestions: true,
    });
    const nav = await page.request.patch(
      `/api/admin/sidebar-navigation?organizationId=${amber}`,
      {
        data: {
          items: [
            { id: "/chat", visible: true },
            { id: "/agents", visible: false },
          ],
        },
      },
    );
    expect(nav.ok(), await nav.text()).toBe(true);
    const sibling = await page.request.get(
      `/api/workspace/navigation?workspaceId=${projects[1].id}`,
    );
    expect(
      (await sibling.json()).config.items.find(
        (i: { id: string }) => i.id === "/agents",
      ).visible,
    ).toBe(false);
    expect(
      (
        await (
          await page.request.get(
            `/api/workspace/navigation?workspaceId=${projects[2].id}`,
          )
        ).json()
      ).config,
    ).toBeNull();
    const branding = await page.request.put("/api/workspace/branding", {
      data: { organizationId: amber, theme: "forest", logoUrl: null },
    });
    expect(branding.ok(), await branding.text()).toBe(true);
    expect(
      (
        await (
          await page.request.get(
            `/api/workspace/branding?workspaceId=${projects[1].id}`,
          )
        ).json()
      ).theme,
    ).toBe("forest");
    expect(
      (
        await (
          await page.request.get(
            `/api/workspace/branding?organizationId=${violet}`,
          )
        ).json()
      ).theme,
    ).toBe("ocean");
    await loginWithCredentials(memberPage, e2eMember);
    for (const endpoint of ["chat-automation", "sidebar-navigation"]) {
      const denied = await memberPage.request.patch(
        `/api/admin/${endpoint}?organizationId=${amber}`,
        { data: { enabled: false, items: [{ id: "/chat", visible: true }] } },
      );
      expect(denied.status()).toBe(403);
    }
    await page.goto("/en/admin/settings");
    const section = page.getByRole("region", {
      name: "Organization customization",
      exact: true,
    });
    await section
      .getByRole("combobox", { name: "Organization to customize", exact: true })
      .click();
    const violetName = (
      await sql.query("select name from organizations where id=$1", [violet])
    ).rows[0].name;
    await page.getByRole("option", { name: violetName, exact: true }).click();
    await expect(
      section.getByText("Organization branding", { exact: true }),
    ).toBeVisible();
    await page.goto("/en/chat");
    const trigger = page.getByRole("button", {
      name: "Switch organization or project",
      exact: true,
    });
    await trigger.click();
    const search = page.getByRole("combobox", {
      name: "Search organizations or projects…",
      exact: true,
    });
    await search.fill("Amber sibling");
    const previousContext = await trigger.innerText();
    await page.route(
      "**/api/workspaces",
      (route) =>
        route.request().method() === "PATCH"
          ? route.fulfill({ status: 503, json: { error: "Retry" } })
          : route.continue(),
      { times: 1 },
    );
    await page.getByRole("option", { name: /Amber sibling/ }).click();
    await expect(
      page.getByText("Could not switch projects. Try again.", { exact: true }),
    ).toBeVisible();
    await expect(trigger).toHaveText(previousContext, { useInnerText: true });
    await page.getByRole("option", { name: /Amber sibling/ }).click();
    await expect(trigger).toContainText("Amber sibling");
    await page.reload();
    await expect(trigger).toContainText("Amber sibling");
    await page.setViewportSize({ width: 390, height: 844 });
    const openSidebar = page.getByRole("button", {
      name: "Open conversations",
      exact: true,
    });
    await openSidebar.click();
    await trigger.click();
    await search.fill("Violet project");
    await page.screenshot({ path: "/tmp/maiah-workspace-selector-mobile.png" });
    await page.getByRole("option", { name: /Violet project/ }).click();
    await expect(trigger).toContainText("Violet project");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await memberContext.close();
    await sql.query("delete from app_settings where key like any($1)", [
      orgIds.map((id) => `%:organization:${id}`),
    ]);
    await sql.query("delete from organizations where id=any($1)", [orgIds]);
    await sql.end();
  }
});
