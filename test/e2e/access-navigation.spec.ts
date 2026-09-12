import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

nextEnv.loadEnvConfig(process.cwd());

test("keeps access navigation, drafts and direct links usable on desktop and mobile", async ({
  page,
}) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  expect(
    (
      await page.request.patch("/api/workspaces", { data: { workspaceId } })
    ).ok(),
  ).toBe(true);
  await page.goto("/en/members");
  await expect(
    page.getByRole("tab", { name: "People and permissions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("combobox", { name: "Active project", exact: true }),
  ).toBeVisible();
  const settings = page.getByRole("button", {
    name: "Project and organization settings",
    exact: true,
  });
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeHidden();
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Transfer project", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Transfer project", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Transfer project", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeVisible();
  await settings.click();
  await page.getByRole("tab", { name: "Teams", exact: true }).click();
  await expect(page).toHaveURL(/tab=teams/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Teams", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const organizations = page.getByRole("tab", {
    name: "Organizations and projects",
    exact: true,
  });
  await organizations.click();
  const name = page.locator("#standalone-organization-name");
  await name.fill("Draft organization");
  await page.getByRole("tab", { name: "Usage limits", exact: true }).click();
  await expect(name).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add usage limit", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(organizations).toHaveAttribute("aria-selected", "true");
  await expect(name).toHaveValue("Draft organization");
  await page.screenshot({
    path: "/tmp/maiah-access-navigation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(organizations).toBeVisible();
  await expect(name).toHaveValue("Draft organization");
  await organizations.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Organization sharing", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("combobox", { name: "Source project", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/maiah-access-navigation-mobile.png",
    fullPage: true,
  });
});
