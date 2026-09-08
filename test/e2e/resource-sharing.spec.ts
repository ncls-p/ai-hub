import { encryptValue } from "@/lib/crypto";
import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  databaseUrl,
  e2eMember,
  ensureE2EAssistant,
  ensureE2EMember,
  ensureE2EUser,
  login,
  loginWithCredentials,
} from "./fixtures";

nextEnv.loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
  await ensureE2EMember();
  await ensureE2EAssistant();
});

test("shared chat recipients can read real uploaded code, extracted text, images and ZIP files; revocation removes access", async ({
  page,
  browser,
  baseURL,
}) => {
  const { agentId, workspaceId } = await ensureE2EAssistant();
  const code = "export const sharedAnswer = 42;\n";
  const upload = await page.request.post(
    "/api/workspace/chat-attachments/upload",
    {
      multipart: {
        workspaceId,
        file: {
          name: "shared.ts",
          mimeType: "text/plain",
          buffer: Buffer.from(code),
        },
      },
    },
  );
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const { attachment } = await upload.json();
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=",
    "base64",
  );
  const imageUpload = await page.request.post(
    "/api/workspace/chat-attachments/upload",
    {
      multipart: {
        workspaceId,
        file: { name: "shared.png", mimeType: "image/png", buffer: imageBytes },
      },
    },
  );
  expect(imageUpload.ok(), await imageUpload.text()).toBeTruthy();
  const image = (await imageUpload.json()).attachment;
  const zip = new JSZip()
    .file("index.html", "<!doctype html><h1>Shared site</h1>")
    .file("source.ts", code);
  const projectUpload = await page.request.post(
    "/api/workspace/code-projects/upload",
    {
      multipart: {
        workspaceId,
        file: {
          name: "shared-site.zip",
          mimeType: "application/zip",
          buffer: await zip.generateAsync({ type: "nodebuffer" }),
        },
      },
    },
  );
  expect(projectUpload.ok(), await projectUpload.text()).toBeTruthy();
  const { artifact } = await projectUpload.json();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const recipient = await browser.newContext({ baseURL });
  const recipientPage = await recipient.newPage();
  try {
    await client.query(
      `insert into conversations (id, workspace_id, agent_id, agent_version_id, user_id, title)
      select $1, $2, a.id, a.active_version_id, u.id, 'Shared file regression'
      from agents a, "user" u where a.id = $3 and u.email = 'e2e-admin@example.test'`,
      [conversationId, workspaceId, agentId],
    );
    await client.query(
      "insert into messages (id, conversation_id, role, status) values ($1, $2, 'user', 'completed')",
      [messageId, conversationId],
    );
    await client.query(
      "insert into message_parts (message_id, type, content_encrypted, sort_order) values ($1, 'text', $2, 0)",
      [messageId, await encryptValue("Please review these shared files")],
    );
    for (const [index, item] of [attachment, image, artifact].entries())
      await client.query(
        "insert into message_parts (message_id, type, metadata_json, sort_order) values ($1, 'file', $2, $3)",
        [messageId, JSON.stringify(item), index + 1],
      );
    await loginWithCredentials(recipientPage, e2eMember);
    expect((await recipient.request.get(attachment.url)).status()).toBe(404);
    const share = await page.request.post(
      `/api/workspace/conversations/${conversationId}/share`,
      {
        data: {
          targetEmail: e2eMember.email,
          canContinue: false,
        },
      },
    );
    expect(share.status(), await share.text()).toBe(201);
    const downloaded = await recipient.request.get(attachment.url);
    expect(downloaded.status()).toBe(200);
    expect(await downloaded.text()).toBe(code);
    expect(downloaded.headers()["cache-control"]).toBe("no-store");
    const extracted = await recipient.request.get(
      `${attachment.url}/extracted`,
    );
    expect(extracted.status()).toBe(200);
    expect((await extracted.json()).text).toContain(code.trim());
    expect(await (await recipient.request.get(image.url)).body()).toEqual(
      imageBytes,
    );
    const fileUrl = `/api/workspace/code-projects/${artifact.projectId}/files`;
    const read = await recipient.request.get(`${fileUrl}?path=source.ts`);
    expect(read.status()).toBe(200);
    expect(await read.json()).toMatchObject({ content: code, canEdit: false });
    const downloadedZip = await recipient.request.get(artifact.downloadUrl);
    expect(downloadedZip.status()).toBe(200);
    expect(
      await (await JSZip.loadAsync(await downloadedZip.body()))
        .file("source.ts")!
        .async("string"),
    ).toBe(code);
    expect((await recipient.request.get(artifact.previewUrl)).status()).toBe(
      200,
    );
    expect(
      (
        await recipient.request.put(fileUrl, {
          data: { path: "source.ts", content: "changed" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await recipient.request.delete(fileUrl, { data: { path: "source.ts" } })
      ).status(),
    ).toBe(404);
    await recipientPage.goto(
      `/en/chat?agentId=${agentId}&conversationId=${conversationId}`,
    );
    await expect(
      recipientPage.getByText("Please review these shared files", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      recipientPage.getByRole("img", { name: "shared.png" }),
    ).toBeVisible();
    await expect(
      recipientPage.getByRole("button", { name: "Send message", exact: true }),
    ).toBeDisabled();
    const anonymous = await browser.newContext({ baseURL });
    try {
      const enabled = await page.request.patch(
        `/api/workspace/conversations/${conversationId}/share`,
        { data: { public: true } },
      );
      expect(enabled.status()).toBe(200);
      const { publicShareId } = await enabled.json();
      const publicEndpoint = `/api/public/conversations/${publicShareId}`;
      const publicFileUrl = `${publicEndpoint}/files/${attachment.id}?kind=attachment`;
      const textOnly = await anonymous.request.get(publicEndpoint);
      expect(textOnly.headers()["cache-control"]).toBe("no-store");
      expect(JSON.stringify(await textOnly.json())).not.toContain(
        attachment.id,
      );
      expect((await anonymous.request.get(publicFileUrl)).status()).toBe(404);
      await page.goto(
        `/en/chat?agentId=${agentId}&conversationId=${conversationId}`,
      );
      await page
        .getByRole("button", { name: "Share conversation", exact: true })
        .click();
      await expect(
        page.getByRole("switch", {
          name: "Include downloadable files",
          exact: true,
        }),
      ).not.toBeChecked();
      await page
        .getByRole("switch", {
          name: "Include downloadable files",
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await anonymous.request.get(publicFileUrl)).status())
        .toBe(200);
      const publicData = await (
        await anonymous.request.get(publicEndpoint)
      ).json();
      const files = publicData.messages
        .flatMap((message: { parts: Array<{ type: string }> }) => message.parts)
        .filter((part: { type: string }) => part.type === "file");
      expect(files).toHaveLength(3);
      expect(JSON.stringify(publicData)).not.toMatch(
        /previewToken|objectKey|createdByUserId/,
      );
      expect(await (await anonymous.request.get(publicFileUrl)).text()).toBe(
        code,
      );
      expect(
        (
          await anonymous.request.get(
            `${publicEndpoint}/files/${randomUUID()}?kind=attachment`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await anonymous.request.get(
            `${publicEndpoint}/files/${artifact.projectId}?kind=code_workspace`,
          )
        ).status(),
      ).toBe(200);
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`/en/share/${publicShareId}`);
      await expect(
        publicPage.getByRole("link", {
          name: "Download shared.ts",
          exact: true,
        }),
      ).toBeVisible();
      await client.query(
        "update conversations set expires_at = now() - interval '1 minute' where id = $1",
        [conversationId],
      );
      expect((await anonymous.request.get(publicEndpoint)).status()).toBe(404);
      expect((await anonymous.request.get(publicFileUrl)).status()).toBe(404);
      await client.query(
        "update conversations set expires_at = null where id = $1",
        [conversationId],
      );
      await page.request.patch(
        `/api/workspace/conversations/${conversationId}/share`,
        { data: { public: true, includeFiles: false } },
      );
      expect((await anonymous.request.get(publicFileUrl)).status()).toBe(404);
      await page.request.patch(
        `/api/workspace/conversations/${conversationId}/share`,
        { data: { public: false } },
      );
      expect((await anonymous.request.get(publicEndpoint)).status()).toBe(404);
    } finally {
      await anonymous.close();
    }
    const [{ id: recipientId }] = (
      await client.query('select id from "user" where email = $1', [
        e2eMember.email,
      ])
    ).rows;
    expect(
      (
        await page.request.delete(
          `/api/workspace/conversations/${conversationId}/share?userId=${recipientId}`,
        )
      ).ok(),
    ).toBeTruthy();
    for (const url of [
      attachment.url,
      `${attachment.url}/extracted`,
      image.url,
      fileUrl,
      artifact.downloadUrl,
      artifact.previewUrl,
    ])
      expect((await recipient.request.get(url)).status(), url).toBe(404);
    expect((await page.request.get(attachment.url)).status()).toBe(200);
    expect((await page.request.get(`${fileUrl}?path=source.ts`)).status()).toBe(
      200,
    );
  } finally {
    await recipient.close();
    await client.query("delete from conversations where id = $1", [
      conversationId,
    ]);
    await client.end();
  }
});
