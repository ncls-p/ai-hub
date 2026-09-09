import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";
import { createAssistantButtonName } from "./agents.spec.create-assistant-button-name";

test("creates an assistant, reports duplicate slugs, and allows correction", async ({
  page,
}) => {
  await ensureE2EUser();
  await login(page);
  await page.goto("/en/agents");
  await page
    .getByRole("button", { name: createAssistantButtonName })
    .first()
    .click();
  const name = `Creation regression ${Date.now()}`;
  await page.getByLabel(/^Name$/i).fill(name);
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workspace/agents") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Create and configure/i }).click();
  const created = await createdResponse;
  expect(created.status(), await created.text()).toBe(201);
  const payload = created.request().postDataJSON();
  await expect(page).toHaveURL(/\/en\/agents\/[0-9a-f-]+$/);
  const duplicate = await page.request.post("/api/workspace/agents", {
    data: payload,
  });
  expect(duplicate.status(), await duplicate.text()).toBe(409);
  expect(await duplicate.json()).toEqual({
    error: "Agent slug already exists in this workspace",
  });
  const corrected = await page.request.post("/api/workspace/agents", {
    data: {
      ...payload,
      name: `${name} corrected`,
      slug: `${payload.slug}-corrected`,
    },
  });
  expect(corrected.status(), await corrected.text()).toBe(201);
});
