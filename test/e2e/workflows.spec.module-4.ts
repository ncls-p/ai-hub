import { expect, test } from "@playwright/test";

test("shows the live checklist, approves an agentic run, and opens debug details", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])!
    .workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic approval ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const workflowId = (
    (await createResponse.json()) as { workflow: { id: string } }
  ).workflow.id;
  const requestId = "88888888-8888-4888-8888-888888888888";
  const runId = "99999999-9999-4999-8999-999999999999";
  const todoList = {
    kind: "chat_todo_list",
    title: "News workflow",
    items: [
      { id: "build", label: "Build the workflow", status: "completed" },
      { id: "test", label: "Test the workflow", status: "completed" },
    ],
    completedCount: 2,
    totalCount: 2,
  };

  try {
    await page.route(
      `**/api/workspace/workflows/${workflowId}/agentic`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [],
              pendingRequests: [],
              runRequests: [],
              todoList: null,
            }),
          });
          return;
        }
        const events = [
          { type: "agent", name: "Workflow assistant" },
          { type: "todo_list", todoList },
          {
            type: "run_request",
            request: {
              id: requestId,
              title: "Test the news workflow",
              reason: "Verify the HTTP response before publishing.",
              inputPreview: { topic: "technology", apiKey: "[REDACTED]" },
              expectedVersion: 2,
              status: "pending",
              expiresAt: "2099-07-23T10:00:00.000Z",
            },
          },
          {
            type: "text",
            delta: "The workflow is tested and waiting for your approval.",
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
      `**/api/workspace/workflows/${workflowId}/agentic/runs/${requestId}`,
      async (route) => {
        expect(route.request().postDataJSON()).toEqual({
          workspaceId,
          decision: "approve",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            requestId,
            status: "approved",
            runId,
          }),
        });
      },
    );
    await page.route(
      `**/api/workspace/workflows/${workflowId}/runs?*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            runs: [
              {
                id: runId,
                status: "failed",
                queuedAt: "2026-07-23T15:34:43.000Z",
                completedAt: "2026-07-23T15:34:44.000Z",
                outputJson: null,
                error: "Fetch news (fetch_news): HTTP 401: invalid API key",
              },
            ],
          }),
        });
      },
    );
    await page.route(
      `**/api/workspace/workflow-runs/${runId}?*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            run: {
              id: runId,
              status: "failed",
              queuedAt: "2026-07-23T15:34:43.000Z",
              startedAt: "2026-07-23T15:34:43.100Z",
              completedAt: "2026-07-23T15:34:44.000Z",
              inputJson: { topic: "technology" },
              outputJson: null,
              error: "Fetch news (fetch_news): HTTP 401: invalid API key",
              steps: [
                {
                  id: "step-1",
                  runId,
                  nodeId: "fetch_news",
                  nodeType: "http.request",
                  status: "failed",
                  attempt: 1,
                  inputJson: { topic: "technology" },
                  outputJson: null,
                  error: "HTTP 401: invalid API key",
                  startedAt: "2026-07-23T15:34:43.100Z",
                  completedAt: "2026-07-23T15:34:44.000Z",
                },
              ],
            },
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
      .fill("Test this news workflow");
    await page.getByRole("button", { name: "Send" }).click();

    const todoDock = page.getByRole("region", {
      name: "News workflow",
      exact: true,
    });
    await expect(todoDock).toBeVisible();
    await expect(
      todoDock.getByRole("progressbar", { name: "News workflow progress" }),
    ).toHaveAttribute("aria-valuenow", "2");
    const agentComposer = page.getByRole("textbox", {
      name: /When a request arrives, have an assistant analyze it/i,
    });
    const [dockBox, composerBox] = await Promise.all([
      todoDock.boundingBox(),
      agentComposer.boundingBox(),
    ]);
    expect(dockBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(composerBox!.y);

    // The dock starts expanded, so task details are already visible.
    await expect(todoDock.getByText("2/2 tasks completed")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Test the news workflow",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("[REDACTED]")).toBeVisible();
    await page.getByRole("button", { name: "Approve and run" }).click();

    await expect(
      page.getByRole("heading", { name: "Run details" }),
    ).toBeVisible();
    await expect(
      page.getByText("HTTP 401: invalid API key", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Step input")).toBeVisible();
    await expect(page.getByText('"topic": "technology"')).toBeVisible();
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
