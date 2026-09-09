import { expect, test } from "@playwright/test";
import { ensureE2EUser, ensureE2EAssistant, login } from "./fixtures";
test.beforeAll(async () => {
  await ensureE2EUser();
  await ensureE2EAssistant();
});
test("Maiah A1 renders, animates and respects reduced motion across chat layouts", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.goto("/fr/chat");
  const logo = page.locator("svg.maiah-animated-mark");
  await expect(logo).toBeVisible();
  const assembly = logo.locator(":scope > g");
  const first = await assembly.getAttribute("transform");
  await expect
    .poll(() => assembly.getAttribute("transform"), { timeout: 4000 })
    .not.toBe(first);
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [1280, 600],
    [390, 667],
  ]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(assembly).toHaveAttribute("transform", "rotate(0)");
    await page.screenshot({
      path: testInfo.outputPath(`maiah-chat-${width}-${height}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await logo.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(200);
    await expect(assembly).toHaveAttribute("transform", "rotate(0)");
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() => assembly.getAttribute("transform"), { timeout: 4000 })
    .not.toBe("rotate(0)");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath("maiah-chat-motion.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await expect(logo).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("maiah-chat-dark.png") });
  expect(errors).toEqual([]);
});
