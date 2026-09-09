import { expect, test } from "@playwright/test";
import { activate, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("workspace navigation", () => {
  test("loads chat page as default after login", async ({ page }) => {
    // After login, should be on chat or setup
    await expect(page).toHaveURL(/\/en\/(chat|setup)/);
  });

  test("sidebar contains navigation links", async ({ page }) => {
    await page.goto("/en/agents");

    // Main nav items should be present in the sidebar
    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Chat link
    await expect(
      page.getByRole("link", { name: "Chat", exact: true }),
    ).toBeVisible();
  });

  test("keeps the workspace shell mounted during client navigation", async ({
    page,
  }) => {
    await page.goto("/en/agents");
    const sidebar = page.locator('[data-slot="workspace-history-sidebar"]');
    const header = page.locator('[data-slot="app-header"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(header).toBeVisible();
    await sidebar.evaluate((element) =>
      element.setAttribute("data-persistence-check", "sidebar"),
    );
    await header.evaluate((element) =>
      element.setAttribute("data-persistence-check", "header"),
    );

    await page.getByRole("link", { name: "Tools", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/tools/);
    await expect(sidebar).toHaveAttribute("data-persistence-check", "sidebar");
    await expect(header).toHaveAttribute("data-persistence-check", "header");
  });

  test("navigating to /agents loads agents page", async ({ page }) => {
    await page.goto("/en/agents");
    await expect(page).toHaveURL(/\/en\/agents/);

    // Page should load without errors
    await expect(
      page.getByRole("heading", {
        name: /Your intelligences, beautifully organized\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /knowledge loads knowledge page", async ({ page }) => {
    await page.goto("/en/knowledge");
    await expect(page).toHaveURL(/\/en\/knowledge/);

    await expect(
      page.getByRole("heading", {
        name: "Context, without the noise.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /scheduled-tasks loads scheduled tasks page", async ({
    page,
  }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", {
        name: /Automate, without losing control\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /tools loads tools page", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page).toHaveURL(/\/en\/tools/);

    await expect(
      page.getByRole("heading", {
        name: /Capabilities and connections\./i,
      }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("navigating to /marketplace loads marketplace page", async ({
    page,
  }) => {
    await page.goto("/en/marketplace");
    await expect(page).toHaveURL(/\/en\/marketplace/);

    await expect(
      page.getByRole("heading", { name: /Marketplace/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("navigating to /providers loads providers page", async ({ page }) => {
    await page.goto("/en/providers");
    await expect(page).toHaveURL(/\/en\/providers/);

    await expect(
      page.getByRole("heading", { name: /AI connections|Connect AI/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /api-keys loads api keys page", async ({ page }) => {
    await page.goto("/en/api-keys");
    await expect(page).toHaveURL(/\/en\/api-keys/);

    await expect(
      page.getByRole("heading", { name: /API keys/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /settings loads settings page", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings/);

    await expect(
      page.getByRole("heading", { name: /Settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /usage loads usage page", async ({ page }) => {
    await page.goto("/en/usage");
    await expect(page).toHaveURL(/\/en\/usage/);

    await expect(
      page.getByRole("heading", { name: /Usage/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /audit loads audit page", async ({ page }) => {
    await page.goto("/en/audit");
    await expect(page).toHaveURL(/\/en\/audit/);

    await expect(
      page.getByRole("heading", { name: /Activity log/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /members loads members page", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page).toHaveURL(/\/en\/members/);

    await expect(
      page.getByRole("heading", { name: "Access" }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /admin/settings loads admin settings page", async ({
    page,
  }) => {
    await page.goto("/en/admin/settings");
    await expect(page).toHaveURL(/\/en\/admin\/settings/);

    await expect(
      page.getByRole("heading", { name: /App settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /setup loads setup page", async ({ page }) => {
    await page.goto("/en/setup");
    await expect(page).toHaveURL(/\/en\/setup/);

    await expect(
      page.getByRole("heading", { name: /Get started/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /custom-tools redirects to workflows", async ({
    page,
  }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/workflows/);
  });
});

test.describe("sidebar interactions", () => {
  test("sidebar collapse/expand toggle works", async ({ page }) => {
    await page.goto("/en/chat");
    await page.waitForTimeout(1000);

    // Find the collapse/expand button
    const toggleBtn = page.getByRole("button", {
      name: /Collapse chat sidebar/i,
    });

    await expect(toggleBtn).toBeVisible();
    const initialWidth = await page
      .locator('[data-slot="workspace-history-sidebar"]')
      .boundingBox();

    await activate(toggleBtn);
    await page.waitForTimeout(300);

    const collapsedWidth = await page
      .locator('[data-slot="workspace-history-sidebar"]')
      .boundingBox();

    // Sidebar should be narrower when collapsed
    expect(collapsedWidth?.width).toBeLessThan(initialWidth?.width ?? 999);
  });

  test("active nav item is highlighted", async ({ page }) => {
    await page.goto("/en/agents");
    await page.waitForTimeout(1000);

    // The "Assistants" link should have the active state
    const activeLink = page.getByRole("link", { name: /Assistants/i }).first();
    await expect(activeLink).toBeVisible();
    // Active links should have aria-current="page" or similar
    const ariaCurrent = await activeLink.getAttribute("aria-current");
    expect(ariaCurrent).toBe("page");
  });

  test("user name is available from the Orbit account menu", async ({
    page,
  }) => {
    await page.goto("/en/agents");

    await expect(
      page.getByRole("button", { name: "E2E Admin", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("page loading states", () => {
  test("workspace pages do not show blank screens", async ({ page }) => {
    const pages = ["/en/chat", "/en/agents", "/en/knowledge", "/en/settings"];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(3000);

      // Check the page has meaningful content (not just a blank div)
      const bodyText = await page.locator(".page-content").last().innerText();
      expect(bodyText.length).toBeGreaterThan(0);
    }
  });
});

test.describe("not found page", () => {
  test("shows not found for non-existent routes", async ({ page }) => {
    await page.goto("/en/non-existent-route-12345");

    // May redirect to chat or show a 404
    const url = page.url();
    // If it doesn't redirect, there should be a 404 indicator
    if (!url.includes("chat") && !url.includes("signin")) {
      await expect(
        page.getByRole("heading", { name: /Page not found/i }),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
