import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("setup wizard", () => {
  test("shows welcome copy on the setup page", async ({ page }) => {
    await page.goto("/en/setup");
    await expect(
      page.getByRole("heading", { name: /Get started/i }),
    ).toBeVisible();
    await expect(
      page.getByText("Connect AI", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Pick a model", { exact: true }).first(),
    ).toBeVisible();
  });

  test("setup wizard has 3 steps", async ({ page }) => {
    await page.goto("/en/setup");
    await page.waitForTimeout(2000);

    // Step indicators should be visible
    await expect(
      page.getByText(/Connect AI|Pick a model|Start chatting/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("setup page exposes its current navigation action", async ({ page }) => {
    await page.goto("/en/setup");
    await page.waitForTimeout(2000);

    // Continue or navigation buttons should be present
    const navBtn = page
      .getByRole("button", { name: /Continue|Back|Skip|Start/i })
      .first();

    await expect(navBtn).toBeVisible();
  });

  test("setup page shows provider configuration step", async ({ page }) => {
    await page.goto("/en/setup");
    await page.waitForTimeout(2000);

    // Provider configuration should be visible
    await expect(
      page.getByText(/Provider|Connection|API key|Service URL/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("setup wizard provider step", () => {
  test("provider form has required fields", async ({ page }) => {
    // Hold the provider step deterministic regardless of earlier suite mutations.
    await page.route("**/api/workspace/providers?workspaceId=*", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/en/setup");
    await page.waitForTimeout(2000);

    // Connection name field
    const nameInput = page.getByLabel(/Connection|Name/i).first();
    await expect(nameInput).toBeVisible();

    // Service URL field
    const urlInput = page.getByLabel(/Service|URL/i).first();
    await expect(urlInput).toBeVisible();

    // API key field
    const apiKeyInput = page.getByLabel(/API key/i).first();
    await expect(apiKeyInput).toBeVisible();
  });

  test("offers discovered models during the first setup", async ({ page }) => {
    await page.route("**/api/workspace/providers?workspaceId=*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "setup-provider",
            name: "First connection",
            kind: "openai-compatible",
          },
        ]),
      }),
    );
    await page.route(
      "**/api/workspace/providers/setup-provider/models**",
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "POST") {
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              id: "registered-model",
              modelId: "first-model",
              displayName: "First model",
            }),
          });
          return;
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            url.searchParams.get("action") === "discover"
              ? [{ modelId: "first-model", displayName: "First model" }]
              : [],
          ),
        });
      },
    );

    await page.goto("/en/setup");
    await page
      .getByRole("combobox", { name: "Model for this assistant" })
      .click();
    await expect(
      page.getByRole("option", { name: "First model" }),
    ).toBeVisible();
    await page.getByRole("option", { name: "First model" }).click();

    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("access page", () => {
  test("manages accounts and organization access in one interface", async ({
    page,
  }) => {
    await page.goto("/en/members");
    for (const name of ["People", "Teams", "Roles", "Resources"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("tab", { name: "Platform accounts" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Organization access" }),
    ).toHaveCount(0);
  });
});
