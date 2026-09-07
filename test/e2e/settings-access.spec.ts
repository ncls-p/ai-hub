import { expect, test } from "@playwright/test";
import {
  e2eMember,
  e2eOrganizationAdmin,
  ensureE2EMember,
  ensureE2EOrganizationAdmin,
  ensureE2EUser,
  loginWithCredentials,
} from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test("a standard member can find personal settings and change their password", async ({
  page,
}) => {
  await ensureE2EMember();
  await loginWithCredentials(page, e2eMember);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: e2eMember.name, exact: true }).click();
  await page.getByRole("menuitem", { name: "My account", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/settings/);
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Organization branding" }),
  ).toHaveCount(0);
  const newPassword = `NewPassword-${Date.now()}!`;
  await page
    .getByLabel("Current password", { exact: true })
    .fill(e2eMember.password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(newPassword);
  try {
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.locator('[id="password-change-success"]')).toBeVisible();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveValue("");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    const signIn = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: new URL(page.url()).origin },
      data: { email: e2eMember.email, password: newPassword },
    });
    expect(signIn.status(), await signIn.text()).toBe(200);
    const forbidden = await page.request.get("/api/admin/users");
    expect(forbidden.status()).toBe(403);
    await page.goto("/en/admin/settings");
    await expect(
      page.getByRole("button", { name: "Save branding", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Registration", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await ensureE2EMember();
  }
});

test("an organization administrator can edit organization settings without platform administration", async ({
  page,
}) => {
  await ensureE2EOrganizationAdmin();
  await loginWithCredentials(page, e2eOrganizationAdmin);
  await page.goto("/en/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Organization branding" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save branding", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Registration", { exact: true })).toHaveCount(0);
  const forbidden = await page.request.get("/api/admin/users");
  expect(forbidden.status()).toBe(403);
});
