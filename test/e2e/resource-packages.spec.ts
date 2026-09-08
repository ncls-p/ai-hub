import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import {
  databaseUrl,
  e2eMember,
  e2eUser,
  loginWithCredentials,
  ensureE2EAssistant,
  ensureE2EMember,
  ensureE2EUser,
  login,
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

test("JSON import validates the real file, previews dependencies, creates copies and supports narrow screens", async ({
  page,
}) => {
  await page.context().clearCookies();
  await loginWithCredentials(page, e2eMember);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  const name = `Imported skill ${randomUUID().slice(0, 8)}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/marketplace");
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import JSON" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("JSON resource package").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid"),
  });
  await page
    .getByRole("button", { name: "Review package", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Invalid JSON");
  const value = {
    format: "maiah.resource",
    schemaVersion: 1,
    manifest: {
      type: "skill",
      name,
      skill: {
        markdownFiles: [
          {
            path: "SKILL.md",
            content: "# Imported review\nVerify real behavior.",
          },
        ],
      },
    },
  };
  await page.getByLabel("JSON resource package").setInputFiles({
    name: "resource.maiah.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await page
    .getByRole("button", { name: "Review package", exact: true })
    .click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Import resources", exact: true }),
  ).toBeEnabled();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  const imported = page.waitForResponse(
    (response) =>
      response.url().includes("resource-packages") && response.status() === 201,
  );
  await page
    .getByRole("button", { name: "Import resources", exact: true })
    .click();
  const data = await (await imported).json();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const result = await client.query(
      "select name, markdown_files_json from agent_skills where id = $1",
      [data.resource.id],
    );
    expect(result.rows).toEqual([
      { name, markdown_files_json: value.manifest.skill.markdownFiles },
    ]);
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", { name: `${name} actions`, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Share", exact: true }).click();
    const shareDialog = page.getByRole("dialog");
    await expect(shareDialog).toBeVisible();
    const downloading = page.waitForEvent("download");
    await shareDialog
      .getByRole("button", { name: "Export JSON", exact: false })
      .click();
    const downloaded = await downloading;
    expect(downloaded.suggestedFilename()).toMatch(/\.maiah\.json$/);
    const exported = JSON.parse(
      await readFile((await downloaded.path())!, "utf8"),
    );
    expect(exported).toMatchObject(value);
    expect(exported.manifest.skill.markdownFiles).toEqual(
      value.manifest.skill.markdownFiles,
    );
    await shareDialog
      .getByRole("button", { name: "User", exact: false })
      .click();
    await shareDialog
      .getByLabel("Recipient email")
      .fill(e2eUser.email.toUpperCase());
    const shared = page.waitForResponse(
      (response) =>
        response.url().endsWith("/share") &&
        response.request().method() === "POST",
    );
    await shareDialog
      .getByRole("button", { name: "Share", exact: true })
      .click();
    const sharedResponse = await shared;
    expect(sharedResponse.status()).toBe(200);
    const share = await sharedResponse.json();
    expect(
      (
        await page.request.post(sharedResponse.url(), {
          data: { targetEmail: e2eUser.email },
        })
      ).status(),
    ).toBe(200);
    const persisted = await client.query(
      "select id from marketplace_item_shares where item_id = $1",
      [share.itemId],
    );
    expect(persisted.rows).toHaveLength(1);
    await page.context().clearCookies();
    await login(page);
    expect(
      (
        await page.request.get(`/api/marketplace/items/${share.itemId}`)
      ).status(),
    ).toBe(200);
  } finally {
    await client.query(
      "delete from marketplace_items where source_resource_id = $1",
      [data.resource.id],
    );
    await client.query("delete from agent_skills where id = $1", [
      data.resource.id,
    ]);
    await client.end();
  }
});
