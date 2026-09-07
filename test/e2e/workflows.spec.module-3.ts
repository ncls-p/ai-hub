import { expect, test } from "@playwright/test";

test("collects sensitive workflow information without exposing it in chat", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])!
    .workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic secure input ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const workflowId = (
    (await createResponse.json()) as { workflow: { id: string } }
  ).workflow.id;
  const requestId = "77777777-7777-4777-8777-777777777777";

  try {
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: [], pendingRequests: [] }),
          });
          return;
        }
        const body = route.request().postDataJSON() as {
          inputRequestId?: string;
        };
        const events = body.inputRequestId
          ? [
              {
                type: "text",
                delta: "The connection was configured securely.",
              },
              { type: "done" },
            ]
          : [
              { type: "agent", name: "Workflow assistant" },
              {
                type: "input_request",
                request: {
                  id: requestId,
                  title: "API connection",
                  description: "Provide the required connection details.",
                  fields: [
                    {
                      name: "api_key",
                      label: "API key",
                      type: "secret",
                      sensitive: true,
                      required: true,
                    },
                    {
                      name: "base_url",
                      label: "Base URL",
                      type: "url",
                      sensitive: false,
                      required: true,
                    },
                  ],
                  expiresAt: "2099-07-23T10:00:00.000Z",
                },
              },
              {
                type: "text",
                delta: "Please provide the connection details.",
              },
              { type: "done" },
            ];
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        });
      },
    );
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic/inputs/${requestId}`,
      async (route) => {
        const body = route.request().postDataJSON() as {
          values: Record<string, string>;
        };
        expect(body.values).toEqual({
          api_key: "sk-e2e-private",
          base_url: "https://api.example.com",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: requestId,
            displayMessage: "The requested information was provided securely.",
          }),
        });
      },
    );

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Connect this workflow to my API");
    await page.getByRole("button", { name: "Send" }).click();

    const apiKey = page.getByLabel("API key");
    await expect(apiKey).toHaveAttribute("type", "password");
    await apiKey.fill("sk-e2e-private");
    await page.getByLabel("Base URL").fill("https://api.example.com");
    const continuation = page.waitForRequest((request) => {
      if (
        request.method() !== "POST" ||
        !request.url().endsWith(`/workflows/${workflowId}/agentic`)
      ) {
        return false;
      }
      return (
        (request.postDataJSON() as { inputRequestId?: string })
          .inputRequestId === requestId
      );
    });
    await page.getByRole("button", { name: "Submit" }).click();
    await continuation;

    await expect(
      page.getByText("The connection was configured securely."),
    ).toBeVisible();
    await expect(page.getByText("sk-e2e-private")).toHaveCount(0);
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
