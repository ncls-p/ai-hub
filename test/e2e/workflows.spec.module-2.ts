import { expect, test } from "@playwright/test";

test("switches between visual and agentic editing while keeping live changes", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])!
    .workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Agentic E2E ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    workflow: { id: string };
  };
  const workflowId = created.workflow.id;
  const definition = {
    schemaVersion: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        label: "API trigger",
        position: { x: 80, y: 180 },
        parameters: {},
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "condition",
        type: "logic.condition",
        label: "Message received?",
        position: { x: 380, y: 180 },
        parameters: {
          path: "message",
          operator: "exists",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "summary",
        type: "data.template",
        label: "Prepare summary",
        position: { x: 680, y: 100 },
        parameters: {
          template: "Summary: {{message}}",
          outputPath: "summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "fallback",
        type: "data.template",
        label: "Prepare fallback",
        position: { x: 680, y: 280 },
        parameters: {
          template: "No message received",
          outputPath: "summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
      {
        id: "debug",
        type: "debug.snapshot",
        label: "Inspect output",
        position: { x: 980, y: 100 },
        parameters: {
          note: "Verify the final summary",
        },
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
    ],
    edges: [
      {
        id: "edge-trigger-condition",
        source: "trigger",
        target: "condition",
        sourceHandle: null,
      },
      {
        id: "edge-condition-summary",
        source: "condition",
        target: "summary",
        sourceHandle: "true",
      },
      {
        id: "edge-condition-fallback",
        source: "condition",
        target: "fallback",
        sourceHandle: "false",
      },
    ],
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
            }),
          });
          return;
        }
        const events = [
          { type: "agent", name: "Workflow assistant" },
          {
            type: "tool_start",
            id: "tool-1",
            toolName: "replace_workflow",
            label: "Building the workflow",
          },
          {
            type: "tool_result",
            id: "tool-1",
            toolName: "replace_workflow",
            label: "Building the workflow",
          },
          {
            type: "workflow",
            draft: {
              name: "Live summary",
              description: null,
              definition,
            },
          },
          { type: "text", delta: "**The summary workflow is ready.**" },
          { type: "done" },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        });
      },
    );

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await expect(
      page.getByRole("heading", { name: "Build with an agent" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Build a summary workflow");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Using Workflow assistant")).toBeVisible();
    await expect(page.getByText("Building the workflow")).toBeVisible();
    await expect(
      page.getByText("Prepare summary", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("The summary workflow is ready."),
    ).toBeVisible();
    await expect(
      page.locator('[data-streamdown="strong"]').filter({
        hasText: "The summary workflow is ready.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Workflow name" }),
    ).toHaveValue("Live summary");
    const conditionNode = page.locator(
      '.react-flow__node[data-id="condition"]',
    );
    await expect(
      conditionNode.locator('.react-flow__handle-right[data-handleid="true"]'),
    ).toHaveCount(1);
    await expect(
      conditionNode.locator('.react-flow__handle-right[data-handleid="false"]'),
    ).toHaveCount(1);

    await page.getByText("Prepare summary", { exact: true }).last().click();
    const stepName = page.getByRole("textbox", { name: "Step name" });
    await expect(stepName).toBeVisible();
    await stepName.fill("Prepare concise summary");
    await expect(
      page.getByText("Prepare concise summary", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(stepName).not.toBeVisible();

    const summaryNode = page.locator('.react-flow__node[data-id="summary"]');
    const beforeMove = await summaryNode.boundingBox();
    expect(beforeMove).not.toBeNull();
    await page.mouse.move(
      beforeMove!.x + beforeMove!.width / 2,
      beforeMove!.y + beforeMove!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeMove!.x + beforeMove!.width / 2 - 80,
      beforeMove!.y + beforeMove!.height / 2 + 40,
      { steps: 6 },
    );
    await page.mouse.up();
    const afterMove = await summaryNode.boundingBox();
    expect(Math.abs(afterMove!.x - beforeMove!.x)).toBeGreaterThan(40);

    const summarySource = summaryNode.locator(
      ".react-flow__handle-right.source",
    );
    const debugTarget = page
      .locator('.react-flow__node[data-id="debug"]')
      .locator(".react-flow__handle-left.target");
    await expect(summarySource).toHaveCount(1);
    await expect(debugTarget).toHaveCount(1);
    const sourceBox = await summarySource.boundingBox();
    const targetBox = await debugTarget.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(4);

    await page.getByRole("button", { name: "Visual" }).click();
    await expect(page.getByText("Steps", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Prepare concise summary", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
