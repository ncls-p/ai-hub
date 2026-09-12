import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

test("homonymous organizations are distinguishable in the directory and sharing selectors", async ({
  page,
}) => {
  await ensureE2EAssistant();
  await login(page);
  await page.route("**/api/organizations", (route) =>
    route.fulfill({
      json: {
        organizations: [
          {
            id: "aaaaaaaa-0000-4000-8000-000000000001",
            name: "Helpline",
            projects: [{ id: "demo", name: "Demo Veolia" }],
            canCreateProject: false,
            canManageMembers: false,
          },
          {
            id: "bbbbbbbb-0000-4000-8000-000000000002",
            name: "Helpline",
            projects: [{ id: "live", name: "Veolia" }],
            canCreateProject: false,
            canManageMembers: false,
          },
        ],
      },
    }),
  );
  await page.goto("/en/members?section=organizations");
  await expect(
    page.getByText("Separate organizations share the same name.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Organization", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Helpline · Demo Veolia", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "Helpline · Veolia", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Veolia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Make org admin", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page
    .getByRole("tab", { name: "Organization sharing", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source project", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Helpline · Demo Veolia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Helpline · Veolia", exact: true }),
  ).toBeVisible();
});
