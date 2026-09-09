import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("providers page", () => {
  test("loads providers page", async ({ page }) => {
    await page.goto("/en/providers");
    await expect(page).toHaveURL(/\/en\/providers/);

    await expect(
      page.getByRole("heading", { name: /AI connections|Connect AI/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty state when no providers", async ({ page }) => {
    await page.route("**/api/workspace/providers?**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/en/providers");
    await expect(
      page.getByText("No connections yet", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Connection actions/i }),
    ).toHaveCount(0);
  });

  test("add connection button exists", async ({ page }) => {
    await page.goto("/en/providers");
    await page.waitForTimeout(2000);

    const addBtn = page.getByRole("button", { name: /Add|Connect/i }).first();

    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeEnabled();
  });

  test("discovers and adds provider models after setup", async ({ page }) => {
    test.setTimeout(60_000);
    const workspacesResponse = await page.request.get("/api/workspaces");
    expect(workspacesResponse.ok()).toBe(true);
    const workspaces = (await workspacesResponse.json()) as Array<{
      workspace: { id: string };
      isActive: boolean;
    }>;
    const workspaceId = (
      workspaces.find((row) => row.isActive) ?? workspaces[0]
    )?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    let providerId: string | undefined;
    try {
      const createResponse = await page.request.post(
        "/api/workspace/providers",
        {
          data: {
            workspaceId,
            kind: "native",
            name: `Discovery E2E ${Date.now()}`,
            authType: "bearer",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      providerId = ((await createResponse.json()) as { id: string }).id;
      const initialModelsResponse = await page.request.get(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
      );
      expect(initialModelsResponse.ok()).toBe(true);
      expect(await initialModelsResponse.json()).toEqual([]);

      await page.route(
        (url) =>
          url.pathname === `/api/workspace/providers/${providerId}/models` &&
          url.searchParams.get("action") === "discover",
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                modelId: "e2e-discovered-text",
                displayName: "Discovered text model",
                capabilities: { text: true },
              },
              {
                modelId: "e2e-discovered-image",
                displayName: "Discovered image model",
                capabilities: { text: true, imageGeneration: true },
              },
            ]),
          });
        },
      );

      await page.goto("/en/providers");
      await page
        .getByText(/Discovery E2E/)
        .first()
        .click();
      await page
        .getByRole("button", { name: "Discover models", exact: true })
        .click();

      await expect(
        page.getByText("Discovered (2)", { exact: true }),
      ).toBeVisible();
      const afterDiscoveryResponse = await page.request.get(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
      );
      expect(afterDiscoveryResponse.ok()).toBe(true);
      expect(await afterDiscoveryResponse.json()).toEqual([]);
      await expect(
        page.getByRole("button", { name: "Add selected (0)", exact: true }),
      ).toBeDisabled();

      await page
        .getByRole("checkbox", {
          name: "Select Discovered text model",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Add selected (1)", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Add selected (1)", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Add selected (0)", exact: true }),
      ).toBeDisabled({ timeout: 15_000 });

      const modelsResponse = await page.request.get(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
      );
      expect(modelsResponse.ok()).toBe(true);
      const models = (await modelsResponse.json()) as Array<{
        modelId: string;
      }>;
      expect(models.map((model) => model.modelId)).toEqual([
        "e2e-discovered-text",
      ]);

      await page
        .getByRole("button", { name: "Remove model", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await expect(
        page.getByText("No model is available yet.", { exact: false }),
      ).toBeVisible();
      const afterRemovalResponse = await page.request.get(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
      );
      expect(afterRemovalResponse.ok()).toBe(true);
      expect(await afterRemovalResponse.json()).toEqual([]);
    } finally {
      if (providerId) {
        await page.request.delete(
          `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
        );
      }
    }
  });

  test("defaults OpenAI-compatible connections to the Responses API", async ({
    page,
  }) => {
    await page.goto("/en/providers");

    await page.getByRole("button", { name: "Connect AI", exact: true }).click();
    await page.getByRole("button", { name: /^Advanced/ }).click();

    const apiRoute = page.getByLabel("Generation API");
    await expect(apiRoute).toContainText(
      "Responses API (/responses) — default",
    );

    await apiRoute.click();
    await page
      .getByRole("option", {
        name: "Chat Completions (/chat/completions)",
      })
      .click();
    await expect(apiRoute).toContainText(
      "Chat Completions (/chat/completions)",
    );
  });

  test("persists and updates the selected OpenAI-compatible API", async ({
    page,
  }) => {
    const workspacesResponse = await page.request.get("/api/workspaces");
    expect(workspacesResponse.ok()).toBe(true);
    const workspaces = (await workspacesResponse.json()) as Array<{
      workspace: { id: string };
      isActive: boolean;
    }>;
    const workspaceId = (
      workspaces.find((row) => row.isActive) ?? workspaces[0]
    )?.workspace.id;
    if (!workspaceId) throw new Error("E2E workspace is missing");

    let providerId: string | undefined;
    try {
      const createResponse = await page.request.post(
        "/api/workspace/providers",
        {
          data: {
            workspaceId,
            kind: "openai-compatible",
            name: `OpenAI route E2E ${Date.now()}`,
            baseUrl: "http://127.0.0.1:1/v1",
            authType: "bearer",
            openaiCompatibleApiRoute: "chat-completions",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      const provider = (await createResponse.json()) as {
        id: string;
        openaiCompatibleApiRoute: string;
      };
      providerId = provider.id;
      expect(provider.openaiCompatibleApiRoute).toBe("chat-completions");

      const updateResponse = await page.request.patch(
        `/api/workspace/providers/${providerId}`,
        {
          data: {
            workspaceId,
            openaiCompatibleApiRoute: "responses",
          },
        },
      );
      expect(updateResponse.ok()).toBe(true);
      await expect(updateResponse.json()).resolves.toMatchObject({
        openaiCompatibleApiRoute: "responses",
      });

      const refreshResponse = await page.request.post(
        `/api/workspace/providers/${providerId}/models/refresh`,
        {
          data: { workspaceId },
        },
      );
      expect(refreshResponse.ok()).toBe(true);
      await expect(refreshResponse.json()).resolves.toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy|manual/),
        imported: expect.any(Number),
      });
    } finally {
      if (providerId) {
        await page.request.delete(
          `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
        );
      }
    }
  });
});
