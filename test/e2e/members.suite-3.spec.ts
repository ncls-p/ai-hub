import { expect, test } from "@playwright/test";
import {
  e2eMember,
  ensureE2ELifecycleProject,
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
  test("renames and deletes a project from the unified manage menu", async ({
    page,
  }) => {
    await ensureE2ELifecycleProject();
    await page.goto("/en/members");
    const activeProject = page.getByRole("combobox", {
      name: "Active project",
    });
    await activeProject.click();
    await page
      .getByRole("option", { name: "Lifecycle browser project", exact: true })
      .click();

    if (
      !(await page
        .getByRole("button", { name: "Manage", exact: true })
        .isVisible())
    )
      await page
        .getByText("Project and organization settings", { exact: true })
        .click();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rename project" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename project" });
    await renameDialog
      .getByLabel("Project name")
      .fill("Lifecycle browser project renamed");
    await renameDialog.getByLabel("URL identifier").fill("e2e-lifecycle");
    await renameDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(renameDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(activeProject).toContainText(
      "Lifecycle browser project renamed",
    );

    if (
      !(await page
        .getByRole("button", { name: "Manage", exact: true })
        .isVisible())
    )
      await page
        .getByText("Project and organization settings", { exact: true })
        .click();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    const deleteDialog = page.getByRole("dialog", {
      name: "Permanently delete project",
    });
    await deleteDialog
      .getByLabel(/Type “Lifecycle browser project renamed” exactly/)
      .fill("Lifecycle browser project renamed");
    await deleteDialog
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(activeProject).not.toContainText(
      "Lifecycle browser project renamed",
    );
  });

  test("deletes any governed resource from the resource table", async ({
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

    const resourceRow = page.locator("tbody tr").filter({
      hasText: "Removable assistant",
    });
    await expect(resourceRow).toBeVisible({ timeout: 10_000 });
    await resourceRow
      .getByRole("button", { name: "Delete Removable assistant" })
      .click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(
      deleteDialog.getByText("Delete Removable assistant?"),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete resource" }).click();
    await expect(resourceRow).not.toBeVisible({ timeout: 10_000 });
  });

  test("grants project access through an organization team", async ({
    page,
  }) => {
    const teamName = `E2E Access ${Date.now()}`;
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.getByRole("button", { name: "Add person" }).click();
    const personDialog = page.getByRole("dialog", { name: "Add a person" });
    await personDialog.getByLabel("Email").fill(e2eMember.email);
    await personDialog.getByRole("button", { name: "Add person" }).click();
    await expect(personDialog).not.toBeVisible();

    await page.getByRole("tab", { name: "Teams" }).click();
    await page.getByRole("button", { name: "Create team" }).click();
    const teamDialog = page.getByRole("dialog", { name: "Create a team" });
    await teamDialog.getByLabel("Team name").fill(teamName);
    await teamDialog.getByLabel("Description").fill("Browser access flow");
    await teamDialog.getByRole("button", { name: "Create team" }).click();
    await expect(teamDialog).not.toBeVisible();

    const teamCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: teamName });
    await teamCard.getByRole("combobox").click();
    await page.getByRole("option", { name: e2eMember.name }).click();
    await teamCard.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      teamCard
        .locator('[data-slot="badge"]')
        .filter({ hasText: e2eMember.name }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "People & access" }).click();
    await page.getByRole("button", { name: "Grant access" }).click();
    const accessDialog = page.getByRole("dialog", { name: "Grant access" });
    await accessDialog.getByText("Advanced: organization or team").click();
    await accessDialog.getByRole("combobox", { name: "Grant to" }).click();
    await page.getByRole("option", { name: "Team", exact: true }).click();
    await accessDialog
      .getByRole("combobox", { name: "Person or team" })
      .click();
    await page.getByRole("option", { name: teamName, exact: true }).click();
    await accessDialog
      .getByRole("combobox", { name: "Role", exact: true })
      .click();
    await page.getByRole("option", { name: "Project Viewer" }).click();
    await accessDialog.getByRole("button", { name: "Grant access" }).click();
    await expect(accessDialog).not.toBeVisible();
    await page
      .getByPlaceholder("Search people, email, role, or team…")
      .fill(teamName);
    await expect(
      page.locator("tbody tr").filter({ hasText: e2eMember.email }),
    ).toHaveCount(1);
  });
});
