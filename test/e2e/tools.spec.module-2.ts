import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, login } from "./fixtures";

test.describe("retired custom tools builder", () => {
  test("redirects old custom tools links to workflows", async ({ page }) => {
    await page.goto("/en/custom-tools");
    await expect(page).toHaveURL(/\/en\/workflows/);
  });

  test("does not expose a custom tools tab", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(
      page.getByRole("tab", { name: "Custom", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("scheduled tasks page", () => {
  let workspaceId: string;

  test.beforeAll(async () => {
    ({ workspaceId } = await ensureE2EAssistant());
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    const response = await page.request.patch("/api/workspaces", {
      data: { workspaceId },
    });
    expect(response.ok()).toBe(true);
  });

  test("loads scheduled tasks page", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await expect(page).toHaveURL(/\/en\/scheduled-tasks/);

    await expect(
      page.getByRole("heading", {
        name: /Automate, without losing control\./i,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows scheduled tasks empty state", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    await expect(
      page.getByText(/Scheduled tasks|No scheduled|Create/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("scheduled tasks page description exists", async ({ page }) => {
    await page.goto("/en/scheduled-tasks");
    await page.waitForTimeout(2000);

    // Should have a description about scheduling
    await expect(
      page.getByText(/Schedule|automatic|assistants/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("opens task details and edits its configuration", async ({ page }) => {
    const suffix = Date.now();
    const title = `Editable task ${suffix}`;
    const updatedTitle = `Updated task ${suffix}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/scheduled-tasks");

    await page.getByRole("button", { name: "Create task" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create a task" });
    await createDialog.getByLabel("Title").fill(title);
    await createDialog
      .getByLabel("Instructions")
      .fill("Prepare a concise daily status report.");
    await createDialog.getByRole("button", { name: "Create task" }).click();

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `View and edit ${title}` }).click();
    const editDialog = page.getByRole("dialog", { name: "Task details" });
    await expect(editDialog.getByText("Next run")).toBeVisible();
    await expect(editDialog.getByText("Time zone")).toBeVisible();
    const scheduleFields = editDialog.locator(
      '[data-slot="scheduled-task-schedule-fields"]',
    );
    const assistant = editDialog.getByLabel("Assistant");
    const frequency = editDialog.getByLabel("Frequency");
    const time = editDialog.getByLabel("Time");
    const [assistantDesktop, frequencyDesktop, timeDesktop] = await Promise.all(
      [assistant.boundingBox(), frequency.boundingBox(), time.boundingBox()],
    );
    expect(assistantDesktop).not.toBeNull();
    expect(frequencyDesktop).not.toBeNull();
    expect(timeDesktop).not.toBeNull();
    expect(assistantDesktop!.y + assistantDesktop!.height).toBeLessThan(
      frequencyDesktop!.y,
    );
    expect(frequencyDesktop!.x + frequencyDesktop!.width).toBeLessThanOrEqual(
      timeDesktop!.x,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const [dialogMobile, assistantMobile, frequencyMobile, timeMobile] =
      await Promise.all([
        editDialog.boundingBox(),
        assistant.boundingBox(),
        frequency.boundingBox(),
        time.boundingBox(),
      ]);
    expect(dialogMobile).not.toBeNull();
    expect(dialogMobile!.x).toBeGreaterThanOrEqual(0);
    expect(dialogMobile!.y).toBeGreaterThanOrEqual(0);
    expect(dialogMobile!.x + dialogMobile!.width).toBeLessThanOrEqual(390);
    expect(dialogMobile!.y + dialogMobile!.height).toBeLessThanOrEqual(844);
    expect(assistantMobile!.y + assistantMobile!.height).toBeLessThan(
      frequencyMobile!.y,
    );
    expect(frequencyMobile!.y + frequencyMobile!.height).toBeLessThan(
      timeMobile!.y,
    );
    await expect
      .poll(() =>
        scheduleFields.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true);
    await expect(
      editDialog.getByRole("button", { name: "Save changes" }),
    ).toBeInViewport();
    await editDialog.getByLabel("Title").fill(updatedTitle);
    await editDialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
  });
});
