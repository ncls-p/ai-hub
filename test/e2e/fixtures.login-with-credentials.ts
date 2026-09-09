import { retryRateLimitedAuth } from "./fixtures.auth-rate-limit";
// Shared fixtures and helpers for all e2e tests
import { expect, type Page } from "@playwright/test";
import { authenticationState, e2eUser } from "./fixtures.e2e-user";

export async function loginWithCredentials(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/en/auth/signin");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await retryRateLimitedAuth(async () => {
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-in/email") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    return response;
  });
  await page.waitForURL(/\/en\/(chat|setup)/, { timeout: 15_000 });
}

export async function login(page: Page) {
  if (authenticationState.cookies) {
    await page.context().addCookies(authenticationState.cookies);
    await page.goto("/en/chat", { waitUntil: "domcontentloaded" });
    if (/\/en\/(chat|setup)/.test(page.url())) {
      await restorePrimaryWorkspace(page);
      return;
    }
    authenticationState.cookies = null;
  }

  await page.goto("/en/auth/signin");
  await page.getByLabel("Email").fill(e2eUser.email);
  await page.getByLabel("Password").fill(e2eUser.password);
  await retryRateLimitedAuth(async () => {
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-in/email") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    return response;
  });
  await page.waitForURL(/\/en\/(chat|setup)/, { timeout: 15_000 });
  authenticationState.cookies = await page.context().cookies();
  await restorePrimaryWorkspace(page);
}

// Ordinary tests start in the fixture's primary project. Tests of persisted
// workspace selection deliberately use loginWithCredentials instead.
async function restorePrimaryWorkspace(page: Page) {
  const response = await page.request.get("/api/workspaces");
  expect(response.status()).toBe(200);
  const rows = (await response.json()) as Array<{
    workspace: { id: string; slug: string };
    organization: { slug: string };
    isActive: boolean;
  }>;
  const primary = rows.find(
    (row) =>
      row.workspace.slug === "main" && row.organization.slug === "deodis",
  );
  if (!primary) throw new Error("Primary E2E workspace is missing");
  if (primary.isActive) return;
  const selected = await page.request.patch("/api/workspaces", {
    data: { workspaceId: primary.workspace.id },
  });
  expect(selected.status()).toBe(204);
  await page.goto("/en/chat");
}
