import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ensureE2EUser, login } from "./fixtures";
import { createPackageEntrypointsFixture } from "./resource-package-entrypoints.fixture";
nextEnv.loadEnvConfig(process.cwd());
let fixture: Awaited<ReturnType<typeof createPackageEntrypointsFixture>>;
test.beforeAll(async () => {
  await ensureE2EUser();
});
test.afterEach(async () => {
  await fixture?.cleanup();
});
test.beforeEach(async ({ page }) => {
  await login(page);
  fixture = await createPackageEntrypointsFixture();
  expect(
    (
      await page.request.patch("/api/workspaces", {
        data: { workspaceId: fixture.workspaceId },
      })
    ).ok(),
  ).toBeTruthy();
});

for (const kind of [
  "assistant",
  "orchestrator",
  "skill",
  "server",
  "tool",
  "workflow",
] as const) {
  test(`users can download and reimport a ${kind} with its real dependencies through the interface`, async ({
    page,
  }) => {
    const name = `${fixture.prefix} ${kind === "server" || kind === "tool" ? "MCP" : kind}`;
    const path =
      kind === "assistant" || kind === "orchestrator"
        ? "/en/agents"
        : kind === "workflow"
          ? "/en/workflows"
          : `/en/tools?tab=${kind === "skill" ? "skills" : "mcp"}`;
    if (kind === "orchestrator")
      await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (kind === "assistant" || kind === "orchestrator") {
      await page
        .getByRole("button", { name: `More actions for ${name}`, exact: true })
        .click();
    } else if (kind === "skill") {
      await page.getByPlaceholder("Search skills…").fill(name);
      await page
        .getByRole("button", { name: `${name} actions`, exact: true })
        .click();
    } else if (kind === "server" || kind === "tool") {
      await page.getByPlaceholder("Search servers…").fill(name);
      if (kind === "server")
        await page
          .getByRole("button", { name: "Server actions", exact: true })
          .click();
      else {
        await page.getByText(name, { exact: true }).click();
        await page
          .getByRole("button", { name: "Share find_document", exact: true })
          .click();
      }
    }
    const downloading = page.waitForEvent("download");
    if (kind === "workflow")
      await page
        .locator('[data-slot="card"]')
        .filter({ hasText: name })
        .getByRole("button", { name: "Export JSON", exact: true })
        .click();
    else if (kind === "tool")
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Export JSON", exact: false })
        .click();
    else
      await page
        .getByRole("menuitem", { name: "Export JSON", exact: true })
        .click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.maiah\.json$/);
    const bytes = await readFile((await download.path())!);
    const value = JSON.parse(bytes.toString());
    expect(value).toMatchObject({ format: "maiah.resource", schemaVersion: 1 });
    expect(bytes.toString()).not.toContain("source-secret");
    expect(bytes.toString()).not.toContain(fixture.workspaceId);
    await page.goto(path);
    await page
      .getByRole("button", { name: "Import JSON", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Import JSON" });
    await dialog.getByLabel("JSON resource package").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: bytes,
    });
    await dialog
      .getByRole("button", { name: "Review package", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Import resources", exact: true }),
    ).toBeEnabled();
    if (kind === "orchestrator" || kind === "workflow") {
      await expect(
        dialog
          .getByRole("listitem")
          .filter({ hasText: `${fixture.prefix} assistant` }),
      ).toBeVisible();
      await expect(
        dialog
          .getByRole("listitem")
          .filter({ hasText: `${fixture.prefix} skill` }),
      ).toBeVisible();
    }
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    const importing = page.waitForResponse(
      (response) =>
        response.url().includes("resource-packages") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    );
    const discovery: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /mcp-servers\/[^/]+\/tools/.test(request.url())
      )
        discovery.push(request.url());
    });
    await dialog
      .getByRole("button", { name: "Import resources", exact: true })
      .click();
    const result = await (await importing).json();
    if (kind === "tool") fixture.standaloneServerIds.push(result.resource.id);
    await expect(dialog).not.toBeVisible();
    const table =
      kind === "workflow"
        ? "workflows"
        : kind === "skill"
          ? "agent_skills"
          : kind === "server" || kind === "tool"
            ? "mcp_servers"
            : "agents";
    const rows = await fixture.client.query(
      `select * from ${table} where id=$1`,
      [result.resource.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(result.resource.id).not.toBe(fixture[kind]);
    if (table === "agents")
      expect(rows.rows[0]).toMatchObject({ kind, visibility: "private" });
    if (table === "workflows") {
      expect(rows.rows[0]).toMatchObject({
        status: "draft",
        active_version: null,
      });
      await expect(page).toHaveURL(
        new RegExp(`/workflows/${result.resource.id}`),
      );
    }
    if (table === "mcp_servers") {
      expect(rows.rows[0]).toMatchObject({
        enabled: false,
        encrypted_headers_json: null,
        encrypted_env_json: null,
      });
      await expect(
        page
          .getByRole("button", { name: "Server actions", exact: true })
          .first(),
      ).toBeVisible();
      expect(discovery).toEqual([]);
      expect(
        (
          await fixture.client.query(
            `select name from mcp_tools where mcp_server_id=$1`,
            [result.resource.id],
          )
        ).rows,
      ).toEqual([{ name: "find_document" }]);
    }
  });
}
