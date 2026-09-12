import { expect, test } from "@playwright/test";
import {
  ensureE2EAssistant,
  ensureE2EMember,
  ensureE2EViewer,
  e2eMember,
  e2eViewer,
  login,
  loginWithCredentials,
} from "./fixtures";

for (const role of [
  { name: "viewer", user: e2eViewer, prepare: ensureE2EViewer },
  { name: "editor", user: e2eMember, prepare: ensureE2EMember },
]) {
  test(`${role.name} cannot read project usage or audit through navigation, direct URLs or APIs`, async ({
    page,
  }) => {
    const { workspaceId } = await ensureE2EAssistant();
    await role.prepare();
    await loginWithCredentials(page, role.user);
    await page.request.patch("/api/workspaces", { data: { workspaceId } });
    await page.goto("/en/chat");
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Usage", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Activity log", exact: true }),
    ).toHaveCount(0);
    for (const route of ["usage", "audit"]) {
      const response = await page.request.get(
        `/api/workspace/${route}?workspaceId=${workspaceId}`,
      );
      expect(response.status()).toBe(403);
      await page.goto(`/en/${route}`);
      await expect(
        page.getByRole("heading", {
          name: "You don’t have access to this page",
          exact: true,
        }),
      ).toBeVisible();
    }
  });
}

test("administrators retain usage and audit access", async ({ page }) => {
  const { workspaceId } = await ensureE2EAssistant();
  await login(page);
  for (const route of ["usage", "audit"]) {
    const response = await page.request.get(
      `/api/workspace/${route}?workspaceId=${workspaceId}`,
    );
    expect(response.status()).toBe(200);
  }
});
