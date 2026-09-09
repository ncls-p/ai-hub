import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("usage page", () => {
  test("loads usage page", async ({ page }) => {
    await page.goto("/en/usage");
    await expect(page).toHaveURL(/\/en\/usage/);

    await expect(
      page.getByRole("heading", { name: /Usage/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows usage dashboard", async ({ page }) => {
    await page.goto("/en/usage");
    await page.waitForTimeout(2000);

    // Usage stats or empty state should be visible
    await expect(
      page.getByText(/Usage|Tokens|Monthly quota|No usage/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("usage filter controls exist", async ({ page }) => {
    await page.goto("/en/usage");
    await page.waitForTimeout(2000);

    // Filter controls (operation, from, to) may be present
    const filterSection = page.getByText(/Filters/i).first();
    await expect(filterSection).toBeVisible();
  });
});

test.describe("audit page", () => {
  test("loads audit page", async ({ page }) => {
    await page.goto("/en/audit");
    await expect(page).toHaveURL(/\/en\/audit/);

    await expect(
      page.getByRole("heading", { name: /Activity log/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows audit dashboard", async ({ page }) => {
    await page.goto("/en/audit");
    await page.waitForTimeout(2000);

    // Audit stats or empty state
    await expect(
      page.getByText(/Activity|Events|No events/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("audit filter controls exist", async ({ page }) => {
    await page.goto("/en/audit");
    await page.waitForTimeout(2000);

    const filterSection = page.getByText(/Filters/i).first();
    await expect(filterSection).toBeVisible();
  });
});
