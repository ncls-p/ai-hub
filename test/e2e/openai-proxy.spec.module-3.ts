import { expect, test } from "@playwright/test";
import OpenAI from "openai";

test("proxy enforces authentication, invocation scope and model visibility", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])
    ?.workspace.id;
  if (!workspaceId) throw new Error("E2E workspace is missing");

  const readOnlyResponse = await page.request.post("/api/workspace/api-keys", {
    data: {
      workspaceId,
      name: `OpenAI proxy read-only ${Date.now()}`,
      scopes: ["models.view"],
    },
  });
  expect(readOnlyResponse.status()).toBe(201);
  const token = (await readOnlyResponse.json()) as {
    rawKey: string;
    apiKey: { id: string };
  };

  try {
    const appBaseUrl =
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const readOnlyClient = new OpenAI({
      apiKey: token.rawKey,
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });
    await expect(readOnlyClient.models.list()).resolves.toBeDefined();
    await expect(
      readOnlyClient.chat.completions.create({
        model: "not-visible",
        messages: [{ role: "user", content: "Denied before model lookup" }],
      }),
    ).rejects.toMatchObject({ status: 403, code: "insufficient_permissions" });

    const invalidClient = new OpenAI({
      apiKey: "ahub_invalid",
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });
    await expect(invalidClient.models.list()).rejects.toMatchObject({
      status: 401,
      code: "invalid_api_key",
    });
  } finally {
    await page.request.delete(
      `/api/workspace/api-keys/${token.apiKey.id}?workspaceId=${workspaceId}`,
    );
  }
});
