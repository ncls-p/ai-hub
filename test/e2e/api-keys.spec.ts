import { expect, test } from "@playwright/test";
import {
  e2eMember,
  ensureE2EMember,
  ensureE2EUser,
  login,
  loginWithCredentials,
} from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("api keys page", () => {
  test("loads api keys page", async ({ page }) => {
    await page.goto("/en/api-keys");
    await expect(page).toHaveURL(/\/en\/api-keys/);

    await expect(
      page.getByRole("heading", { name: /API keys/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty state when no keys", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/No API keys|Create|API key/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create api key flow", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    const testName = `E2E Key ${Date.now()}`;

    const nameInput = page.getByLabel(/Key name/i);
    const createBtn = page.getByRole("button", { name: /Create key/i });

    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/permission\(s\) selected/i)).toBeVisible();
    await nameInput.fill(testName);
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    await expect(page.getByText(testName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("token scopes allow, deny, and stay within one workspace", async ({
    page,
  }) => {
    const workspacesResponse = await page.request.get("/api/workspaces");
    expect(workspacesResponse.ok()).toBeTruthy();
    const workspaces = (await workspacesResponse.json()) as Array<{
      workspace: { id: string };
      isActive: boolean;
    }>;
    const workspaceId = (
      workspaces.find((row) => row.isActive) ?? workspaces[0]
    )?.workspace.id;
    expect(workspaceId).toBeTruthy();

    const createResponse = await page.request.post("/api/workspace/api-keys", {
      data: {
        workspaceId,
        name: `Scoped E2E ${Date.now()}`,
        scopes: ["agents.list"],
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as {
      rawKey: string;
      apiKey: { id: string };
    };
    const bearerHeaders = { Authorization: `Bearer ${created.rawKey}` };

    const allowed = await page.request.get(
      `/api/workspace/agents?workspaceId=${workspaceId}`,
      { headers: bearerHeaders },
    );
    expect(allowed.status()).toBe(200);

    const missingScope = await page.request.get(
      `/api/workspace/providers?workspaceId=${workspaceId}`,
      { headers: bearerHeaders },
    );
    expect(missingScope.status()).toBe(403);
    expect(await missingScope.json()).toMatchObject({
      reason: "API token scope missing: providers.viewMetadata",
    });

    const otherWorkspace = "00000000-0000-4000-8000-000000000001";
    const crossWorkspace = await page.request.get(
      `/api/workspace/agents?workspaceId=${otherWorkspace}`,
      { headers: bearerHeaders },
    );
    expect(crossWorkspace.status()).toBe(403);

    const invalidBearer = await page.request.get(
      `/api/workspace/agents?workspaceId=${workspaceId}`,
      { headers: { Authorization: "Bearer ahub_invalid" } },
    );
    expect(invalidBearer.status()).toBe(401);

    const revokeResponse = await page.request.delete(
      `/api/workspace/api-keys/${created.apiKey.id}?workspaceId=${workspaceId}`,
    );
    expect(revokeResponse.ok()).toBeTruthy();
  });

  test("a member cannot grant admin scopes or escalate from a child token", async ({
    browser,
  }) => {
    await ensureE2EMember();
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginWithCredentials(page, e2eMember);

    const workspacesResponse = await page.request.get("/api/workspaces");
    const workspaces = (await workspacesResponse.json()) as Array<{
      workspace: { id: string };
      isActive: boolean;
    }>;
    const workspaceId = (
      workspaces.find((row) => row.isActive) ?? workspaces[0]
    )?.workspace.id;
    expect(workspaceId).toBeTruthy();

    const scopeResponse = await page.request.get(
      `/api/workspace/api-keys?workspaceId=${workspaceId}`,
    );
    expect(scopeResponse.ok()).toBeTruthy();
    const scopeData = (await scopeResponse.json()) as {
      availableScopes: Array<{ permission: string }>;
    };
    const grantable = scopeData.availableScopes.map(
      ({ permission }) => permission,
    );
    expect(grantable).toContain("agents.list");
    expect(grantable).not.toContain("roles.manage");
    expect(grantable).not.toContain("providers.delete");

    const escalation = await page.request.post("/api/workspace/api-keys", {
      data: {
        workspaceId,
        name: "Forbidden admin scope",
        scopes: ["roles.manage"],
      },
    });
    expect(escalation.status()).toBe(400);

    const createResponse = await page.request.post("/api/workspace/api-keys", {
      data: {
        workspaceId,
        name: `Member scoped E2E ${Date.now()}`,
        scopes: ["agents.list"],
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as {
      rawKey: string;
      apiKey: { id: string };
    };

    const allowed = await page.request.get(
      `/api/workspace/agents?workspaceId=${workspaceId}`,
      { headers: { Authorization: `Bearer ${created.rawKey}` } },
    );
    expect(allowed.status()).toBe(200);

    const childEscalation = await page.request.post("/api/workspace/api-keys", {
      headers: { Authorization: `Bearer ${created.rawKey}` },
      data: {
        workspaceId,
        name: "Child escalation",
        scopes: ["agents.list"],
      },
    });
    expect(childEscalation.status()).toBe(403);

    const revokeResponse = await page.request.delete(
      `/api/workspace/api-keys/${created.apiKey.id}?workspaceId=${workspaceId}`,
    );
    expect(revokeResponse.ok()).toBeTruthy();
    await context.close();
  });

  test("revoke api key flow", async ({ page }) => {
    await page.goto("/en/api-keys");
    await page.waitForTimeout(2000);

    // Look for an existing key to revoke
    const revokeBtn = page
      .getByRole("button", { name: /Revoke E2E Key/i })
      .first();

    await expect(revokeBtn).toBeVisible({ timeout: 15_000 });
    await revokeBtn.click();
    await expect(
      page.getByRole("alertdialog").getByText(/stop working immediately/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /Revoke key/i }).click();
    await expect(revokeBtn).not.toBeVisible({ timeout: 10_000 });
  });
});
