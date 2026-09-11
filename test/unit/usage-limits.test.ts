import { describe, expect, it, vi, beforeEach } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { withUsageLimits } from "@/modules/usage/limited-language-model";
const calls = vi.hoisted(() => ({ reserve: vi.fn(), settle: vi.fn() }));
vi.mock("@/modules/usage/usage-limits", () => ({
  reserveUsageLimits: calls.reserve,
  settleUsageLimits: calls.settle,
}));
const context = {
  userId: "u",
  workspaceId: "w",
  providerId: "p",
  modelId: "m",
};
const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};
describe("usage admission middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.reserve.mockResolvedValue("reservation");
    calls.settle.mockResolvedValue(undefined);
  });
  it("does not call the provider when admission is refused", async () => {
    const generate = vi.fn();
    calls.reserve.mockRejectedValue(new Error("Quota exceeded"));
    const model = withUsageLimits(
      new MockLanguageModelV4({ doGenerate: generate }),
      context,
      {},
    );
    await expect(
      model.doGenerate({ prompt: [], maxOutputTokens: 10 }),
    ).rejects.toThrow("Quota exceeded");
    expect(generate).not.toHaveBeenCalled();
  });
  it("settles actual generated tokens and cost", async () => {
    const model = withUsageLimits(
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        }),
      }),
      context,
      { inputTokenCost: "1", outputTokenCost: "2" },
    );
    await model.doGenerate({ prompt: [], maxOutputTokens: 10 });
    expect(calls.reserve).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ tokens: expect.any(Number) }),
    );
    expect(calls.settle).toHaveBeenCalledWith("reservation", {
      tokens: 8,
      costUsd: 0.000011,
    });
  });
  it("keeps a conservative reservation after an ambiguous provider error", async () => {
    const model = withUsageLimits(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("Disconnected");
        },
      }),
      context,
      {},
    );
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow(
      "Disconnected",
    );
    expect(calls.settle).toHaveBeenCalledWith("reservation");
  });
  it("requires an input bound for multimodal token admission", async () => {
    const model = withUsageLimits(
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        }),
      }),
      context,
      {},
    );
    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "image/png",
              data: {
                type: "url",
                url: new URL("https://example.test/image.png"),
              },
            },
          ],
        },
      ],
      maxOutputTokens: 10,
    });
    expect(calls.reserve).toHaveBeenCalledWith(context, {
      tokens: null,
      costUsd: null,
    });
  });
  it("settles a completed stream exactly once", async () => {
    const model = withUsageLimits(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
              });
              c.close();
            },
          }),
        }),
      }),
      context,
      { inputTokenCost: "0", outputTokenCost: "0" },
    );
    const result = await model.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    while (!(await reader.read()).done) {}
    expect(calls.settle).toHaveBeenCalledTimes(1);
    expect(calls.settle).toHaveBeenCalledWith("reservation", {
      tokens: 8,
      costUsd: 0,
    });
  });
});
