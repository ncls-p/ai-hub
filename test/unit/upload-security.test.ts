import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { textPdfBytes } from "../fixtures/pdf";

const objectStore = new Map<string, Uint8Array>();

// These storage fixtures have no shared conversations. Real sharing grants and
// revocation are covered against PostgreSQL in resource-access-db.test.ts.
vi.mock("@/modules/chat/conversation-asset-access", () => ({
  canReadSharedConversationAsset: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/server/infrastructure/storage", () => ({
  storage: {
    upload: vi.fn(async (key: string, body: Buffer | Uint8Array | string) => {
      const bytes =
        typeof body === "string"
          ? new TextEncoder().encode(body)
          : new Uint8Array(body);
      objectStore.set(key, bytes);
      return key;
    }),
    download: vi.fn(async (key: string) => {
      const bytes = objectStore.get(key);
      if (!bytes) throw new Error("No such key");
      return bytes;
    }),
    delete: vi.fn(async (key: string) => {
      objectStore.delete(key);
    }),
  },
}));

async function zipBytes(files: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(files)) {
    zip.file(filePath, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

beforeEach(() => {
  objectStore.clear();
});

describe("upload security", () => {
  it("rejects unsafe workspace paths", async () => {
    const { normalizeWorkspacePath } =
      await import("@/modules/code-workspace/storage");

    expect(() => normalizeWorkspacePath("../index.html")).toThrow(
      /Path traversal/,
    );
    expect(() => normalizeWorkspacePath("/index.html")).toThrow(/Absolute/);
    expect(() => normalizeWorkspacePath("C:/index.html")).toThrow(/Absolute/);
    expect(normalizeWorkspacePath("./src/../index.html")).toBe("index.html");
  });

  it("rejects ZIP entries that JSZip sanitized from unsafe names", async () => {
    const { createCodeWorkspaceFromZip } =
      await import("@/modules/code-workspace/storage");

    await expect(
      createCodeWorkspaceFromZip({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        fileName: "evil.zip",
        buffer: await zipBytes({ "../index.html": "<h1>oops</h1>" }),
      }),
    ).rejects.toThrow(/Unsafe ZIP path/);
  });

  it("creates a workspace from direct HTML/CSS/JS files", async () => {
    const { createCodeWorkspaceFromFiles, readCodeWorkspaceFile } =
      await import("@/modules/code-workspace/storage");

    const artifact = await createCodeWorkspaceFromFiles({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      title: "Direct upload",
      files: [
        { path: "index.html", content: "<h1>Hello</h1>" },
        { path: "style.css", content: "h1 { color: red; }" },
        { path: "script.js", content: "console.log('hello');" },
      ],
    });

    expect(artifact.rootFile).toBe("index.html");
    expect(artifact.files.map((file) => file.path)).toEqual([
      "index.html",
      "script.js",
      "style.css",
    ]);
    await expect(
      readCodeWorkspaceFile({
        projectId: artifact.projectId,
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        filePath: "script.js",
      }),
    ).resolves.toMatchObject({ content: "console.log('hello');" });
  });

  it("restricts unshared code workspace files to the creating user", async () => {
    const { createCodeWorkspaceFromZip, readCodeWorkspaceFile } =
      await import("@/modules/code-workspace/storage");

    const metadata = await createCodeWorkspaceFromZip({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      fileName: "site.zip",
      buffer: await zipBytes({ "index.html": "<h1>Hello</h1>" }),
    });

    await expect(
      readCodeWorkspaceFile({
        projectId: metadata.id,
        workspaceId: metadata.workspaceId,
        userId: "user-2",
        filePath: "index.html",
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      readCodeWorkspaceFile({
        projectId: metadata.id,
        workspaceId: metadata.workspaceId,
        userId: "user-1",
        filePath: "index.html",
      }),
    ).resolves.toMatchObject({ content: "<h1>Hello</h1>" });
  });

  it("rejects chat image uploads whose bytes do not match an allowed image type", async () => {
    const { createChatImageAttachment } =
      await import("@/modules/chat/attachments");

    await expect(
      createChatImageAttachment({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        fileName: "not-really.png",
        bytes: new TextEncoder().encode("<script>alert(1)</script>"),
      }),
    ).rejects.toThrow(/Unsupported image type/);
  });

  it("classifies generic chat uploads with image bytes as vision images", async () => {
    const { createChatAttachment } = await import("@/modules/chat/attachments");

    const attachment = await createChatAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      fileName: "screenshot.png",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]),
    });

    expect(attachment).toMatchObject({
      kind: "chat_image",
      fileName: "screenshot.png",
      mimeType: "image/png",
    });
  });

  it("extracts readable text from markdown chat attachments", async () => {
    const { createChatAttachment, getChatAttachmentExtractedText } =
      await import("@/modules/chat/attachments");

    const attachment = await createChatAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("# Notes\n\nBonjour tout le monde"),
    });

    expect(attachment).toMatchObject({
      kind: "chat_file",
      fileName: "notes.md",
      extractionStatus: "readable",
    });
    await expect(
      getChatAttachmentExtractedText({
        attachmentId: attachment.id,
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ text: expect.stringContaining("Bonjour") });
  });

  it("extracts readable text from Word and PowerPoint chat attachments", async () => {
    const { createChatAttachment, getChatAttachmentExtractedText } =
      await import("@/modules/chat/attachments");
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const userId = "user-1";

    const docx = await createChatAttachment({
      workspaceId,
      userId,
      fileName: "brief.docx",
      bytes: await zipBytes({
        "word/document.xml":
          '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Hello Word</w:t></w:r></w:p></w:body></w:document>',
      }),
    });
    const pptx = await createChatAttachment({
      workspaceId,
      userId,
      fileName: "deck.pptx",
      bytes: await zipBytes({
        "ppt/slides/slide1.xml":
          '<p:sld xmlns:a="a" xmlns:p="p"><a:t>Hello Slide</a:t></p:sld>',
      }),
    });

    await expect(
      getChatAttachmentExtractedText({
        attachmentId: docx.id,
        workspaceId,
        userId,
      }),
    ).resolves.toMatchObject({ text: expect.stringContaining("Hello Word") });
    await expect(
      getChatAttachmentExtractedText({
        attachmentId: pptx.id,
        workspaceId,
        userId,
      }),
    ).resolves.toMatchObject({ text: expect.stringContaining("Hello Slide") });
  });

  it("extracts best-effort text from PDF chat attachments", async () => {
    const { createChatAttachment, getChatAttachmentExtractedText } =
      await import("@/modules/chat/attachments");
    const attachment = await createChatAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      fileName: "simple.pdf",
      bytes: textPdfBytes("Hello PDF"),
    });

    await expect(
      getChatAttachmentExtractedText({
        attachmentId: attachment.id,
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ text: expect.stringContaining("Hello PDF") });
  });
});
