import Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "@playwright/test";
import OpenAI from "openai";

import {
  upstreamBaseUrl,
  upstreamBodies,
} from "./openai-proxy.spec.upstream-base-url";

test("official OpenAI and Anthropic SDKs use Maiah as a scoped model proxy", async ({
  page,
}) => {
  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBe(true);
  const workspaces = (await workspacesResponse.json()) as Array<{
    workspace: { id: string };
    isActive: boolean;
  }>;
  const workspaceId = (workspaces.find((row) => row.isActive) ?? workspaces[0])
    ?.workspace.id;
  if (!workspaceId) throw new Error("E2E workspace is missing");

  const modelName = `proxy-e2e-${Date.now()}`;
  let providerId: string | undefined;
  let tokenId: string | undefined;
  try {
    const providerResponse = await page.request.post(
      "/api/workspace/providers",
      {
        data: {
          workspaceId,
          kind: "openai-compatible",
          name: "OpenAI proxy E2E upstream",
          baseUrl: `${upstreamBaseUrl}/v1`,
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
          modelId: modelName,
          displayName: "Proxy E2E model",
          capabilitiesJson: { text: true, tools: true, vision: true },
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
          inputTokenCost: "1",
          outputTokenCost: "2",
        },
      },
    );
    expect(modelResponse.status()).toBe(201);

    const tokenResponse = await page.request.post("/api/workspace/api-keys", {
      data: {
        workspaceId,
        name: `OpenAI proxy E2E ${Date.now()}`,
        scopes: ["models.view", "models.invoke"],
      },
    });
    expect(tokenResponse.status()).toBe(201);
    const token = (await tokenResponse.json()) as {
      rawKey: string;
      apiKey: { id: string };
    };
    tokenId = token.apiKey.id;

    const appBaseUrl =
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const client = new OpenAI({
      apiKey: token.rawKey,
      baseURL: `${appBaseUrl}/api/v1`,
      maxRetries: 0,
    });

    const models = await client.models.list();
    expect(models.data.map((model) => model.id)).toContain(modelName);
    const retrieved = await client.models.retrieve(modelName);
    expect(retrieved.id).toBe(modelName);

    const chat = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Say proxy-ok" }],
      user: "openai-sdk-e2e",
      parallel_tool_calls: false,
    });
    expect(chat.choices[0]?.message.content).toBe("proxy-ok");
    expect(chat.usage?.total_tokens).toBe(12);
    expect(upstreamBodies).toContainEqual(
      expect.objectContaining({
        user: "openai-sdk-e2e",
        parallel_tool_calls: false,
      }),
    );

    const structured = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Return JSON" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer",
          strict: true,
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(JSON.parse(structured.choices[0]?.message.content ?? "{}")).toEqual({
      answer: "proxy-ok",
    });

    const toolCall = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Weather in Paris?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      ],
    });
    expect(toolCall.choices[0]?.finish_reason).toBe("tool_calls");
    const firstToolCall = toolCall.choices[0]?.message.tool_calls?.[0];
    expect(firstToolCall?.type).toBe("function");
    if (firstToolCall?.type !== "function") {
      throw new Error("Expected a function tool call");
    }
    expect(firstToolCall.function.name).toBe("get_weather");

    const response = await client.responses.create({
      model: modelName,
      input: "Say proxy-ok",
    });
    expect(response.output_text).toBe("proxy-ok");
    expect(response.usage?.total_tokens).toBe(12);

    const chatStream = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Stream" }],
      stream: true,
      stream_options: { include_usage: true },
    });
    let chatText = "";
    let streamedUsage: number | undefined;
    for await (const event of chatStream) {
      chatText += event.choices[0]?.delta.content ?? "";
      streamedUsage = event.usage?.total_tokens ?? streamedUsage;
    }
    expect(chatText).toBe("proxy-stream");
    expect(streamedUsage).toBe(12);

    const responseStream = await client.responses.create({
      model: modelName,
      input: "Stream",
      stream: true,
    });
    let responseText = "";
    let completed = false;
    for await (const event of responseStream) {
      if (event.type === "response.output_text.delta") {
        responseText += event.delta;
      }
      if (event.type === "response.completed") completed = true;
    }
    expect(responseText).toBe("proxy-stream");
    expect(completed).toBe(true);

    const anthropic = new Anthropic({
      apiKey: token.rawKey,
      baseURL: `${appBaseUrl}/api/anthropic`,
      maxRetries: 0,
    });
    const anthropicModels = await anthropic.models.list();
    expect(anthropicModels.data.map((model) => model.id)).toContain(modelName);
    const anthropicMessage = await anthropic.messages.create({
      model: modelName,
      max_tokens: 256,
      messages: [{ role: "user", content: "Say proxy-ok" }],
    });
    expect(anthropicMessage.content[0]).toEqual({
      type: "text",
      text: "proxy-ok",
    });
    expect(anthropicMessage.usage.input_tokens).toBe(8);

    const anthropicStream = await anthropic.messages.create({
      model: modelName,
      max_tokens: 256,
      messages: [{ role: "user", content: "Stream" }],
      stream: true,
    });
    let anthropicText = "";
    for await (const event of anthropicStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        anthropicText += event.delta.text;
      }
    }
    expect(anthropicText).toBe("proxy-stream");

    const usageResponse = await page.request.get(
      `/api/workspace/usage?workspaceId=${workspaceId}&operation=anthropic.messages`,
    );
    expect(usageResponse.ok()).toBe(true);
    const usage = (await usageResponse.json()) as {
      totals: {
        events: number;
        costs: Array<{ currency: string; amount: number }>;
      };
      operations: Array<{ operation: string; events: number }>;
    };
    expect(usage.totals.events).toBeGreaterThanOrEqual(2);
    expect(usage.totals.costs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: expect.any(String),
          amount: expect.any(Number),
        }),
      ]),
    );
    expect(usage.totals.costs[0]?.amount).toBeGreaterThan(0);
    expect(usage.operations).toContainEqual(
      expect.objectContaining({ operation: "anthropic.messages" }),
    );
  } finally {
    if (tokenId) {
      await page.request.delete(
        `/api/workspace/api-keys/${tokenId}?workspaceId=${workspaceId}`,
      );
    }
    if (providerId) {
      await page.request.delete(
        `/api/workspace/providers/${providerId}?workspaceId=${workspaceId}`,
      );
    }
  }
});
