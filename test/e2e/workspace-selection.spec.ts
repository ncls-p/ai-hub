import { expect, test } from "@playwright/test";
import {
  e2eUser,
  ensureE2ETransferScenario,
  ensureE2EUser,
  login,
  loginWithCredentials,
} from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("persists the selected project for a fresh browser session", async ({
  browser,
  page,
}) => {
  await ensureE2ETransferScenario();
  const workspaceResponse = await page.request.get("/api/workspaces");
  const workspaces = (await workspaceResponse.json()) as Array<{
    workspace: { id: string; name: string };
  }>;
  const primaryWorkspace = workspaces.find(
    ({ workspace }) => workspace.name !== "Transfer destination",
  );
  if (!primaryWorkspace) throw new Error("Primary E2E project is missing");
  const resetResponse = await page.request.patch("/api/workspaces", {
    data: { workspaceId: primaryWorkspace.workspace.id },
  });
  expect(resetResponse.ok()).toBe(true);

  await page.goto("/en/providers");
  await page.getByRole("button", { name: e2eUser.name, exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Transfer destination", exact: true })
    .click();

  await expect
    .poll(async () => {
      const response = await page.request.get("/api/workspaces");
      const rows = (await response.json()) as Array<{
        isActive: boolean;
        workspace: { name: string };
      }>;
      return rows.find(({ isActive }) => isActive)?.workspace.name;
    })
    .toBe("Transfer destination");

  const privateContext = await browser.newContext();
  try {
    const privatePage = await privateContext.newPage();
    await privatePage.goto("/en/auth/signin");
    expect(
      await privatePage.evaluate(() =>
        localStorage.getItem("active-workspace-id"),
      ),
    ).toBeNull();
    await loginWithCredentials(privatePage, e2eUser);

    await privatePage.goto("/en/providers");
    await expect(
      privatePage
        .locator('header[data-slot="app-header"]')
        .getByText("Transfer destination", { exact: true }),
    ).toBeVisible();
  } finally {
    await privateContext.close();
    const restored = await page.request.patch("/api/workspaces", {
      data: { workspaceId: primaryWorkspace.workspace.id },
    });
    expect(restored.status()).toBe(204);
  }
});
