import { Client } from "pg";
import { databaseUrl, e2eUser } from "./fixtures";
import { test } from "./access-memberships.fixtures";
import { expect } from "@playwright/test";
import { ensureE2EUser, login } from "./fixtures";
test("creates an empty organization, exposes organization agents across projects and manages usage limits", async ({
  page,
  cleanupOrganization,
}) => {
  test.setTimeout(90000);
  await ensureE2EUser();
  await login(page);
  const organizationName = `Distribution ${Date.now()}`;
  const created = await page.request.post("/api/organizations", {
    data: { action: "createOrganization", name: organizationName },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { organization, project } = await created.json();
  expect(project).toBeNull();
  const directory = await page.request.get("/api/organizations");
  expect(
    (await directory.json()).organizations.find(
      (org: { id: string }) => org.id === organization.id,
    ).projects,
  ).toEqual([]);
  const first = await page.request.post("/api/organizations", {
    data: {
      action: "createProject",
      organizationId: organization.id,
      name: "Source",
    },
  });
  expect(first.status(), await first.text()).toBe(201);
  const source = (await first.json()).project;
  const second = await page.request.post("/api/organizations", {
    data: {
      action: "createProject",
      organizationId: organization.id,
      name: `Sibling ${organization.id}`,
    },
  });
  expect(second.status(), await second.text()).toBe(201);
  const sibling = (await second.json()).project;
  cleanupOrganization({
    workspaceId: sibling.id,
    organizationName,
    cookies: await page.context().cookies(),
  });

  const response = await page.request.post("/api/workspace/agents", {
    data: {
      workspaceId: source.id,
      name: "Available across projects",
      systemPrompt: "Help",
      accessScope: "organization",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { agent } = await response.json();
  const listed = await page.request.get(
    `/api/workspace/agents?workspaceId=${sibling.id}`,
  );
  expect(listed.ok(), await listed.text()).toBe(true);
  expect(
    (await listed.json()).agents.some(
      (row: { id: string }) => row.id === agent.id,
    ),
  ).toBe(true);
  const detail = await page.request.get(
    `/api/workspace/agents/${agent.id}?workspaceId=${sibling.id}`,
  );
  expect(detail.ok(), await detail.text()).toBe(true);
  await page.goto("/en/members");
  await page
    .getByRole("tab", { name: "Organization sharing", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source project", exact: true })
    .click();
  await page
    .getByRole("option", { name: `${organizationName} · Source`, exact: true })
    .click();
  await page.getByRole("combobox", { name: "Resource", exact: true }).click();
  await page
    .getByRole("option", { name: "Available across projects", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: organizationName, exact: true })
    .check();
  await page.getByRole("button", { name: "Save sharing", exact: true }).click();
  await expect(page.getByText("Sharing saved.", { exact: true })).toBeVisible();
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const conversationId = crypto.randomUUID();
  try {
    const owner = await sql.query('select id from "user" where email=$1', [
      e2eUser.email,
    ]);
    await sql.query(
      "insert into conversations (id,workspace_id,agent_id,user_id,title) values ($1,$2,$3,$4,$5)",
      [
        conversationId,
        source.id,
        agent.id,
        owner.rows[0].id,
        "Personal history survives project changes",
      ],
    );
    await sql.query("delete from workspaces where id=$1", [source.id]);
    const preserved = await page.request.get(
      `/api/workspace/conversations/${conversationId}`,
    );
    expect(preserved.ok(), await preserved.text()).toBe(true);
    await page.goto("/en/members");
    await page
      .getByRole("combobox", { name: "Active project", exact: true })
      .click();
    await page
      .getByRole("option", { name: `Sibling ${organization.id}`, exact: true })
      .click();
    await page.goto(
      `/en/chat?agentId=${agent.id}&conversationId=${conversationId}`,
    );
    await expect(
      page.getByRole("button", { name: "Share conversation", exact: true }),
    ).toBeVisible();
    for (const query of ["", `?workspaceId=${sibling.id}`]) {
      const history = await page.request.get(
        `/api/workspace/conversations${query}`,
      );
      expect(history.ok(), await history.text()).toBe(true);
      expect(
        (await history.json()).some(
          (row: { id: string }) => row.id === conversationId,
        ),
      ).toBe(true);
    }
  } finally {
    await sql.query("delete from conversations where id=$1", [conversationId]);
    await sql.end();
  }
  await page.goto("/en/members");
  await page.getByRole("tab", { name: "Usage limits", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add usage limit", exact: true }),
  ).toBeVisible();
  const limit = await page.request.put("/api/admin/usage-limits", {
    data: {
      subjectType: "organization",
      subjectId: organization.id,
      providerId: null,
      modelId: null,
      period: "day",
      requestLimit: 10,
      tokenLimit: null,
      costLimitUsd: null,
    },
  });
  expect(limit.ok(), await limit.text()).toBe(true);
  const saved = (await limit.json()).limit;
  const removed = await page.request.delete("/api/admin/usage-limits", {
    data: { id: saved.id },
  });
  expect(removed.ok()).toBe(true);
});
