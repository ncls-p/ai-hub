import { describe, expect, it } from "vitest";

import {
  codeSandboxOutputFromUnknown,
  codeSandboxToolVisualState,
  partitionCodeSandboxFiles,
  summarizeToolBody,
  toolPartHasStandaloneRendering,
} from "@/components/chat/chat-message-rendering-utils";

describe("code sandbox result rendering", () => {
  it("previews a structured result instead of its object key", () => {
    expect(
      summarizeToolBody(
        "deepwiki_ask_question",
        { result: "ServiceNow Australia is the latest release." },
        false,
      ),
    ).toBe("ServiceNow Australia is the latest release.");
  });

  it("keeps input provenance while normalizing a sandbox result", () => {
    const result = codeSandboxOutputFromUnknown({
      kind: "code_sandbox_result",
      ok: true,
      language: "python",
      files: [
        {
          path: "attachments/report.document/pages/001-page-1.md",
          size: 1200,
          mimeType: "text/markdown",
          fromInput: true,
          modified: false,
        },
      ],
    });

    expect(result?.files[0]).toMatchObject({
      fromInput: true,
      modified: false,
    });
  });

  it("separates unchanged inputs from created or modified files", () => {
    const files = [
      {
        path: "attachments/report.document/pages/001-page-1.md",
        size: 1200,
        mimeType: "text/markdown",
        fromInput: true,
        modified: false,
      },
      { path: "summary.md", size: 420, mimeType: "text/markdown" },
      {
        path: "attachments/report.document/README.md",
        size: 700,
        mimeType: "text/markdown",
        fromInput: true,
        modified: true,
      },
    ];

    const partitioned = partitionCodeSandboxFiles(files);

    expect(partitioned.inputFiles.map((file) => file.path)).toEqual([
      "attachments/report.document/pages/001-page-1.md",
    ]);
    expect(partitioned.outputFiles.map((file) => file.path)).toEqual([
      "summary.md",
      "attachments/report.document/README.md",
    ]);
  });

  it("keeps code execution failures visually neutral at the tool level", () => {
    const failedExecution = {
      kind: "code_sandbox_result",
      ok: false,
      language: "python",
      exitCode: 1,
      timedOut: false,
      durationMs: 12,
      stdout: "",
      stderr: "SyntaxError",
      files: [],
    };

    expect(codeSandboxToolVisualState(failedExecution, "error")).toBe(
      "completed",
    );
    expect(
      codeSandboxToolVisualState({ error: "Sandbox unavailable" }, "error"),
    ).toBe("error");
  });

  it("keeps visual tools outside the collapsible work trace for their whole lifecycle", () => {
    for (const toolName of [
      "render_html_artifact",
      "generate_image",
      "code_workspace_write_file",
      "github_publish_code_workspace",
    ]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({ toolName }),
        }),
      ).toBe(true);
    }

    expect(
      toolPartHasStandaloneRendering({
        type: "tool-call",
        content: JSON.stringify({ toolName: "web_search" }),
      }),
    ).toBe(false);
  });

  it("shows a sandbox standalone only when the model explicitly requests it", () => {
    expect(
      toolPartHasStandaloneRendering({
        type: "tool-call",
        content: JSON.stringify({
          toolName: "run_code_sandbox",
          input: { language: "python", code: "print(1)" },
        }),
      }),
    ).toBe(false);

    expect(
      toolPartHasStandaloneRendering({
        type: "tool-call",
        content: JSON.stringify({
          toolName: "run_code_sandbox",
          input: {
            language: "python",
            code: "print(1)",
            showToUser: true,
          },
        }),
      }),
    ).toBe(true);
  });

  it("shows sandbox code while streaming before the final visibility flag", () => {
    for (const toolName of [
      "run_code_sandbox",
      "specialist_run_code_sandbox",
    ]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({
            toolName,
            streamingInput: true,
            inputText: '{"language":"python","code":"print(',
          }),
        }),
      ).toBe(true);
    }
  });

  it("keeps every child-agent visual tool inside the specialist trace", () => {
    for (const toolName of [
      "run_code_sandbox",
      "render_html_artifact",
      "generate_image",
      "code_workspace_write_file",
    ]) {
      expect(
        toolPartHasStandaloneRendering({
          type: "tool-call",
          content: JSON.stringify({
            toolName,
            agentContext: {
              agentId: "child-agent",
              agentName: "Research specialist",
              runId: "child-run",
              parentRunId: "root-run",
              depth: 1,
              status: "success",
            },
          }),
        }),
      ).toBe(false);
    }
  });
});
