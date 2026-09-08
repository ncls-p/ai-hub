import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { Client } from "pg";
import {
  databaseUrl,
  ensureE2EAssistant,
  ensureE2EUser,
  login,
} from "./fixtures";
import {
  writeStream,
  writeToolCall,
  usage,
} from "./workflow-agentic-live.spec.upstream";

test.beforeAll(ensureE2EUser);
test.beforeEach(async ({ page }) => login(page));

test("a model tool call deletes a real code workspace file and updates persisted files, preview and ZIP", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  let projectId = "";
  let toolCalls = 0;
  let advertised = false;
  let toolResult = "";
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      model: string;
      tools?: Array<{ function: { name: string } }>;
      messages: Array<{ role: string; content: string }>;
    };
    const result = body.messages.find((message) => message.role === "tool");
    const created = Math.floor(Date.now() / 1000);
    if (!result) {
      advertised = Boolean(
        body.tools?.some(
          (tool) => tool.function.name === "code_workspace_delete_file",
        ),
      );
      toolCalls++;
      writeToolCall(response, {
        created,
        model: body.model,
        id: "call_delete_file",
        name: "code_workspace_delete_file",
        arguments: { projectId, path: "obsolete.js" },
      });
      return;
    }
    toolResult = result.content;
    writeStream(response, [
      {
        id: "chatcmpl-delete",
        object: "chat.completion.chunk",
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "The obsolete file has been removed.",
            },
            finish_reason: "stop",
          },
        ],
        usage: usage(),
      },
    ]);
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Upstream not ready");
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  let agentId: string | undefined, providerId: string | undefined;
  try {
    const provider = await page.request.post("/api/workspace/providers", {
      data: {
        workspaceId,
        kind: "openai-compatible",
        name: `Delete tool ${randomUUID()}`,
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        authType: "custom-header",
        openaiCompatibleApiRoute: "chat-completions",
      },
    });
    expect(provider.status(), await provider.text()).toBe(201);
    providerId = (await provider.json()).id;
    const model = await page.request.post(
      `/api/workspace/providers/${providerId}/models`,
      {
        data: {
          workspaceId,
          modelId: "delete-tool-test",
          displayName: "Delete tool model",
          capabilitiesJson: { text: true, tools: true },
          contextWindow: 32000,
          maxOutputTokens: 4096,
        },
      },
    );
    expect(model.status(), await model.text()).toBe(201);
    const modelId = (await model.json()).id;
    const agent = await page.request.post("/api/workspace/agents", {
      data: {
        workspaceId,
        name: "Code cleanup",
        slug: `code-cleanup-${randomUUID()}`,
        providerId,
        modelId,
        maxOutputTokens: 4096,
      },
    });
    expect(agent.status(), await agent.text()).toBe(201);
    agentId = (await agent.json()).agent.id;
    const zip = new JSZip()
      .file("index.html", "<!doctype html><h1>Retained page</h1>")
      .file("obsolete.js", "window.obsolete = true;")
      .file("styles.css", "h1 { color: teal; }");
    const upload = await page.request.post(
      "/api/workspace/code-projects/upload",
      {
        multipart: {
          workspaceId,
          file: {
            name: "cleanup.zip",
            mimeType: "application/zip",
            buffer: await zip.generateAsync({ type: "nodebuffer" }),
          },
        },
      },
    );
    expect(upload.status(), await upload.text()).toBe(200);
    const { artifact } = await upload.json();
    projectId = artifact.projectId;
    const chat = await page.request.post(`/api/workspace/${agentId}/chat`, {
      data: {
        content: "Delete obsolete.js from this code workspace.",
        codeWorkspaceId: projectId,
        capabilityOverrides: {
          disabledTools: [],
          disabledSkillIds: [],
          enabledTools: [
            { source: "builtin", id: "00000000-0000-4000-8000-000000000033" },
          ],
        },
      },
    });
    expect(chat.status()).toBe(200);
    const stream = await chat.text();
    expect(stream).toContain("The obsolete file has been removed.");
    expect(advertised).toBe(true);
    expect(toolCalls).toBe(1);
    expect(toolResult).toContain("Deleted obsolete.js");
    const files = await page.request.get(
      `/api/workspace/code-projects/${projectId}/files`,
    );
    const metadata = await files.json();
    expect(
      metadata.files.map((file: { path: string }) => file.path).sort(),
    ).toEqual(["index.html", "styles.css"]);
    const deleted = await page.request.get(
      `/api/workspace/code-projects/${projectId}/files?path=obsolete.js`,
    );
    expect(deleted.status()).toBe(404);
    const download = await page.request.get(
      `/api/workspace/code-projects/${projectId}/download`,
    );
    const downloaded = await JSZip.loadAsync(await download.body());
    expect(downloaded.file("obsolete.js")).toBeNull();
    expect(await downloaded.file("styles.css")!.async("string")).toBe(
      "h1 { color: teal; }",
    );
    const preview = await page.request.get(artifact.previewUrl);
    expect(preview.status()).toBe(200);
    expect(await preview.text()).toContain("Retained page");
    const rows = await client.query(
      "select id from conversations where agent_id = $1",
      [agentId],
    );
    expect(rows.rows).toHaveLength(1);
    await page.goto(
      `/en/chat?agentId=${agentId}&conversationId=${rows.rows[0].id}`,
    );
    await expect(
      page.getByText("The obsolete file has been removed.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("The obsolete file has been removed.", { exact: true }),
    ).toBeVisible();
  } finally {
    if (agentId) {
      await client.query(
        "delete from tool_invocations where conversation_id in (select id from conversations where agent_id = $1)",
        [agentId],
      );
      await client.query("delete from conversations where agent_id = $1", [
        agentId,
      ]);
      await client.query("delete from agent_versions where agent_id = $1", [
        agentId,
      ]);
      await client.query("delete from agents where id = $1", [agentId]);
    }
    if (providerId)
      await client.query("delete from ai_providers where id = $1", [
        providerId,
      ]);
    await client.end();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
