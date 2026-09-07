import { expect, test } from "@playwright/test";
import {
  e2eAccessManager,
  e2eMember,
  e2eOrganizationAdmin,
  ensureE2EAccessManager,
  ensureE2EMember,
  ensureE2EOrganizationAdmin,
  ensureE2EUser,
  login,
  loginWithCredentials,
} from "./fixtures";

test.beforeAll(async () => {
  await ensureE2EUser();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("members page", () => {
  test("loads members page", async ({ page }) => {
    await page.goto("/en/members");
    await expect(page).toHaveURL(/\/en\/members/);

    await expect(
      page.getByRole("heading", { name: /Access/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows one unified access table", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: /^People$/ }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByPlaceholder("Search people, email, role, or team…"),
    ).toBeVisible();
  });

  test("explains organization inheritance in project settings", async ({
    page,
  }) => {
    await page.goto("/en/admin/settings");

    await page
      .getByText("Project and organization settings", { exact: true })
      .click();
    await expect(
      page.getByText(/Organization roles apply to every project/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("offers scoped role assignment", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("button", { name: "Grant access" }),
    ).toBeEnabled({ timeout: 10_000 });
  });

  test("shows people, teams, and roles tabs", async ({ page }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("tab", { name: "People", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Roles" })).toBeVisible();
  });

  test("completes a bulk role grant without requiring a hidden principal", async ({
    page,
  }) => {
    await ensureE2EMember();
    await page.goto("/en/members");

    await page.getByRole("checkbox", { name: "Select E2E Member" }).check();
    await page.getByRole("button", { name: "Grant selected" }).click();
    const dialog = page.getByRole("dialog", { name: "Grant access" });
    await expect(
      dialog.getByRole("combobox", { name: "Person or team" }),
    ).toHaveCount(0);
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await page
      .getByRole("option", { name: "Project Viewer", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Grant access" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("limits a project access manager to roles they can delegate", async ({
    page,
  }) => {
    await ensureE2EAccessManager();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eAccessManager);
    await page.goto("/en/members");

    await expect(
      page.getByRole("button", { name: "Grant access" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Add person" })).toHaveCount(
      0,
    );

    const workspacesResponse = await page.request.get("/api/workspaces");
    const workspaceRows = (await workspacesResponse.json()) as Array<{
      workspace: { id: string; slug: string };
    }>;
    const workspaceId = workspaceRows.find(
      ({ workspace }) => workspace.slug === "main",
    )?.workspace.id;
    expect(workspaceId).toBeTruthy();
    const snapshotResponse = await page.request.get(
      `/api/workspace/iam?workspaceId=${workspaceId}`,
    );
    const accessSnapshot = (await snapshotResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
      roles: Array<{ id: string; name: string }>;
    };
    const actorId = accessSnapshot.members.find(
      ({ email }) => email === e2eAccessManager.email,
    )?.userId;
    const administratorRoleId = accessSnapshot.roles.find(
      ({ name }) => name === "workspace.admin",
    )?.id;
    expect(actorId).toBeTruthy();
    expect(administratorRoleId).toBeTruthy();
    const escalationResponse = await page.request.post("/api/workspace/iam", {
      data: {
        action: "assignRole",
        workspaceId,
        principalType: "user",
        principalId: actorId,
        roleId: administratorRoleId,
        scopeType: "workspace",
      },
    });
    expect(escalationResponse.status()).toBe(403);

    await page.getByRole("tab", { name: "Teams" }).click();
    await expect(page.getByRole("button", { name: "Create team" })).toHaveCount(
      0,
    );

    await page.getByRole("tab", { name: "People", exact: true }).click();
    await page.getByRole("button", { name: "Grant access" }).click();
    const dialog = page.getByRole("dialog", { name: "Grant access" });
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await expect(
      page.getByRole("option", { name: "Restricted Access Manager" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Project Administrator" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("option", { name: "Project Viewer" }),
    ).toHaveCount(0);
  });

  test("prevents an organization administrator from granting ownership", async ({
    page,
  }) => {
    await ensureE2EOrganizationAdmin();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eOrganizationAdmin);
    await page.goto("/en/members");

    await page.getByRole("button", { name: "Grant access" }).click();
    const dialog = page.getByRole("dialog", { name: "Grant access" });
    await dialog.getByText("Advanced: organization or team").click();
    await dialog.getByRole("combobox", { name: "Scope" }).click();
    await page
      .getByRole("option", { name: "Whole organization", exact: true })
      .click();
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await expect(
      page.getByRole("option", { name: "Organization Administrator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Organization Owner" }),
    ).toHaveCount(0);
  });

  test("fails closed for a member opening the access URL directly", async ({
    page,
  }) => {
    await ensureE2EMember();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eMember);
    await page.goto("/en/members");

    await expect(page.getByText("Access could not be loaded")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Grant access" }),
    ).toHaveCount(0);
  });
});
