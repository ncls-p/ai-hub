import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

test("executes JavaScript and Python workflow steps in the local sandbox", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_DOCKER_SANDBOX !== "true" &&
      !existsSync(
        process.env.SANDBOX_RUNNER_SOCKET ??
          ".data/sandbox-runner/sandbox.sock",
      ),
    "The optional local sandbox runner is not available.",
  );

  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])!
    .workspace.id;
  const createResponse = await page.request.post("/api/workspace/workflows", {
    data: { workspaceId, name: `Sandbox E2E ${Date.now()}` },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    workflow: { id: string };
  };
  const workflowId = created.workflow.id;
  const settings = {
    timeoutMs: 30_000,
    maxRetries: 0,
    retryDelayMs: 1_000,
  };

  try {
    const updateResponse = await page.request.patch(
      `/api/workspace/workflows/${workflowId}`,
      {
        data: {
          workspaceId,
          definition: {
            schemaVersion: 1,
            nodes: [
              {
                id: "trigger",
                type: "trigger.manual",
                label: "Trigger",
                position: { x: 0, y: 0 },
                parameters: {},
                settings,
              },
              {
                id: "javascript",
                type: "code.execute",
                label: "JavaScript",
                position: { x: 250, y: 0 },
                parameters: {
                  language: "node",
                  code: [
                    "const chunks = [];",
                    "for await (const chunk of process.stdin) chunks.push(chunk);",
                    "const input = JSON.parse(Buffer.concat(chunks).toString());",
                    "console.log(JSON.stringify({ ...input, value: input.value + 1, javascript: true }));",
                  ].join("\n"),
                },
                settings,
              },
              {
                id: "python",
                type: "code.execute",
                label: "Python",
                position: { x: 500, y: 0 },
                parameters: {
                  language: "python",
                  code: [
                    "import json, sys",
                    "data = json.load(sys.stdin)",
                    "data['value'] *= 2",
                    "data['python'] = True",
                    "print(json.dumps(data))",
                  ].join("\n"),
                },
                settings,
              },
            ],
            edges: [
              {
                id: "trigger-javascript",
                source: "trigger",
                target: "javascript",
              },
              {
                id: "javascript-python",
                source: "javascript",
                target: "python",
              },
            ],
          },
        },
      },
    );
    expect(updateResponse.status()).toBe(200);

    const runResponse = await page.request.post(
      `/api/workspace/workflows/${workflowId}/runs`,
      {
        data: {
          workspaceId,
          input: { value: 20 },
          useLatestDraft: true,
        },
      },
    );
    expect(runResponse.status()).toBe(202);
    const run = (await runResponse.json()) as { run: { id: string } };

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/workspace/workflow-runs/${run.run.id}?workspaceId=${workspaceId}`,
          );
          const payload = (await response.json()) as {
            run: {
              status: string;
              error: string | null;
              steps: Array<{
                nodeId: string;
                status: string;
                outputJson: unknown;
              }>;
            };
          };
          return payload.run;
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        status: "completed",
        error: null,
        steps: [
          { nodeId: "trigger", status: "completed" },
          {
            nodeId: "javascript",
            status: "completed",
            outputJson: { value: 21, javascript: true },
          },
          {
            nodeId: "python",
            status: "completed",
            outputJson: { value: 42, javascript: true, python: true },
          },
        ],
      });
  } finally {
    await page.request.delete(
      `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
    );
  }
});
