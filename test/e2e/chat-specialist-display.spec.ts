import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  activate,
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EUser,
  login,
} from "./fixtures";

nextEnv.loadEnvConfig(process.cwd());

async function createConversationWithSpecialistTrace() {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const rootContext = {
    agentId,
    agentName: "E2E orchestrator",
    runId: "root-run",
    depth: 0,
    status: "success",
  };
  const childContext = {
    agentId: randomUUID(),
    agentName: "Data specialist",
    runId: "child-run",
    parentRunId: "root-run",
    depth: 1,
    status: "success",
  };
  const parts = [
    {
      type: "tool-call",
      metadata: {
        toolCallId: "delegate-call",
        toolName: "delegate_specialist_1",
        input: { task: "Build a chart" },
        agentContext: rootContext,
      },
    },
    {
      type: "tool-call",
      metadata: {
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        input: {
          language: "python",
          code: "make_chart()",
          showToUser: true,
        },
        agentContext: childContext,
      },
    },
    {
      type: "tool-result",
      metadata: {
        toolCallId: "sandbox-call",
        toolName: "run_code_sandbox",
        output: {
          kind: "code_sandbox_result",
          ok: true,
          language: "python",
          exitCode: 0,
          timedOut: false,
          durationMs: 18,
          stdout: "",
          stderr: "",
          files: [
            {
              path: "chart.png",
              size: 120,
              mimeType: "image/png",
              fromInput: false,
            },
          ],
        },
        agentContext: childContext,
      },
    },
    {
      type: "tool-call",
      metadata: {
        toolCallId: "search-call",
        toolName: "web_search",
        input: { query: "latest figures" },
        agentContext: childContext,
      },
    },
    {
      type: "tool-result",
      metadata: {
        toolCallId: "search-call",
        toolName: "web_search",
        output: { sourceCount: 2 },
        agentContext: childContext,
      },
    },
    {
      type: "tool-result",
      metadata: {
        toolCallId: "delegate-call",
        toolName: "delegate_specialist_1",
        output: { childAgentName: "Data specialist", result: "Chart ready" },
        agentContext: rootContext,
      },
    },
    {
      type: "tool-call",
      metadata: {
        toolCallId: "publish-call",
        toolName: "publish_specialist_output",
        input: { visualOutputId: randomUUID() },
        agentContext: rootContext,
      },
    },
    {
      type: "tool-result",
      metadata: {
        toolCallId: "publish-call",
        toolName: "publish_specialist_output",
        output: {
          kind: "html_artifact",
          title: "Published specialist chart",
          html: "<p>Published chart</p>",
          css: "",
          js: "",
          height: 240,
        },
        agentContext: rootContext,
      },
    },
  ];
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(
      `insert into conversations (id, workspace_id, agent_id, agent_version_id, user_id, title, status, created_at, updated_at) select $1, $2, $3, a.active_version_id, u.id, 'E2E specialist display', 'active', now(), now() from agents a, "user" u where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [conversationId, workspaceId, agentId],
    );
    await client.query(
      `insert into messages (id, conversation_id, role, status, completed_at, created_at) values ($1, $2, 'assistant', 'completed', now(), now())`,
      [messageId, conversationId],
    );
    for (const [sortOrder, part] of parts.entries())
      await client.query(
        `insert into message_parts (message_id, type, metadata_json, sort_order) values ($1, $2, $3::jsonb, $4)`,
        [messageId, part.type, JSON.stringify(part.metadata), sortOrder],
      );
    return { id: conversationId, agentId };
  } finally {
    await client.end();
  }
}

async function deleteConversation(id: string) {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("delete from conversations where id = $1", [id]);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await ensureE2EUser();
  await ensureE2EAssistant();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("keeps every specialist tool collapsed while showing explicitly published visuals", async ({
  page,
}) => {
  const conversation = await createConversationWithSpecialistTrace();
  try {
    await page.goto(
      `/en/chat?agentId=${conversation.agentId}&conversationId=${conversation.id}`,
    );
    await expect(
      page.getByText("Specialist work completed", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Data specialist", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("chart.png", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText("Published specialist chart", { exact: true }),
    ).toBeVisible();
    await activate(
      page.getByRole("button", { name: "Show all specialist details" }),
    );
    await expect(page.getByText("chart.png", { exact: true })).toBeVisible();
    const source = page.getByRole("button", {
      name: "Source code",
      exact: true,
    });
    await source.click();
    await expect(
      page.locator("pre").filter({ hasText: "make_chart()" }),
    ).toBeVisible();
    await source.click();
    await expect(
      page.locator("pre").filter({ hasText: "make_chart()" }),
    ).not.toBeVisible();
    await expect(page.getByText("web search", { exact: true })).toBeVisible();
    await activate(
      page.getByRole("button", { name: "Hide specialist details" }),
    );
    await expect(
      page.getByText("chart.png", { exact: true }),
    ).not.toBeVisible();
  } finally {
    await deleteConversation(conversation.id);
  }
});
