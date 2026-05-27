import { expect, test } from "@playwright/test";

test.describe("setup wizard", () => {
	test("shows welcome copy on the setup page", async ({ page }) => {
		await page.goto("/setup");
		await expect(
			page.getByRole("heading", { name: /Welcome to AI Hub/i }),
		).toBeVisible();
		await expect(page.getByText(/Connect an AI provider/i)).toBeVisible();
		await expect(page.getByText(/Model/i)).toBeVisible();
	});
});

test.describe("team page", () => {
	test("shows workspace members section", async ({ page }) => {
		await page.goto("/members");
		await expect(page.getByText(/Workspace members/i)).toBeVisible();
	});
});
