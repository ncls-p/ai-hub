import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  databaseUrl,
  ensureE2EUser,
  ensureE2EMember,
  e2eMember,
  e2eUser,
  login,
  loginWithCredentials,
} from "./fixtures";

test("moves a whole project into an empty organization while retaining resources, history and team access", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await ensureE2EUser();
  await login(page);
  await page.request.post("/api/workspaces");
  await ensureE2EMember();
  const suffix = Date.now();
  const created = await page.request.post("/api/workspace/iam", {
    data: {
      action: "createOrganization",
      organizationName: `Transfer source ${suffix}`,
      projectName: `Whole project ${suffix}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { project } = await created.json();
  const targetResponse = await page.request.post("/api/organizations", {
    data: {
      action: "createOrganization",
      name: `Transfer destination ${suffix}`,
    },
  });
  expect(targetResponse.ok(), await targetResponse.text()).toBe(true);
  const { organization: target } = await targetResponse.json();
  const sql = new Client({ connectionString: databaseUrl() });
  await sql.connect();
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  try {
    const [admin, member] = (
      await sql.query('select id,email from "user" where email=any($1)', [
        [e2eUser.email, e2eMember.email],
      ])
    ).rows.sort((a, b) => a.email.localeCompare(b.email));
    const source = (
      await sql.query("select organization_id from workspaces where id=$1", [
        project.id,
      ])
    ).rows[0].organization_id;
    const agentId = crypto.randomUUID(),
      providerId = crypto.randomUUID(),
      conversationId = crypto.randomUUID(),
      teamId = crypto.randomUUID();
    await page.request.post("/api/workspace/iam", {
      data: {
        action: "addMember",
        workspaceId: project.id,
        email: e2eMember.email,
      },
    });
    await sql.query(
      "insert into teams(id,organization_id,name,slug,created_by_user_id) values($1,$2,'Transfer team','transfer-team',$3)",
      [teamId, source, admin.id],
    );
    await sql.query("insert into team_members(team_id,user_id) values($1,$2)", [
      teamId,
      member.id,
    ]);
    await sql.query(
      "insert into role_bindings(principal_type,principal_id,role_id,resource_type,resource_id,created_by_user_id) select 'group',$1,id,'workspace',$2,$3 from roles where name='workspace.viewer' and is_system=true",
      [teamId, project.id, admin.id],
    );
    await sql.query(
      "insert into ai_providers(id,workspace_id,kind,name,auth_type,encrypted_api_key,created_by_user_id) values($1,$2,'openai-compatible','Transfer provider','bearer','preserved-encrypted-secret',$3)",
      [providerId, project.id, admin.id],
    );
    await sql.query(
      "insert into agents(id,workspace_id,name,slug,visibility,created_by_user_id) values($1,$2,'Transfer assistant','transfer-agent','organization',$3)",
      [agentId, project.id, admin.id],
    );
    await sql.query(
      "insert into conversations(id,workspace_id,agent_id,user_id,title) values($1,$2,$3,$4,'Personal transfer history')",
      [conversationId, project.id, agentId, member.id],
    );
    await loginWithCredentials(memberPage, e2eMember);
    const denied = await memberPage.request.post(
      "/api/workspace/iam/projects/transfer",
      {
        data: {
          action: "preview",
          sourceWorkspaceId: project.id,
          targetOrganizationId: target.id,
        },
      },
    );
    expect(denied.status()).toBe(403);
    const before = await page.request.get(
      `/api/workspace/iam/projects/transfer?sourceWorkspaceId=${project.id}`,
    );
    expect(before.ok(), await before.text()).toBe(true);
    expect((await before.json()).destinations).toContainEqual({
      id: target.id,
      name: target.name,
    });
    const preview = await page.request.post(
      "/api/workspace/iam/projects/transfer",
      {
        data: {
          action: "preview",
          sourceWorkspaceId: project.id,
          targetOrganizationId: target.id,
        },
      },
    );
    expect(preview.ok(), await preview.text()).toBe(true);
    const plan = await preview.json();
    expect(plan.counts).toMatchObject({ projects: 1, teams: 1 });
    await sql.query("update workspaces set name=name||' edited' where id=$1", [
      project.id,
    ]);
    const stale = await page.request.post(
      "/api/workspace/iam/projects/transfer",
      {
        data: {
          action: "execute",
          sourceWorkspaceId: project.id,
          targetOrganizationId: target.id,
          confirmationToken: plan.confirmationToken,
        },
      },
    );
    expect(stale.status()).toBe(409);
    // Finish through the real project settings dialog.
    await page.goto("/en/members");
    await page
      .getByRole("combobox", { name: "Active project", exact: true })
      .click();
    await page
      .getByRole("option", { name: `${project.name} edited`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Change organization", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Destination organization", exact: true })
      .click();
    await page.getByRole("option", { name: target.name, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Review transfer", exact: true })
      .click();
    await expect(dialog.getByText(/Active project members join/)).toBeVisible();
    await dialog
      .getByRole("button", { name: "Transfer project", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("combobox", { name: "Organization", exact: true }),
    ).toContainText(target.name);
    expect(
      (
        await sql.query("select organization_id from workspaces where id=$1", [
          project.id,
        ])
      ).rows[0].organization_id,
    ).toBe(target.id);
    expect(
      (
        await sql.query(
          "select workspace_id,encrypted_api_key from ai_providers where id=$1",
          [providerId],
        )
      ).rows[0],
    ).toEqual({
      workspace_id: project.id,
      encrypted_api_key: "preserved-encrypted-secret",
    });
    expect(
      (
        await sql.query(
          "select workspace_id,user_id from conversations where id=$1",
          [conversationId],
        )
      ).rows[0],
    ).toEqual({ workspace_id: project.id, user_id: member.id });
    expect(
      (
        await sql.query("select organization_id from teams where id=$1", [
          teamId,
        ])
      ).rows[0].organization_id,
    ).toBe(source);
    expect(
      (
        await sql.query(
          "select t.id from teams t join team_members tm on tm.team_id=t.id where t.organization_id=$1 and tm.user_id=$2",
          [target.id, member.id],
        )
      ).rowCount,
    ).toBe(1);
    const visible = await memberPage.request.get(
      `/api/workspace/agents?workspaceId=${project.id}`,
    );
    expect(visible.ok(), await visible.text()).toBe(true);
    expect(
      (await visible.json()).agents.some(
        (a: { id: string }) => a.id === agentId,
      ),
    ).toBe(true);
    const history = await memberPage.request.get(
      `/api/workspace/conversations?workspaceId=${project.id}`,
    );
    expect(history.ok(), await history.text()).toBe(true);
    expect(await history.text()).toContain(conversationId);
    // Remove the deliberately fake secret before other provider health tests.
    await sql.query("delete from ai_providers where id=$1", [providerId]);
  } finally {
    await memberContext.close();
    const sourceRows = await sql.query(
      "select id from organizations where name=$1",
      [`Transfer source ${suffix}`],
    );
    await sql.query("delete from organizations where id=any($1)", [
      [target.id, ...sourceRows.rows.map((r) => r.id)],
    ]);
    await sql.end();
  }
});
