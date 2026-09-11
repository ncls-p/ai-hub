import { describe, expect, it, vi } from "vitest";

import { decryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import {
  generateChatAutomationArtifacts,
  testChatAutomationConnection,
  validateChatAutomationConfig,
} from "@/modules/chat/automation";
import { generateText } from "ai";
import {
  dbModule,
  enabledConfig,
  model,
  provider,
  resetDb,
} from "./chat-automation-db.test.db-module";

describe("chat automation runtime validation", () => {
  it("does not decrypt credentials when the model is unavailable to the selected organization", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([]);
    expect(
      (await validateChatAutomationConfig(enabledConfig, "other-org")).ok,
    ).toBe(false);
    expect(decryptValue).not.toHaveBeenCalled();
  });

  it("rejects missing provider/model and unavailable runtime rows", async () => {
    await expect(
      validateChatAutomationConfig(
        {
          enabled: true,
          generateTitles: true,
          generateSuggestions: true,
        },
        "org-1",
      ),
    ).resolves.toMatchObject({ ok: false });

    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      validateChatAutomationConfig(enabledConfig, "org-1"),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: "runtime_unavailable",
          message:
            "Selected provider was not found, is disabled, or is archived.",
        },
      ],
    });

    resetDb();
    dbModule._c.limit
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([]);
    await expect(
      validateChatAutomationConfig(enabledConfig, "org-1"),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: "runtime_unavailable",
          message:
            "Selected model was not found, is disabled, or does not belong to the provider.",
        },
      ],
    });
  });

  it("tests the configured model and reports empty or thrown responses", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }]);

    await expect(testChatAutomationConnection("org-1")).resolves.toEqual({
      ok: true,
    });
    expect(decryptValue).toHaveBeenCalledWith("api-key");
    expect(decryptValue).toHaveBeenCalledWith("header");

    resetDb();
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "",
      finalStep: { reasoning: [] },
    } as never);
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }]);
    await expect(testChatAutomationConnection("org-1")).resolves.toEqual({
      ok: false,
      error: "Model returned an empty response.",
    });

    resetDb();
    vi.mocked(generateText).mockRejectedValueOnce(new Error("model down"));
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }]);
    await expect(testChatAutomationConnection("org-1")).resolves.toEqual({
      ok: false,
      error: "model down",
    });
  });
});

describe("generateChatAutomationArtifacts", () => {
  it("uses fallback when automation is disabled or runtime is unavailable", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { valueJson: { enabled: false } },
    ]);
    await expect(
      generateChatAutomationArtifacts({
        workspaceId: "workspace-1",
        userMessage: "Bonjour aide moi",
        assistantText: "Bien sûr",
        fallbackTitle: "Fallback",
      }),
    ).resolves.toEqual({ title: "Fallback", suggestions: [] });

    resetDb();
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([]);
    const result = await generateChatAutomationArtifacts({
      workspaceId: "workspace-1",
      userMessage: "Bonjour aide moi",
      assistantText: "Bien sûr",
      fallbackTitle: "Fallback",
    });
    expect(result.title).toBe("Bonjour aide moi");
    expect(result.suggestions).toHaveLength(3);
    expect(logHandledWarning).toHaveBeenCalledWith(
      "Chat automation runtime unavailable, using local fallback",
      expect.any(Object),
    );
  });

  it("generates artifacts with retries, sanitizes title, and pads suggestions", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: "",
        finalStep: { reasoning: [] },
      } as never)
      .mockResolvedValueOnce({
        text: '{"title":"Planned roadmap","suggestions":["Next step","Another angle","Third option"]}',
        finalStep: { reasoning: [] },
      } as never);
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }]);

    const result = await generateChatAutomationArtifacts({
      workspaceId: "workspace-1",
      userMessage: "Build a roadmap",
      assistantText: "Here is a plan",
      fallbackTitle: "Fallback",
    });

    expect(result.title).toBe("Planned roadmap");
    expect(result.suggestions).toEqual([
      "Next step",
      "Another angle",
      "Third option",
    ]);
  });

  it("falls back when generation throws and honors suggestion opt-out", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("bad model"));
    dbModule._c.limit
      .mockResolvedValueOnce([{ valueJson: enabledConfig }])
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([{ id: "allowed" }]);

    const result = await generateChatAutomationArtifacts({
      workspaceId: "workspace-1",
      userMessage: "Build a roadmap",
      assistantText: "Here is a plan",
      fallbackTitle: "Fallback",
      generateSuggestions: false,
    });

    expect(result).toEqual({ title: "Build a roadmap", suggestions: [] });
    expect(logHandledWarning).toHaveBeenCalledWith(
      "Failed to generate chat automation artifacts",
      expect.objectContaining({ error: "bad model" }),
    );
  });
});
