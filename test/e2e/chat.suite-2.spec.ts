import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import {
  activate,
  ensureE2EAssistant,
  ensureE2EUser,
  fillControlled,
  login,
  openDropdown,
} from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("chat page", () => {
  test("routes code and generic ZIP files through their matching upload flows", async ({
    page,
  }) => {
    const { workspaceId } = await ensureE2EAssistant();
    const selection = await page.request.patch("/api/workspaces", {
      data: { workspaceId },
    });
    expect(selection.ok()).toBe(true);
    let codeUploads = 0;
    let attachmentUploads = 0;
    await page.route("**/api/workspace/code-projects/upload", async (route) => {
      codeUploads += 1;
      await route.fulfill({
        status: 400,
        json: { error: "Code ZIP detected" },
      });
    });
    await page.route(
      "**/api/workspace/chat-attachments/upload?*",
      async (route) => {
        attachmentUploads += 1;
        const phase = new URL(route.request().url()).searchParams.get("phase");
        if (phase === "chunk") {
          await route.fulfill({ status: 202, json: { accepted: true } });
          return;
        }
        await route.fulfill({
          json: {
            attachment: {
              kind: "chat_file",
              id: "20000000-0000-4000-8000-000000000099",
              fileName: "documents.zip",
              mimeType: "application/zip",
              size: 128,
              hash: "generic-zip-hash",
              url: "/api/workspace/chat-attachments/generic-zip",
              category: "file",
              extractionStatus: "unreadable",
              extractedTextChars: 0,
            },
          },
        });
      },
    );

    await page.goto("/en/chat");
    const uploadButton = page.getByRole("button", {
      name: "Upload files",
      exact: true,
    });
    const codeZip = new JSZip();
    codeZip.file(
      "entrypoints/content.tsx",
      "export const Content = () => null;",
    );
    // Open the real picker so the composer must be ready and interactive before
    // files are selected; the hidden SSR input can exist before its handlers.
    const [codePicker] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadButton.click(),
    ]);
    await codePicker.setFiles({
      name: "code.zip",
      mimeType: "application/zip",
      buffer: await codeZip.generateAsync({ type: "nodebuffer" }),
    });
    await expect(
      page.getByText("Code ZIP detected", { exact: true }),
    ).toBeVisible();
    expect(codeUploads).toBe(1);
    expect(attachmentUploads).toBe(0);

    const genericZip = new JSZip();
    genericZip.file("documents/notes.txt", "Notes");
    genericZip.file("documents/report.pdf", "%PDF-1.4");
    const [documentPicker] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadButton.click(),
    ]);
    await documentPicker.setFiles({
      name: "documents.zip",
      mimeType: "application/zip",
      buffer: await genericZip.generateAsync({ type: "nodebuffer" }),
    });
    await expect(
      page.getByText("documents.zip", { exact: true }),
    ).toBeVisible();
    expect(codeUploads).toBe(1);
    expect(attachmentUploads).toBeGreaterThanOrEqual(2);
  });

  test("keeps chat history collapse available across workspace pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/members");

    const membersSidebar = page.getByRole("complementary").first();
    await expect(membersSidebar).toBeVisible({ timeout: 15_000 });
    await activate(
      membersSidebar.getByRole("button", {
        name: "Collapse chat sidebar",
        exact: true,
      }),
    );

    await expect(membersSidebar).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open conversations", exact: true }),
    ).toBeVisible();

    await page.goto("/en/chat");
    await expect(page.getByRole("complementary")).toBeHidden();
    await activate(
      page.getByRole("button", { name: "Open conversations", exact: true }),
    );
    await expect(page.getByRole("complementary").first()).toBeVisible();

    await page.goto("/en/agents");
    await expect(
      page.getByRole("complementary").first().getByRole("button", {
        name: "Collapse chat sidebar",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("enabled tools menu opens and links to assistant customization", async ({
    page,
  }) => {
    await page.goto("/en/chat");

    const toolsTrigger = page
      .getByRole("button", { name: /chat capabilities/i })
      .first();
    await expect(toolsTrigger).toBeVisible({ timeout: 15_000 });
    await openDropdown(toolsTrigger);

    await expect(
      page.getByRole("heading", { name: "Chat capabilities" }),
    ).toBeVisible();
    const capabilitiesMenu = page.getByRole("menu", {
      name: /Chat capabilities/i,
    });
    await expect(
      capabilitiesMenu.getByRole("listitem", { name: /^Tools/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      capabilitiesMenu.getByRole("listitem", { name: /^Skills/ }),
    ).toBeVisible();
    await expect(
      capabilitiesMenu.getByRole("listitem", { name: /^MCP/ }),
    ).toBeVisible();
    const customizeLink = page.getByRole("menuitem", {
      name: "Customize",
    });
    await expect(customizeLink).toHaveAttribute(
      "href",
      /\/en\/agents\/[0-9a-f-]+$/,
    );
  });

  test("agent selector is present when agents exist", async ({ page }) => {
    const { agentId } = await ensureE2EAssistant();
    await page.goto(`/en/chat?agentId=${agentId}`);

    // Agent selector should be present in the chat sidebar
    const agentSelector = page
      .getByRole("button", { name: /Current assistant/i })
      .first();
    await expect(agentSelector).toBeVisible();
    await expect(agentSelector).toContainText("E2E model");
  });

  test("keeps every queued attachment visible in a responsive grid", async ({
    page,
  }) => {
    await ensureE2EAssistant();
    let uploadIndex = 0;
    await page.route(
      "**/api/workspace/chat-attachments/upload?*",
      async (route) => {
        if (
          new URL(route.request().url()).searchParams.get("phase") === "chunk"
        ) {
          await route.fulfill({ status: 202, json: { accepted: true } });
          return;
        }
        uploadIndex += 1;
        const fileNumber = String(uploadIndex).padStart(2, "0");
        await route.fulfill({
          json: {
            attachment: {
              kind: "chat_file",
              id: `20000000-0000-4000-8000-${String(uploadIndex).padStart(12, "0")}`,
              fileName: `Reference document ${fileNumber}.txt`,
              mimeType: "text/plain",
              size: 128,
              hash: `hash-${fileNumber}`,
              url: `/api/workspace/chat-attachments/mock-${fileNumber}`,
              category: "text",
              extractionStatus: "readable",
              extractedTextChars: 128,
            },
          },
        });
      },
    );

    await page.goto("/en/chat");
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEnabled({ timeout: 15_000 });
    const messageInput = page.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await fillControlled(
      messageInput,
      "Keep this unsent draft with every attachment.",
    );
    const fileInput = page.locator('[data-slot="chat-composer-file-input"]');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles(
      Array.from({ length: 12 }, (_, index) => ({
        name: `Reference document ${String(index + 1).padStart(2, "0")}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`Reference ${index + 1}`),
      })),
    );

    await expect(
      page.getByText("12 attached files", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const attachmentTray = page.locator('[data-slot="attachment-group"]');
    await expect(
      attachmentTray.locator('[data-slot="attachment"]'),
    ).toHaveCount(12);
    await expect(
      page.getByRole("button", {
        name: "Remove Reference document 12.txt",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await attachmentTray.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);

    await page.reload();
    await expect(messageInput).toHaveValue(
      "Keep this unsent draft with every attachment.",
      { timeout: 15_000 },
    );
    await expect(
      page.getByText("8 attached files", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="attachment-group"] [data-slot="attachment"]'),
    ).toHaveCount(8);
  });

  test("navigate between chat and other pages", async ({ page }) => {
    await page.goto("/en/chat");
    await expect(page).toHaveURL(/\/en\/chat/);

    // Navigate to agents from the shared Orbit product navigation.
    await activate(page.getByRole("link", { name: "Assistants", exact: true }));
    await expect(page).toHaveURL(/\/en\/agents/);

    // Navigate back to chat
    await activate(page.getByRole("link", { name: "Chat", exact: true }));
    await expect(page).toHaveURL(/\/en\/chat/);
  });
});
