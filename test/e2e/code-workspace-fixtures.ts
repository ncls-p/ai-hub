import { expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { ensureE2EAssistant } from "./fixtures";

/** Version label of the compact workspace card shown in the chat. */
export const WORKSPACE_VERSION = /Code workspace · v\d+/;
/** Version label in the standalone workbench header. */
export const WORKBENCH_VERSION = /Workspace v\d+ ·/;

/**
 * Uploads a small multi-language project as a code workspace and returns the
 * conversation it was attached to.
 */
export async function uploadCodeWorkspace(page: Page) {
  await ensureE2EAssistant();
  await page.goto("/en/chat");
  const zip = new JSZip();
  zip.file(
    "index.html",
    '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1 id="title">Popout demo</h1><script src="app.js"></script></body></html>',
  );
  zip.file("styles.css", "h1 { color: rgb(17, 24, 39); }\n");
  zip.file("app.js", "document.getElementById('title').dataset.ready = '1';\n");
  zip.file(
    "models/storage_model.ts",
    [
      "export interface StorageModel {",
      "  id: string;",
      "  size: number;",
      "}",
      "",
      "export function describe(model: StorageModel): string {",
      "  return `${model.id} (${model.size} bytes)`;",
      "}",
      "",
    ].join("\n"),
  );
  zip.file("scripts/main.py", "def main() -> None:\n    print('hello')\n");
  // Uploads are ignored until the selected assistant can chat (workspace and
  // agent version loaded); the attach button is enabled at the same moment.
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Upload files" })).toBeEnabled({
    timeout: 30_000,
  });
  await page.locator('[data-slot="chat-composer-file-input"]').setInputFiles({
    name: "site.zip",
    mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.getByText(WORKSPACE_VERSION)).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForURL(/conversationId=/, { timeout: 30_000 });
  // Let the (failing) e2e assistant turn settle so later page loads do not
  // reconnect to the live stream and overwrite the conversation payload.
  await expect(
    page.getByRole("button", { name: "Regenerate response" }),
  ).toBeVisible({ timeout: 60_000 });
  return new URL(page.url()).searchParams.get("conversationId")!;
}

/**
 * The e2e assistant has no real model behind it: serve the conversation with
 * one usage record so the impact chip renders.
 */
export async function injectConversationImpact(
  page: Page,
  conversationId: string,
) {
  await page.route(
    `**/api/workspace/conversations/${conversationId}`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const body = (await response.json()) as {
        messages?: Array<{
          id: string;
          role: string;
          status?: string;
          parts: Array<{ type: string; content: string }>;
        }>;
      };
      body.messages ??= [];
      const impact = {
        type: "impact",
        content: JSON.stringify({
          inputTokens: 1200,
          outputTokens: 340,
          cost: 0.0475,
          currency: "EUR",
          energyKwh: 0.0021,
          co2Grams: 1.2,
        }),
      };
      const assistant = body.messages.find(
        (message) => message.role === "assistant",
      );
      if (assistant) {
        // This fixture represents finalized usage. A still-settling stream or
        // browser draft must not replace its synthetic impact after navigation.
        assistant.status = "completed";
        assistant.parts = [
          ...assistant.parts.filter((part) => part.type !== "impact"),
          impact,
        ];
      } else {
        body.messages.push({
          id: "30000000-0000-4000-8000-000000000001",
          role: "assistant",
          status: "completed",
          parts: [{ type: "text", content: "Workspace ready." }, impact],
        });
      }
      await route.fulfill({ response, json: body });
    },
  );
}

export async function expectNoOverlap(
  page: Page,
  first: ReturnType<Page["locator"]>,
  second: ReturnType<Page["locator"]>,
) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  const overlaps =
    a!.x < b!.x + b!.width &&
    b!.x < a!.x + a!.width &&
    a!.y < b!.y + b!.height &&
    b!.y < a!.y + a!.height;
  expect(overlaps).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

/** Opens the share dialog, closes it, and checks the page stays clickable. */
export async function expectShareDialogReleasesPage(
  page: Page,
  composer: ReturnType<Page["locator"]>,
) {
  await page.getByRole("button", { name: "Share conversation" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.body.style.pointerEvents))
    .toBe("");
  await composer.locator("textarea").click({ trial: true });
}
