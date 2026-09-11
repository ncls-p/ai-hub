import nextEnv from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

nextEnv.loadEnvConfig(process.cwd());

type SandboxStreamWindow = Window & {
  sandboxStream?: ReadableStreamDefaultController<Uint8Array>;
};

async function emit(page: Page, chunks: unknown[], close = false) {
  await page.evaluate(
    ({ chunks, close }) => {
      const controller = (window as SandboxStreamWindow).sandboxStream!;
      const encoder = new TextEncoder();
      for (const chunk of chunks)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      if (close) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    { chunks, close },
  );
}

test("shows sandbox code incrementally before showToUser arrives and reopens executed source", async ({
  page,
}) => {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  await login(page);
  expect(
    (
      await page.request.patch("/api/workspaces", { data: { workspaceId } })
    ).ok(),
  ).toBe(true);
  // Control the actual UI stream reader without executing a provider or sandbox.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        init?.method === "POST" &&
        /\/api\/workspace\/[^/]+\/chat$/.test(url)
      ) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              (window as SandboxStreamWindow).sandboxStream = controller;
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-vercel-ai-ui-message-stream": "v1",
            },
          },
        );
      }
      return originalFetch(input, init);
    };
  });
  await page.goto(`/en/chat?agentId=${agentId}`);
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Run a sandbox calculation");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as SandboxStreamWindow).sandboxStream),
      ),
    )
    .toBe(true);
  const toolCallId = "sandbox-live-call";
  await emit(page, [
    { type: "start", messageId: "sandbox-live-message" },
    { type: "tool-input-start", toolCallId, toolName: "run_code_sandbox" },
    {
      type: "tool-input-delta",
      toolCallId,
      inputTextDelta: '{"language":"python","code":"print(41)',
    },
  ]);
  const liveCode = page.locator("pre").filter({ hasText: "print(41)" });
  await expect(liveCode).toBeVisible();
  await expect(
    page.getByText("Writing python code…", { exact: true }),
  ).toBeVisible();
  await emit(page, [
    { type: "tool-input-delta", toolCallId, inputTextDelta: "\\nprint(42)" },
  ]);
  await expect(liveCode).toHaveText("print(41)\nprint(42)");
  await emit(
    page,
    [
      {
        type: "tool-input-delta",
        toolCallId,
        inputTextDelta: '","showToUser":true}',
      },
      {
        type: "tool-input-available",
        toolCallId,
        toolName: "run_code_sandbox",
        input: {
          language: "python",
          code: "print(41)\nprint(42)",
          showToUser: true,
        },
      },
      {
        type: "tool-output-available",
        toolCallId,
        output: {
          kind: "code_sandbox_result",
          ok: true,
          language: "python",
          exitCode: 0,
          timedOut: false,
          durationMs: 12,
          stdout: "41\n42",
          stderr: "",
          files: [],
        },
      },
      { type: "finish" },
    ],
    true,
  );
  const source = page.getByRole("button", { name: "Source code", exact: true });
  await expect(source).toHaveAttribute("aria-expanded", "false");
  await source.focus();
  await page.keyboard.press("Enter");
  await expect(source).toHaveAttribute("aria-expanded", "true");
  await expect(liveCode).toBeVisible();
  await source.click();
  await expect(liveCode).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await source.click();
  await expect(liveCode).toBeVisible();
});
