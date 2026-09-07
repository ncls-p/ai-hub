import { expect, test } from "@playwright/test";
import { e2eUser, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("settings page", () => {
  test("loads settings page", async ({ page }) => {
    const workspaces = (await (
      await page.request.get("/api/workspaces")
    ).json()) as Array<{ workspace: { name: string } }>;
    const projectName = workspaces[0]?.workspace.name;
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings/);

    await expect(
      page.getByRole("heading", { name: /Settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
    if (projectName) {
      await expect(
        page.locator("header.app-shell__header").getByText(projectName, {
          exact: true,
        }),
      ).toBeVisible();
    }
  });

  test("shows language preference in the account menu", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: /Language.*English/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin settings link exists for admins", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "App settings", exact: true }),
    ).toBeVisible();
  });

  test("persists organization logo and preset theme", async ({ page }) => {
    const workspaces = (await (
      await page.request.get("/api/workspaces")
    ).json()) as Array<{ workspace: { id: string } }>;
    const workspaceId = workspaces[0]?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    const resetBranding = () =>
      page.request.put("/api/workspace/branding", {
        data: {
          workspaceId,
          logoUrl: null,
          theme: "ocean",
          themeConfig: null,
        },
      });
    await resetBranding();
    try {
      await page.goto("/en/admin/settings");
      const branding = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Organization branding" }),
      });
      await expect(branding).toBeVisible();

      await branding.getByRole("button", { name: "Forest" }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "ocean",
      );
      await expect(
        branding.locator('[data-theme-preview="light"]'),
      ).toHaveAttribute("data-preview-primary", "#28765a");
      await branding.getByRole("button", { name: "Save branding" }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "forest",
      );
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "forest",
      );
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--primary")
            .trim(),
        ),
      ).toBe("#28765a");
      await expect(
        branding.getByRole("button", { name: "Forest" }),
      ).toHaveAttribute("aria-pressed", "true");

      await branding
        .locator('input[type="file"]')
        .setInputFiles("public/deodis-logo.png");
      await branding.getByRole("button", { name: "Save branding" }).click();
      await page.reload();
      await expect(branding.locator('img[src^="data:image/"]')).toBeVisible();
    } finally {
      await resetBranding();
    }
  });

  test("persists a custom light and dark organization palette", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const workspaces = (await (
      await page.request.get("/api/workspaces")
    ).json()) as Array<{ workspace: { id: string } }>;
    const workspaceId = workspaces[0]?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    try {
      await page.goto("/en/admin/settings");
      const branding = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Organization branding" }),
      });
      await branding.getByRole("button", { name: "Custom" }).click();
      await branding
        .getByLabel("light primary", { exact: true })
        .fill("#123456");
      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "ocean",
      );
      await expect(
        branding.locator('[data-theme-preview="light"]'),
      ).toHaveAttribute("data-preview-primary", "#123456");
      await branding.locator("summary").filter({ hasText: "Dark" }).click();
      await branding
        .getByLabel("dark primary", { exact: true })
        .fill("#abcdef");
      await branding.getByRole("button", { name: "Save branding" }).click();

      await expect(page.locator("html")).toHaveAttribute(
        "data-brand-theme",
        "custom",
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--primary")
              .trim(),
          ),
        )
        .toBe("#123456");
      await page
        .locator("html")
        .evaluate((element) => element.classList.add("dark"));
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--primary")
              .trim(),
          ),
        )
        .toBe("#abcdef");
      await page.reload();
      await expect(
        branding.getByRole("button", { name: "Custom" }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      await page.request.put("/api/workspace/branding", {
        data: {
          workspaceId,
          logoUrl: null,
          theme: "ocean",
          themeConfig: null,
        },
      });
    }
  });

  test("can change language from the account menu", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
    await page.getByRole("menuitem", { name: /Language.*English/i }).click();
    await expect(page).toHaveURL(/\/fr\/settings/, { timeout: 10_000 });
  });
});

test.describe("settings navigation", () => {
  test("navigate from settings to other pages", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings/);

    // Navigate via sidebar
    await page.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/chat/);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/settings/);
  });
});
