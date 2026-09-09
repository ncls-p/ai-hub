import { expect, test } from "@playwright/test";
import { e2eUser, ensureE2EUser, login, openDropdown } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.describe("authentication", () => {
  test.describe("sign in page", () => {
    test("loads sign in page with correct structure", async ({ page }) => {
      await page.goto("/en/auth/signin");
      await expect(page).toHaveTitle(/Sign in to Maiah|Maiah|App/i);

      // Logo should be visible
      await expect(page.getByRole("img").first()).toBeVisible();

      // Email and password fields
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();

      // Sign in button
      await expect(
        page.getByRole("button", { name: /Sign In/i }),
      ).toBeVisible();

      // Sign up link
      await expect(
        page.getByRole("link", { name: /Create Account/i }),
      ).toBeVisible();
    });

    test("sign in with valid credentials redirects to workspace", async ({
      page,
    }) => {
      await login(page);
      await expect(page).toHaveURL(/\/en\/(chat|setup)/);
    });

    test("sign in with invalid credentials shows error", async ({ page }) => {
      await page.goto("/en/auth/signin");
      await page.getByLabel("Email").fill("wrong@example.test");
      await page.getByLabel("Password").fill("WrongPassword!");
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    });

    test("sign in with empty fields shows validation error", async ({
      page,
    }) => {
      await page.goto("/en/auth/signin");
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page.getByLabel("Email")).toBeFocused();
      expect(
        await page
          .getByLabel("Email")
          .evaluate(
            (element: HTMLInputElement) => element.validity.valueMissing,
          ),
      ).toBe(true);
      await expect(page).toHaveURL(/signin/);
    });

    test("uses a compact edge-to-edge mobile composition", async ({ page }) => {
      await page.setViewportSize({ width: 412, height: 915 });
      await page.goto("/fr/auth/signin");

      const authPage = page.locator('[data-page="auth"]');
      const form = page.getByRole("main").locator("form");
      await expect(authPage).toBeVisible();
      await expect(form).toBeVisible();
      await expect(page.locator("aside")).toBeHidden();

      const metrics = await page.evaluate(() => {
        const form = document.querySelector("form")!.getBoundingClientRect();
        const card = document.querySelector('[data-slot="card"]')!;
        const cardStyle = getComputedStyle(card);
        return {
          formWidth: form.width,
          scrollWidth: document.documentElement.scrollWidth,
          cardBorderWidth: cardStyle.borderTopWidth,
        };
      });
      expect(metrics.formWidth).toBeGreaterThanOrEqual(370);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(412);
      expect(metrics.cardBorderWidth).toBe("0px");
    });
  });

  test.describe("sign up page", () => {
    test("loads sign up page with correct structure", async ({ page }) => {
      await page.goto("/en/auth/signup");

      // Name, email and password fields
      await expect(page.getByLabel("Full name")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();

      // Create account button or registration closed message
      await expect(
        page.getByRole("button", { name: /Create Account|Go to Sign In/i }),
      ).toBeVisible();

      // Sign in link
      await expect(page.getByRole("link", { name: /Sign In/i })).toBeVisible();
    });

    test("sign up form requires all fields", async ({ page }) => {
      await page.goto("/en/auth/signup");

      // Try to submit empty form — HTML5 required should prevent it
      const createButton = page.getByRole("button", {
        name: /Create Account/i,
      });
      await expect(createButton).toBeVisible();
      await createButton.click();
      await expect(page.getByLabel("Full name")).toBeFocused();
      expect(
        await page
          .getByLabel("Full name")
          .evaluate(
            (element: HTMLInputElement) => element.validity.valueMissing,
          ),
      ).toBe(true);
      await expect(page).toHaveURL(/signup/);
    });
  });

  test.describe("sign out flow", () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test("sign out revokes access to the workspace", async ({ page }) => {
      const accountMenu = page.getByRole("button", {
        name: e2eUser.name,
        exact: true,
      });

      await expect(async () => {
        await openDropdown(accountMenu);
        await expect(
          page.getByRole("menuitem", { name: /Sign out/i }),
        ).toBeVisible();
      }).toPass({ timeout: 10_000 });
      await page.getByRole("menuitem", { name: /Sign out/i }).click();
      await expect(page).toHaveURL(/\/auth\/signin/);
      expect((await page.request.get("/api/workspaces")).status()).toBe(401);
      await page.goto("/en/chat");
      await expect(page).toHaveURL(/\/auth\/signin/);
    });
  });

  test.describe("auth redirects", () => {
    test("unauthenticated users are redirected to sign in", async ({
      page,
    }) => {
      // Clear cookies to ensure unauthenticated state
      await page.context().clearCookies();
      await page.goto("/en/chat");
      // Should redirect to sign in
      await expect(page).toHaveURL(/signin/, { timeout: 15_000 });
    });
  });
});
