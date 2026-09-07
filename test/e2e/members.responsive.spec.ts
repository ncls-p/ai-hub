import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("keeps people, teams, roles and account creation readable on narrow screens", async ({
  page,
}, testInfo) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fr/members");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    for (const tab of ["Personnes et accès", "Équipes", "Rôles"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
      const clipped = await page
        .locator('[data-slot="badge"]:visible')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth + 1)
            .map((node) => node.textContent),
        );
      expect(clipped).toEqual([]);
    }
    if (width === 390) {
      await page.screenshot({
        path: testInfo.outputPath("roles-mobile.png"),
        fullPage: true,
      });
      await page
        .getByRole("tab", { name: "Personnes et accès", exact: true })
        .click();
      await page.locator("tbody tr").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath("people-mobile.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Ajouter une personne", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "Créer un compte" }).click();
      await expect(dialog.getByLabel("Nom", { exact: true })).toBeVisible();
      await expect(
        dialog.getByLabel("Mot de passe temporaire", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("create-account-mobile.png"),
      });
      await dialog
        .getByRole("button", { name: "Annuler", exact: true })
        .click();
    }
  }
});

test("creates an account, assigns its role, then edits a team", async ({
  page,
}) => {
  const suffix = Date.now();
  await page.goto("/en/members");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Create account" }).click();
  await dialog
    .getByLabel("Name", { exact: true })
    .fill(`New colleague ${suffix} ${"NomSansEspaces".repeat(8)}`);
  await dialog
    .getByLabel("Email", { exact: true })
    .fill(`colleague-${suffix}@example.test`);
  await dialog
    .getByLabel("Temporary password", { exact: true })
    .fill("Password123!");
  await dialog.getByRole("button", { name: "Create and add" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByPlaceholder("Search people, email, role, or team…")
    .fill(`colleague-${suffix}@example.test`);
  const person = page
    .locator("tbody tr")
    .filter({ hasText: `colleague-${suffix}@example.test` });
  await expect(person).toBeVisible();
  await expect(person).toContainText("Project Viewer");
  await page.setViewportSize({ width: 320, height: 900 });
  await person.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  const createTeam = page.getByRole("dialog");
  await createTeam.getByLabel("Team name").fill(`Support ${suffix}`);
  await createTeam
    .getByRole("button", { name: "Create team", exact: true })
    .click();
  const team = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(`Support ${suffix}`, { exact: true }) });
  await team.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit team", exact: true });
  await edit.getByLabel("Team name").fill(`Customer support ${suffix}`);
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByText(`Customer support ${suffix}`, { exact: true }),
  ).toBeVisible();
});
