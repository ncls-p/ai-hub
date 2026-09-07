import { expect, test } from "@playwright/test";
import { ensureE2ETransferScenario, ensureE2EUser, login } from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
  await ensureE2ETransferScenario();
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
    for (const tab of ["Personnes", "Équipes", "Rôles", "Ressources"]) {
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
      await page.getByRole("tab", { name: "Rôles", exact: true }).click();
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath("roles-mobile.png"),
        fullPage: true,
      });
      await page.getByRole("tab", { name: "Personnes", exact: true }).click();
      await page.locator("tbody tr").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
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
        animations: "disabled",
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
  await expect(
    person.getByRole("button", { name: /^Role for .*: Viewer$/ }),
  ).toBeVisible();
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
  const roleButton = person.getByRole("button", { name: /^Role for / });
  await roleButton.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("menuitemradio", { name: /^Editor/ });
  await expect(editor).toContainText("Create and use resources");
  await expect(
    page.getByRole("menuitemradio", { name: /^Viewer/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      page
        .getByRole("menu")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    )
    .toBe(true);
  let rejectChange = true;
  await page.route("**/api/workspace/iam", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "assignRole" &&
      rejectChange
    ) {
      rejectChange = false;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Role change unavailable. Try again." }),
      });
    } else await route.continue();
  });
  await editor.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Role change unavailable. Try again."),
  ).toBeVisible();
  await expect(roleButton).toContainText("Viewer");
  await roleButton.click();
  await page.getByRole("menuitemradio", { name: /^Editor/ }).click();
  await expect(roleButton).toContainText("Editor");
  await page.reload();
  await page
    .getByPlaceholder("Search people, email, role, or team…")
    .fill(`colleague-${suffix}@example.test`);
  await expect(roleButton).toContainText("Editor");
  await person.getByText("Access details", { exact: true }).click();
  await expect(person).toContainText("Project Editor");
  await expect(person).not.toContainText("Project Viewer");
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

test("shows retryable resource errors and keeps sharing readable on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/en/members");
  let rejectList = true;
  let rejectDetails = true;
  await page.route("**/api/workspace/iam/resources?**", async (route) => {
    const isDetails = new URL(route.request().url()).searchParams.has(
      "resourceId",
    );
    if ((!isDetails && rejectList) || (isDetails && rejectDetails)) {
      if (isDetails) rejectDetails = false;
      else rejectList = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service unavailable. Please retry." }),
      });
    } else await route.continue();
  });
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Service unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search resources", exact: true })
    .fill("Transfer preview assistant");
  const resource = page
    .locator("tbody tr")
    .filter({ hasText: "Transfer preview assistant" });
  await expect(resource).toBeVisible();
  await resource
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Service unavailable");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByLabel("Role", { exact: true })).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("resource-sharing-mobile.png"),
    animations: "disabled",
  });
});
