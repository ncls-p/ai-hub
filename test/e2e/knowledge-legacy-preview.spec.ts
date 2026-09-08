import { encryptValue } from "@/lib/crypto";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  databaseUrl,
  ensureE2EUser,
  ensureE2EAssistant,
  login,
} from "./fixtures";

test.beforeAll(ensureE2EUser);
test("legacy PDF records explicitly identify extracted text and do not offer a nonexistent original", async ({
  page,
}) => {
  await login(page);
  const { workspaceId } = await ensureE2EAssistant();
  expect(
    (
      await page.request.patch("/api/workspaces", { data: { workspaceId } })
    ).ok(),
  ).toBeTruthy();
  const name = `Legacy documents ${randomUUID().slice(0, 8)}`;
  const response = await page.request.post("/api/workspace/knowledge-bases", {
    data: { workspaceId, name },
  });
  expect(response.status()).toBe(201);
  const base = await response.json();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const documentId = randomUUID();
    // A pre-retention upload has extracted chunks, but no object-storage key.
    await client.query(
      `insert into documents (id,workspace_id,knowledge_base_id,title,source_type,mime_type,status,processing_progress,processing_stage,created_by_user_id) select $1,$2,$3,'legacy.pdf','upload','application/pdf','ready',100,'completed',id from "user" where email='e2e-admin@example.test'`,
      [documentId, workspaceId, base.id],
    );
    await client.query(
      `insert into document_chunks (document_id,chunk_index,content_encrypted) values ($1,0,$2)`,
      [documentId, await encryptValue("The extracted legacy document text.")],
    );
    await page.goto("/en/knowledge");
    await page.getByRole("button").filter({ hasText: name }).click();
    await page.getByRole("button", { name: "legacy.pdf", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "legacy.pdf",
      exact: true,
    });
    await expect(
      dialog.getByText(/The original file was not retained/),
    ).toBeVisible();
    await expect(
      dialog.getByText("The extracted legacy document text.", { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator("iframe")).toHaveCount(0);
    await expect(
      dialog.getByRole("link", { name: "Download original" }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/api/workspace/knowledge-bases/${base.id}/documents/${documentId}/raw?workspaceId=${workspaceId}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await page.request.delete(
      `/api/workspace/knowledge-bases/${base.id}?workspaceId=${workspaceId}`,
    );
    await client.end();
  }
});
