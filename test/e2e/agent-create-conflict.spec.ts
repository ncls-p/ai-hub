import { expect, test } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";
import { createAssistantButtonName } from "./agents.spec.create-assistant-button-name";

test("creates assistants with identical Unicode names and unique generated slugs", async ({
  page,
}) => {
  await ensureE2EUser();
  await login(page);
  const name = "助手 🤖";
  const agents: Array<{ id: string; name: string; slug: string }> = [];
  let payload: Record<string, unknown> = {};
  for (let index = 0; index < 2; index++) {
    await page.goto("/en/agents");
    await page
      .getByRole("button", { name: createAssistantButtonName })
      .first()
      .click();
    await expect(page.locator("#agent-slug")).toHaveCount(0);
    await page.getByLabel(/^Name$/i).fill(name);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/workspace/agents") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Create and configure/i }).click();
    const created = await createdResponse;
    expect(created.status(), await created.text()).toBe(201);
    payload = created.request().postDataJSON();
    expect(payload).not.toHaveProperty("slug");
    agents.push((await created.json()).agent);
    await expect(page).toHaveURL(/\/en\/agents\/[0-9a-f-]+$/);
  }
  for (const agent of agents) {
    expect(agent.name).toBe(name);
    expect(agent.slug).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
  expect(agents[0].id).not.toBe(agents[1].id);
  expect(agents[0].slug).not.toBe(agents[1].slug);
  const duplicate = await page.request.post("/api/workspace/agents", {
    data: { ...payload, slug: agents[0].slug },
  });
  expect(duplicate.status(), await duplicate.text()).toBe(409);
});
