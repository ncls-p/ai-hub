import { expect, test } from "@playwright/test";

test("recovers from a shared conversation outage with keyboard navigation", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/public/conversations/qa-recovery", (route) => {
    requests += 1;
    return route.fulfill(
      requests === 1
        ? { status: 503, body: "Unavailable" }
        : {
            json: {
              conversation: {
                title: "Recovered report",
                agentName: "QA",
                updatedAt: "2026-09-09",
              },
              messages: [
                {
                  id: "message",
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      content: "## Findings\n\n**Verified** recovery",
                    },
                  ],
                },
              ],
            },
          },
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/share/qa-recovery");
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be loaded" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeFocused();
  await retry.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Recovered report" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.locator('[data-streamdown="strong"]')).toHaveText(
    "Verified",
  );
  expect(requests).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("shows a revoked public link without offering a misleading retry", async ({
  page,
}) => {
  await page.route("**/api/public/conversations/qa-revoked", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/fr/share/qa-revoked");
  await expect(
    page.getByText("Cette conversation partagée n’est pas disponible."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer" })).toHaveCount(0);
});
