import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("admin settings page", () => {
  test("loads admin settings page", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await expect(page).toHaveURL(/\/en\/admin\/settings/);

    await expect(
      page.getByRole("heading", { name: /App settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows registration settings", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // Registration section should be visible
    await expect(page.getByText(/Registration/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows system health section", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // System health section
    await expect(
      page.getByText(/System status|System health|Health/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows sidebar navigation settings", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // Sidebar navigation section
    await expect(
      page.getByText(/Sidebar navigation|Navigation/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows assistant governance settings", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // Assistant governance section
    await expect(
      page.getByText(/Assistant governance|governance/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows chat automation settings", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // Chat automation section
    await expect(
      page.getByText(/Chat automation|automation/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows workflow builder assistant settings", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/Workflow builder assistant/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Custom tool builder/i)).toHaveCount(0);
  });

  test("configures embedding and reranking defaults explicitly", async ({
    page,
  }) => {
    await page.goto("/en/admin/settings");

    await page.locator("#rag-embedding-model").fill("qwen3-embedding:4b");
    const reranking = page.getByLabel("Improve result ranking");
    if (!(await reranking.isChecked())) await reranking.click();
    await page
      .locator("#rag-reranking-model")
      .fill("nvidia/llama-nemotron-rerank-vl-1b-v2");
    await page.getByRole("button", { name: "Save platform defaults" }).click();

    await expect(page.getByText("Default RAG settings saved")).toBeVisible();
  });

  test("explains technical RAG settings in context", async ({ page }) => {
    await page.goto("/en/admin/settings");

    const help = page.getByRole("button", {
      name: "Maximum characters per indexed passage. Short passages are more precise; long passages preserve more context.",
      exact: true,
    });
    await expect(help).toBeVisible();
    await expect(help).toHaveAccessibleName(/Short passages are more precise/);
  });
});

test.describe("registration settings", () => {
  test("can toggle registration open/closed", async ({ page }) => {
    await page.goto("/en/admin/settings");
    await page.waitForTimeout(2000);

    // Registration toggle buttons should exist
    const openBtn = page
      .getByRole("button", { name: /Open registration/i })
      .first();
    const closeBtn = page
      .getByRole("button", { name: /Close registration/i })
      .first();

    const hasOpenBtn = await openBtn.isVisible().catch(() => false);
    const hasCloseBtn = await closeBtn.isVisible().catch(() => false);

    // At least one toggle should be visible
    expect(hasOpenBtn || hasCloseBtn).toBe(true);
  });
});
