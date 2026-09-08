import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  databaseUrl,
  ensureE2EUser,
  ensureE2EAssistant,
  ensureE2EMember,
  e2eMember,
  login,
  loginWithCredentials,
} from "./fixtures";

function pdfDocument(text: string) {
  const stream = `BT /F1 18 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test.beforeAll(ensureE2EUser);
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("RAG originals survive real uploads; owners can preview, rename and delete, recipients are read-only", async ({
  page,
  browser,
  baseURL,
}) => {
  await ensureE2EMember();
  const { workspaceId } = await ensureE2EAssistant();
  const name = `Documents ${randomUUID().slice(0, 8)}`;
  await page.goto("/en/knowledge");
  await page
    .getByRole("button", { name: /^(New collection|Create a collection)$/ })
    .first()
    .click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(name);
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/knowledge-bases") && response.status() === 201,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  const base = await (await created).json();
  const baseId = base.id;
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const recipient = await browser.newContext({ baseURL });
  try {
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const original = pdfDocument(
      "Original candidate document - exact bytes preserved",
    );
    const text = "  Original spacing\r\n\r\nUnmodified plain text.  ";
    await page.locator("#knowledge-file-upload").setInputFiles([
      { name: "profile.pdf", mimeType: "application/pdf", buffer: original },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(text) },
    ]);
    await expect(
      page.getByRole("button", { name: "profile.pdf", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: "notes.txt", exact: true }),
    ).toBeVisible();
    const docs = (
      await client.query(
        "select id, title, status, object_storage_key from documents where knowledge_base_id=$1",
        [baseId],
      )
    ).rows;
    expect(docs).toHaveLength(2);
    const pdf = docs.find((doc) => doc.title === "profile.pdf")!;
    const rawUrl = `/api/workspace/knowledge-bases/${baseId}/documents/${pdf.id}/raw?workspaceId=${workspaceId}`;
    const raw = await page.request.get(rawUrl);
    expect(raw.status()).toBe(200);
    expect(await raw.body()).toEqual(original);
    expect(raw.headers()["cache-control"]).toBe("no-store");
    await page
      .getByRole("button", { name: "profile.pdf", exact: true })
      .click();
    const preview = page.getByRole("dialog", {
      name: "profile.pdf",
      exact: true,
    });
    await expect(
      preview.locator('iframe[title="profile.pdf"]'),
    ).toHaveAttribute("src", /^blob:/);
    await expect(
      preview.getByRole("link", { name: "Download original" }),
    ).toBeVisible();
    await preview.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Rename profile.pdf", exact: true })
      .click();
    const rename = page.getByRole("dialog", { name: "Rename document" });
    await rename.getByLabel("Document title").fill("Candidate profile.pdf");
    await rename.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Candidate profile.pdf", exact: true }),
    ).toBeVisible();
    expect(await (await page.request.get(rawUrl)).body()).toEqual(original);
    const recipientPage = await recipient.newPage();
    await loginWithCredentials(recipientPage, e2eMember);
    expect(
      (await recipient.request.get(rawUrl)).status(),
    ).toBeGreaterThanOrEqual(400);
    // Use the product's direct read-only grant, then verify both the bytes and mutation boundary.
    const [{ id: memberId }] = (
      await client.query('select id from "user" where email=$1', [
        e2eMember.email,
      ])
    ).rows;
    const grant = await page.request.post(
      "/api/workspace/iam/resource-sharing",
      {
        data: {
          workspaceId,
          resourceType: "knowledge_base",
          resourceId: baseId,
          shares: [{ userId: memberId, access: "view" }],
        },
      },
    );
    expect(grant.ok(), await grant.text()).toBeTruthy();
    expect(await (await recipient.request.get(rawUrl)).body()).toEqual(
      original,
    );
    const docUrl = `/api/workspace/knowledge-bases/${baseId}/documents/${pdf.id}?workspaceId=${workspaceId}`;
    expect(
      (
        await recipient.request.patch(docUrl, {
          data: { action: "rename", title: "Denied" },
        })
      ).status(),
    ).toBe(404);
    expect((await recipient.request.delete(docUrl)).status()).toBe(404);
    await page.getByRole("button", { name: "notes.txt", exact: true }).click();
    const originalText = page
      .getByRole("dialog", { name: "notes.txt", exact: true })
      .locator("pre");
    await expect(originalText).toBeVisible();
    expect(await originalText.textContent()).toBe(text);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", {
        name: "Delete Candidate profile.pdf",
        exact: true,
      })
      .click();
    const confirm = page.getByRole("alertdialog");
    const deleted = page.waitForResponse(
      (response) =>
        response.url().includes(`/documents/${pdf.id}`) &&
        response.request().method() === "DELETE",
    );
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    expect((await deleted).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Candidate profile.pdf", exact: true }),
    ).not.toBeVisible();
    expect((await page.request.get(rawUrl)).status()).toBe(404);
    expect((await recipient.request.get(rawUrl)).status()).toBe(404);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await recipient.close();
    await page.request.delete(
      `/api/workspace/knowledge-bases/${baseId}?workspaceId=${workspaceId}`,
    );
    await client.end();
  }
});

test("long pasted text remains editable as an attachment and can return to the message without losing text", async ({
  page,
}) => {
  const { agentId } = await ensureE2EAssistant();
  await page.goto(`/en/chat?agentId=${agentId}`);
  const input = page.locator('textarea[name="message"]');
  await expect(input).toBeEnabled();
  await input.fill("My existing introduction");
  const original = "A line of pasted text with preserved spacing.\n".repeat(40);
  await page.route("**/chat-attachments/upload?phase=complete", (route) =>
    route.abort("failed"),
  );
  await input.evaluate((node, content) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", content);
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, original);
  await expect(input).toHaveValue(`My existing introduction\n\n${original}`);
  await expect(
    page.getByRole("button", { name: "Edit pasted text", exact: true }),
  ).not.toBeVisible();
  await page.unroute("**/chat-attachments/upload?phase=complete");
  await input.fill("My existing introduction");
  await input.evaluate((node, content) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", content);
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, original);
  const edit = page.getByRole("button", {
    name: "Edit pasted text",
    exact: true,
  });
  await expect(edit).toBeEnabled({ timeout: 30_000 });
  await expect(input).toHaveValue("My existing introduction");
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit pasted text" });
  const editor = dialog.getByLabel("Pasted text", { exact: true });
  await expect(editor).toHaveValue(original);
  const modified = `${original}\nMy correction.`;
  await editor.fill(modified);
  await page.route("**/chat-attachments/upload?phase=complete", (route) =>
    route.abort("failed"),
  );
  const failed = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("chat-attachments/upload?phase=complete"),
  );
  await dialog
    .getByRole("button", { name: "Save attachment", exact: true })
    .click();
  await failed;
  await expect(
    dialog.getByRole("button", { name: "Save attachment", exact: true }),
  ).toBeEnabled();
  await expect(editor).toHaveValue(modified);
  await expect(dialog).toBeVisible();
  await page.unroute("**/chat-attachments/upload?phase=complete");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("chat-attachments/upload?phase=complete") &&
      response.status() === 200,
  );
  await dialog
    .getByRole("button", { name: "Save attachment", exact: true })
    .click();
  const { attachment } = await (await saved).json();
  expect(await (await page.request.get(attachment.url)).text()).toBe(modified);
  await expect(dialog).not.toBeVisible();
  await expect(edit).toHaveCount(1);
  await page.reload(); // The editing affordance must also work for restored drafts.
  await page
    .getByRole("button", { name: "Move text to message", exact: true })
    .click();
  await expect(input).toHaveValue(`My existing introduction\n\n${modified}`);
  await expect(edit).not.toBeVisible();
  await input.fill("");
});
