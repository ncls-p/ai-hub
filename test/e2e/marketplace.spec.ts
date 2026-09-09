import { expect, test, type Page } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";

// Deterministic catalog responses exercise the real rendered marketplace UI.
// Resource publishing/import permissions are covered by the resource-package suites.
const listing = {
  id: "080f18dd-003e-4358-aa9c-e265252a43b0",
  name: "QA research assistant",
  description: "A deterministic catalog listing",
  type: "agent",
  status: "published",
  visibility: "public",
  installCount: 0,
  totalDownloads: 0,
  isFeatured: false,
  verifiedPublisher: false,
  publishedAt: "2026-09-09T00:00:00Z",
  createdAt: "2026-09-09T00:00:00Z",
  tagsJson: ["research"],
  publisherUserId: "qa-publisher",
};
async function catalog(page: Page, items = [listing]) {
  await page.route(
    (url) => url.pathname === "/api/marketplace/items",
    (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams.has("_path")
          ? []
          : items,
      }),
  );
}

test.beforeAll(async () => {
  await ensureE2EUser();
});
test.beforeEach(async ({ page }) => {
  await login(page);
});

test("loads the catalog and switches to the user's empty listings", async ({
  page,
}) => {
  await catalog(page);
  await page.goto("/en/marketplace");
  await expect(
    page.getByRole("heading", { name: /Marketplace/i }),
  ).toBeVisible();
  await expect(page.getByText(listing.name, { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Discover (1)" })).toBeVisible();
  await page.getByRole("tab", { name: "My listings (0)" }).click();
  await expect(
    page.getByText("You haven’t published anything yet"),
  ).toBeVisible();
  await expect(page.getByText(listing.name, { exact: true })).toBeHidden();
});

test("shows a verified empty state when the catalog contains no listings", async ({
  page,
}) => {
  await catalog(page, []);
  await page.goto("/en/marketplace");
  await expect(
    page.getByText("No listings yet", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View details" })).toHaveCount(0);
});

test("search filters listings and clearing it restores them", async ({
  page,
}) => {
  await catalog(page);
  await page.goto("/en/marketplace");
  const search = page.getByRole("textbox", { name: "Search listings…" });
  await expect(page.getByText(listing.name, { exact: true })).toBeVisible();
  await search.fill("no-match-for-this-query");
  await expect(page.getByText(listing.name, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Discover (0)" })).toBeVisible();
  await search.fill("research");
  await expect(page.getByText(listing.name, { exact: true })).toBeVisible();
  await search.clear();
  await expect(page.getByRole("tab", { name: "Discover (1)" })).toBeVisible();
});

test("opens a real detail view from a catalog card", async ({ page }) => {
  await catalog(page);
  await page.route(`**/api/marketplace/items/${listing.id}`, (route) =>
    route.fulfill({
      json: {
        ...listing,
        latestVersion: null,
        publisher: null,
        shares: [],
        isOwner: false,
        canInstall: false,
      },
    }),
  );
  await page.goto("/en/marketplace");
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(page).toHaveURL(`/en/marketplace/items/${listing.id}`);
  await expect(page.getByRole("heading", { name: listing.name })).toBeVisible();
  await expect(
    page.getByText(listing.description, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to marketplace" }).click();
  await expect(page).toHaveURL("/en/marketplace");
});

test("does not show an empty catalog when its API fails", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/marketplace/items",
    (route) => route.fulfill({ status: 503 }),
  );
  await page.goto("/en/marketplace");
  await expect(
    page.getByRole("heading", {
      name: "Could not load marketplace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("No listings yet", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
