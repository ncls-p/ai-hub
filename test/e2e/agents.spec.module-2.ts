import { expect, test } from "@playwright/test";
import { createAssistantButtonName } from "./agents.spec.create-assistant-button-name";
import {
  e2eOrganizationProjectEditor,
  e2eViewer,
  ensureE2EAssistant,
  ensureE2EOrganizationProjectEditor,
  ensureE2EViewer,
  login,
  loginWithCredentials,
} from "./fixtures";

test.describe("agent CRUD", () => {
  test("lets an organization member who is project editor choose an available model", async ({
    page,
  }) => {
    await ensureE2EAssistant();
    await ensureE2EOrganizationProjectEditor();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eOrganizationProjectEditor);
    await page.goto("/en/agents");

    await page
      .getByRole("button", { name: createAssistantButtonName })
      .first()
      .click();
    const accessPicker = page.locator(
      '[data-slot="agent-access-scope-picker"]',
    );
    await expect(
      accessPicker.getByRole("button", { name: /^Only me/i }),
    ).toBeVisible();
    await expect(
      accessPicker.getByRole("button", {
        name: /^This project|Organization|A team/i,
      }),
    ).toHaveCount(0);
    const assistantName = `Editor model selection ${Date.now()}`;
    await page.getByLabel(/^Name$/i).fill(assistantName);
    await page.getByRole("button", { name: /Create and configure/i }).click();

    await expect(page).toHaveURL(/\/en\/agents\/[0-9a-f-]+$/, {
      timeout: 15_000,
    });
    const providerSelect = page.getByRole("combobox", { name: "Provider" });
    await expect(providerSelect).toBeEnabled({ timeout: 15_000 });
    await providerSelect.click();
    await expect(
      page.getByRole("option", { name: "E2E provider", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("option", { name: "E2E provider", exact: true })
      .click();

    const modelSelect = page.getByRole("combobox", { name: "Model" });
    await expect(modelSelect).toBeEnabled();
    await modelSelect.click();
    await expect(
      page.getByRole("option", { name: "E2E model", exact: true }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Assistant actions/i }).click();
    await page.getByRole("menuitem", { name: /Delete assistant/i }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.getByText(assistantName)).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^Delete$/i }).click();
    await expect(page).toHaveURL(/\/en\/agents$/, { timeout: 15_000 });
    await expect(page.getByText(assistantName)).not.toBeVisible();
  });

  test("keeps configured provider and model visible to a project viewer", async ({
    page,
  }) => {
    const { agentId } = await ensureE2EAssistant();
    await ensureE2EViewer();
    await page.context().clearCookies();
    await loginWithCredentials(page, e2eViewer);
    await page.goto(`/en/agents/${agentId}`);

    await expect(page.getByText("E2E provider", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("E2E model", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save changes/i }),
    ).toHaveCount(0);
  });

  test("create, configure, and delete an orchestrator", async ({ page }) => {
    await login(page);
    await page.goto("/en/agents");

    const createBtn = page
      .getByRole("button", { name: createAssistantButtonName })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    const orchestratorOption = page.getByRole("button", {
      name: /^Orchestrator/i,
    });
    await expect(orchestratorOption).toBeVisible();
    await orchestratorOption.click();
    await expect(orchestratorOption).toHaveAttribute("aria-pressed", "true");

    const testAgentName = `E2E Orchestrator ${Date.now()}`;
    await page.getByLabel(/^Name$/i).fill(testAgentName);
    await page.getByRole("button", { name: /Create and configure/i }).click();

    await expect(page).toHaveURL(/\/en\/agents\/[0-9a-f-]+$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Orchestration/i })).toBeVisible(
      { timeout: 15_000 },
    );
    await expect(page.getByText(testAgentName).first()).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: /Assistant settings/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Essentials/i }),
    ).toHaveAttribute("data-state", "active");
    const settingsTabs = page.getByRole("tablist", {
      name: /Assistant settings/i,
    });
    await expect(settingsTabs).toHaveCSS("overflow-x", "visible");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(settingsTabs).toBeVisible();
    expect(
      await settingsTabs.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: /Choose a model/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Change assistant logo/i }),
    ).toBeVisible();

    await page.getByRole("tab", { name: /Orchestration/i }).click();
    await page.getByRole("button", { name: /Execution limits/i }).click();
    const unlimitedLimitInputs = [
      page.getByLabel(/Maximum depth/i),
      page.getByLabel(/Maximum delegations/i),
      page.getByLabel(/Parallel assistants/i),
      page.getByLabel(/Steps per specialist/i),
      page.getByLabel(/Total token budget/i),
      page.getByLabel(/Maximum duration/i),
      page.getByLabel(/Specialist result size/i),
    ];
    for (const input of unlimitedLimitInputs) {
      await expect(input).not.toHaveAttribute("max");
      await input.fill("0");
    }
    await page.getByRole("button", { name: /Save orchestration/i }).click();
    await expect(page.getByText(/Orchestration saved/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: /Orchestration/i }).click();
    await page.getByRole("button", { name: /Execution limits/i }).click();
    for (const input of unlimitedLimitInputs) {
      await expect(input).toHaveValue("0");
    }

    await page.getByRole("button", { name: /Assistant actions/i }).click();
    await page.getByRole("menuitem", { name: /Delete assistant/i }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.getByText(testAgentName)).toBeVisible();
    await deleteDialog.getByRole("button", { name: /^Delete$/i }).click();
    await expect(page).toHaveURL(/\/en\/agents$/, { timeout: 15_000 });
    await expect(page.getByText(testAgentName)).not.toBeVisible();
  });

  test("agent templates are available", async ({ page }) => {
    await login(page);
    await page.goto("/en/agents");
    const createBtn = page
      .getByRole("button", { name: createAssistantButtonName })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    // At least one template or form field should be visible
    await expect(
      page.getByText(/assistant|template|Name/i).first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("agent detail page", () => {
  test("navigate to agent detail page", async ({ page }) => {
    const { agentId } = await ensureE2EAssistant();
    await login(page);
    await page.goto(`/en/agents/${agentId}`);
    await expect(
      page.getByRole("combobox", { name: "Provider" }),
    ).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "Model" })).toBeEnabled();
    await expect(
      page.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue("E2E menu assistant");
  });
});
