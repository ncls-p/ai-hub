import { expect, test } from "@playwright/test";
import {
  e2eMember,
  ensureE2EMember,
  ensureE2ETransferScenario,
  ensureE2EUser,
  login,
} from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("members page", () => {
  test("shows each account only once across scoped access", async ({
    page,
  }) => {
    await ensureE2EMember();
    await page.goto("/en/members");

    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(e2eMember.email);
    const matchingRows = page.locator("tbody tr").filter({
      hasText: e2eMember.email,
    });
    await expect(matchingRows).toHaveCount(1);
  });

  test("opens built-in roles with their permission matrix", async ({
    page,
  }) => {
    await page.goto("/en/members");
    await page.getByRole("tab", { name: "Roles" }).click();

    const roleRow = page.locator("tbody tr").filter({
      hasText: "Project Viewer",
    });
    await roleRow.getByRole("button", { name: "Edit", exact: true }).click();
    const roleDialog = page.getByRole("dialog", {
      name: /Edit Project Viewer/,
    });
    await expect(roleDialog.getByLabel("Role name")).toBeEnabled();
    await roleDialog
      .getByRole("textbox", { name: "Search permissions" })
      .fill("workspaces.get");
    const permission = roleDialog.getByRole("checkbox", {
      name: "View projects",
    });
    await expect(permission).toBeChecked();
    await expect(permission).toBeEnabled();
    await expect(
      roleDialog.getByRole("button", { name: "Save role" }),
    ).toBeVisible();
  });

  test("previews a customizable resource transfer in one dialog", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await page
      .getByRole("textbox", { name: "Search resources" })
      .fill("Transfer preview assistant");

    const resourceRow = page.locator("tbody tr").filter({
      hasText: "Transfer preview assistant",
    });
    await expect(resourceRow).toBeVisible({ timeout: 10_000 });
    await resourceRow
      .getByRole("button", { name: "Actions for Transfer preview assistant" })
      .click();
    await page.getByRole("menuitem", { name: "Transfer", exact: true }).click();

    const dialog = page.getByRole("dialog", {
      name: "Transfer Transfer preview assistant",
    });
    const destinationName = "Transfer destination";
    await dialog
      .getByPlaceholder("Search an organization or project…")
      .fill(destinationName);
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: new RegExp(`Deodis · ${destinationName}`) })
      .click();
    await dialog.getByRole("button", { name: "Advanced options" }).click();
    await expect(dialog.getByText("Secrets and connections")).toBeVisible();
    await dialog.getByRole("button", { name: "Review transfer" }).click();
    await expect(dialog.getByText(/resource ready/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.getByRole("button", { name: "Transfer now" }),
    ).toBeEnabled();
  });

  test("previews a complete project clone from the unified workflow", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await page.getByText("More actions", { exact: true }).click();
    await page
      .getByRole("button", { name: "Move or clone everything" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Move or clone a complete scope",
    });
    const selects = dialog.getByRole("combobox");
    await selects.nth(1).click();
    await page.getByRole("option", { name: "Clone", exact: true }).click();
    await dialog
      .getByPlaceholder("Type an organization or project name…")
      .fill("Transfer destination");
    await dialog.getByRole("button", { name: /Transfer destination/ }).click();
    await dialog.getByRole("button", { name: "Review transfer" }).click();
    await expect(
      dialog.getByRole("button", { name: "Clone everything" }),
    ).toBeEnabled({ timeout: 10_000 });
    await expect(dialog.getByText(/Scheduled tasks/).first()).toBeVisible();
  });

  test("simulates an organization transfer and resolves project URL conflicts", async ({
    page,
  }) => {
    await ensureE2ETransferScenario();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    if (!(await activeProject.textContent())?.includes("Maiah")) {
      await activeProject.click();
      await page.getByRole("option", { name: "Maiah", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await page.getByText("More actions", { exact: true }).click();
    await page
      .getByRole("button", { name: "Move or clone everything" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Move or clone a complete scope",
    });
    await dialog.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: "The complete organization" })
      .click();
    await dialog
      .getByPlaceholder("Type an organization or project name…")
      .fill("Transfer organization");
    await dialog.getByRole("button", { name: /Transfer organization/ }).click();
    await dialog.getByRole("button", { name: "Review transfer" }).click();

    await expect(
      dialog.getByText("Conflicts resolved automatically"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("main-2", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Move everything" }),
    ).toBeEnabled();
  });
});
