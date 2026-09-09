import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { ensureE2EAssistant, ensureE2EUser, login } from "./fixtures";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

test.beforeAll(async () => {
  await ensureE2EUser();
  await ensureE2EAssistant();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("chat composer", () => {
  test("input field is present when agents exist", async ({ page }) => {
    await page.goto("/en/chat");
    const composer = page.locator("textarea, [role='textbox']").first();
    await expect(composer).toBeVisible();
    await expect(composer).toBeEditable();
    await composer.fill("A draft that survives focus changes");
    await composer.press("Tab");
    await expect(composer).toHaveValue("A draft that survives focus changes");
  });

  test("keeps composer controls within the mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/chat");

    const controls = page.locator(
      '[data-slot="chat-composer-primary-controls"]',
    );
    await expect(controls).toBeVisible({ timeout: 15_000 });
    const dock = page.locator(".composer-dock");
    const composerBox = page.locator(".composer-box");
    const textarea = composerBox.locator("textarea");
    const mobileNavigation = page.locator(
      '[data-slot="mobile-app-navigation"]',
    );
    await expect(dock).toBeVisible();
    await expect(textarea).toBeVisible();
    await expect(mobileNavigation).toBeVisible();
    await expect(
      page.locator('[data-slot="chat-reasoning-picker"]'),
    ).toBeVisible();
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /interactive-widget=resizes-content/,
    );
    const initialTextarea = await textarea.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(initialTextarea.overflowY).toBe("hidden");
    expect(initialTextarea.scrollHeight).toBeLessThanOrEqual(
      initialTextarea.clientHeight + 1,
    );
    expect(
      await controls.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const [dockBox, composerBounds, navigationBox] = await Promise.all([
      dock.boundingBox(),
      composerBox.boundingBox(),
      mobileNavigation.boundingBox(),
    ]);
    expect(dockBox).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    const dockGap = navigationBox!.y - (dockBox!.y + dockBox!.height);
    if ((await dock.getAttribute("data-centered")) === "true") {
      expect(dockGap).toBeGreaterThanOrEqual(0);
      expect(dockGap).toBeLessThanOrEqual(176);
    } else {
      expect(Math.abs(dockGap)).toBeLessThanOrEqual(1);
      expect(
        navigationBox!.y - (composerBounds!.y + composerBounds!.height),
      ).toBeLessThanOrEqual(16);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);

    const header = page.locator(".app-shell__header");
    const headerBeforeKeyboard = await header.boundingBox();
    await textarea.focus();
    await expect(mobileNavigation).toBeVisible();
    await page.setViewportSize({ width: 390, height: 500 });
    const [headerWithKeyboard, dockWithKeyboard, navigationWithKeyboard] =
      await Promise.all([
        header.boundingBox(),
        dock.boundingBox(),
        mobileNavigation.boundingBox(),
      ]);
    expect(headerWithKeyboard?.y).toBe(headerBeforeKeyboard?.y);
    expect(dockWithKeyboard).not.toBeNull();
    expect(navigationWithKeyboard).not.toBeNull();
    expect(dockWithKeyboard!.y + dockWithKeyboard!.height).toBeLessThanOrEqual(
      navigationWithKeyboard!.y + 1,
    );
    expect(dockWithKeyboard!.y + dockWithKeyboard!.height).toBeLessThanOrEqual(
      501,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);

    await textarea.fill("A long mobile message ".repeat(80));
    const filledTextarea = await textarea.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(filledTextarea.clientHeight).toBeLessThanOrEqual(112);
    expect(filledTextarea.scrollHeight).toBeGreaterThan(
      filledTextarea.clientHeight,
    );
    expect(filledTextarea.overflowY).toBe("auto");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
  });

  test("uses a stable composer action hierarchy at each responsive mode", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 600, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/en/chat");
      const primary = page.locator(
        '[data-slot="chat-composer-primary-controls"]',
      );
      const upload = page.getByRole("button", { name: "Upload files" });
      const send = page.getByRole("button", { name: "Send message" });
      await expect(primary).toBeVisible({ timeout: 15_000 });
      await expect(upload).toBeVisible();
      await expect(send).toBeVisible();
      const [primaryBox, uploadBox, sendBox] = await Promise.all([
        primary.boundingBox(),
        upload.boundingBox(),
        send.boundingBox(),
      ]);
      expect(primaryBox).not.toBeNull();
      expect(uploadBox).not.toBeNull();
      expect(sendBox).not.toBeNull();
      expect(Math.abs(uploadBox!.y - sendBox!.y)).toBeLessThanOrEqual(2);
      expect(uploadBox!.x).toBeLessThan(sendBox!.x);
      if (viewport.width >= 640) {
        expect(Math.abs(primaryBox!.y - uploadBox!.y)).toBeLessThanOrEqual(2);
        expect(primaryBox!.x).toBeGreaterThan(uploadBox!.x);
        expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(
          sendBox!.x + 1,
        );
      } else {
        expect(primaryBox!.x).toBeGreaterThanOrEqual(uploadBox!.x);
        expect(
          await primary.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });
});
