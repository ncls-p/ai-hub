import { expect, test } from "@playwright/test";

import {
  generatedDefinition,
  upstreamState,
} from "./workflow-agentic-live.spec.upstream";

test("builds, saves, and runs a workflow through the real agentic provider stream", async ({
  page,
}) => {
  const workspaces = (await (
    await page.request.get("/api/workspaces")
  ).json()) as Array<{ workspace: { id: string }; isActive: boolean }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])!
    .workspace.id;
  const previousBuilderState = (await (
    await page.request.get(
      `/api/admin/workflow-builder?workspaceId=${workspaceId}`,
    )
  ).json()) as {
    config: { agentId: string | null };
  };

  let providerId: string | undefined;
  let agentId: string | undefined;
  let workflowId: string | undefined;

  try {
    const providerResponse = await page.request.post(
      "/api/workspace/providers",
      {
        data: {
          workspaceId,
          kind: "openai-compatible",
          name: "Workflow agentic E2E upstream",
          baseUrl: `${upstreamState.baseUrl}/v1`,
          authType: "custom-header",
          openaiCompatibleApiRoute: "chat-completions",
        },
      },
    );
    expect(providerResponse.status()).toBe(201);
    providerId = ((await providerResponse.json()) as { id: string }).id;

    const modelResponse = await page.request.post(
      `/api/workspace/providers/${providerId}/models`,
      {
        data: {
          workspaceId,
          modelId: `workflow-agentic-e2e-${Date.now()}`,
          displayName: "Workflow agentic E2E model",
          capabilitiesJson: { text: true, tools: true },
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
      },
    );
    expect(modelResponse.status()).toBe(201);
    const modelId = ((await modelResponse.json()) as { id: string }).id;

    const agentResponse = await page.request.post("/api/workspace/agents", {
      data: {
        workspaceId,
        name: "Workflow builder E2E",
        slug: `workflow-builder-e2e-${Date.now()}`,
        systemPrompt: "Build deterministic workflow fixtures.",
        providerId,
        modelId,
        maxOutputTokens: 4_096,
      },
    });
    expect(agentResponse.status()).toBe(201);
    agentId = (
      (await agentResponse.json()) as {
        agent: { id: string };
      }
    ).agent.id;

    const builderSettingsResponse = await page.request.patch(
      "/api/admin/workflow-builder",
      {
        data: {
          workspaceId,
          agentId,
        },
      },
    );
    expect(builderSettingsResponse.ok()).toBe(true);

    const workflowResponse = await page.request.post(
      "/api/workspace/workflows",
      {
        data: {
          workspaceId,
          name: `Agentic live E2E ${Date.now()}`,
        },
      },
    );
    expect(workflowResponse.status()).toBe(201);
    workflowId = (
      (await workflowResponse.json()) as {
        workflow: { id: string };
      }
    ).workflow.id;

    await page.goto(`/en/workflows/${workflowId}`);
    await page.getByRole("button", { name: "Agentic" }).click();
    await page
      .getByRole("textbox", {
        name: /When a request arrives, have an assistant analyze it/i,
      })
      .fill("Build a summary workflow");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Using Workflow builder E2E")).toBeVisible();
    await expect(page.getByText("Updating workflow steps")).toBeVisible();
    await expect(page.getByText("Connecting workflow steps")).toBeVisible();
    await expect(
      page.getByText("The summary workflow is ready."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(
      page.getByText("Prepare summary", { exact: true }),
    ).toBeVisible();

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Agentic", exact: true }).click();
      await page.getByRole("button", { name: "Visual", exact: true }).click();
      await expect(
        page.getByText("Prepare summary", { exact: true }),
      ).toBeVisible();
    }
    await page.reload();
    await page.getByRole("button", { name: "Agentic" }).click();
    await expect(
      page.getByText("The summary workflow is ready."),
    ).toBeVisible();

    const persisted = (await (
      await page.request.get(
        `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
      )
    ).json()) as {
      workflow: {
        latestVersion: number;
        definition: typeof generatedDefinition;
      };
    };
    expect(persisted.workflow.latestVersion).toBe(2);
    expect(
      persisted.workflow.definition.nodes.some((node) => node.id === "summary"),
    ).toBe(true);
    expect(persisted.workflow.definition.edges).toHaveLength(1);
    expect(persisted.workflow.definition.edges[0]).toMatchObject({
      source: "trigger",
      target: "summary",
      sourceHandle: null,
    });

    const runResponse = await page.request.post(
      `/api/workspace/workflows/${workflowId}/runs`,
      {
        data: {
          workspaceId,
          input: { message: "Bonjour" },
          useLatestDraft: true,
        },
      },
    );
    expect(runResponse.status()).toBe(202);
    const runId = (
      (await runResponse.json()) as {
        run: { id: string };
      }
    ).run.id;

    await expect
      .poll(
        async () => {
          const detailResponse = await page.request.get(
            `/api/workspace/workflow-runs/${runId}?workspaceId=${workspaceId}`,
          );
          expect(detailResponse.status()).toBe(200);
          return (
            (await detailResponse.json()) as {
              run: {
                status: string;
                steps: Array<{ status: string }>;
              };
            }
          ).run;
        },
        { timeout: 15_000 },
      )
      .toMatchObject({
        status: "completed",
        steps: [{ status: "completed" }, { status: "completed" }],
      });
  } finally {
    await page.request.patch("/api/admin/workflow-builder", {
      data: {
        workspaceId,
        agentId: previousBuilderState.config.agentId,
      },
    });
    if (workflowId) {
      await page.request.delete(
        `/api/workspace/workflows/${workflowId}?workspaceId=${workspaceId}`,
      );
    }
    if (agentId) {
      await page.request.delete(
        `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
      );
    }
    if (providerId) {
      await page.request.delete(
        `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
      );
    }
  }
});
