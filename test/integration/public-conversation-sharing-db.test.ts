import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  conversations,
  messages,
  messageParts,
} from "@/server/infrastructure/db/schema";
import {
  getPublicConversation,
  getPublicConversationFileAccess,
} from "@/modules/chat/public-conversation-sharing";
import {
  canReadConversationAsset,
  canReadSharedConversationAsset,
} from "@/modules/chat/conversation-asset-access";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { upsertConversationShare } from "@/modules/chat/conversation-sharing";
import { importResourcePackage } from "@/modules/resource-package/import";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("public conversation grants and import atomicity", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("requires active public links and explicit files opt-in, and scopes references to that conversation", async () => {
    const { agent, version } = await fixture.makeAgent("Public links");
    const publicShareId = randomUUID(),
      assetId = randomUUID(),
      projectId = randomUUID();
    const [conversation] = await db
      .insert(conversations)
      .values({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        agentVersionId: version.id,
        userId: fixture.owner,
        title: "Public",
        publicShareId,
        publicSharedAt: new Date(),
      })
      .returning();
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "user",
        status: "completed",
      })
      .returning();
    await db.insert(messageParts).values([
      {
        messageId: message.id,
        type: "file",
        metadataJson: { kind: "chat_file", id: assetId },
      },
      {
        messageId: message.id,
        type: "file",
        metadataJson: { kind: "code_workspace_artifact", projectId },
      },
    ]);
    const access = () =>
      getPublicConversationFileAccess(publicShareId, assetId, "attachment");
    expect(await getPublicConversation(publicShareId)).toMatchObject({
      id: conversation.id,
      includeFiles: false,
    });
    expect(await access()).toBeNull();
    await db
      .update(conversations)
      .set({ publicShareIncludesFiles: true })
      .where(eq(conversations.id, conversation.id));
    expect(await access()).toMatchObject({ id: conversation.id });
    expect(
      await getPublicConversationFileAccess(
        publicShareId,
        projectId,
        "code_workspace",
      ),
    ).toMatchObject({ id: conversation.id });
    expect(
      await getPublicConversationFileAccess(
        publicShareId,
        assetId,
        "code_workspace",
      ),
    ).toBeNull();
    expect(
      await getPublicConversationFileAccess(
        publicShareId,
        randomUUID(),
        "attachment",
      ),
    ).toBeNull();
    expect(
      await getPublicConversationFileAccess(
        randomUUID(),
        assetId,
        "attachment",
      ),
    ).toBeNull();
    for (const [disabled, reset] of [
      [{ expiresAt: new Date(0) }, { expiresAt: null }],
      [{ archivedAt: new Date() }, { archivedAt: null }],
      [{ isEphemeral: true }, { isEphemeral: false }],
      [{ publicSharedAt: null }, { publicSharedAt: new Date() }],
    ]) {
      await db
        .update(conversations)
        .set(disabled)
        .where(eq(conversations.id, conversation.id));
      expect(await getPublicConversation(publicShareId)).toBeNull();
      expect(await access()).toBeNull();
      await db
        .update(conversations)
        .set(reset)
        .where(eq(conversations.id, conversation.id));
    }
    const asset = {
      id: assetId,
      workspaceId: fixture.workspaceId,
      createdByUserId: fixture.owner,
    };
    expect(
      await canReadConversationAsset(asset, fixture.owner, "attachment"),
    ).toBe(true);
    await upsertConversationShare({
      conversation,
      ownerUserId: fixture.owner,
      targetEmail: `${fixture.member}@example.test`,
      canContinue: false,
      continuationMode: "fork",
    });
    const auth = {
      type: "api_key" as const,
      apiKeyId: randomUUID(),
      workspaceId: fixture.workspaceId,
      userId: fixture.member,
      scopes: [],
    };
    expect(
      await runWithRequestAuth(auth, () =>
        canReadSharedConversationAsset(asset, fixture.member, "attachment"),
      ),
    ).toBe(false);
    expect(
      await runWithRequestAuth(
        { ...auth, scopes: ["conversations.viewOwn"] },
        () =>
          canReadSharedConversationAsset(asset, fixture.member, "attachment"),
      ),
    ).toBe(true);
    expect(
      await runWithRequestAuth(
        { ...auth, workspaceId: fixture.destinationId, scopes: ["*"] },
        () =>
          canReadSharedConversationAsset(asset, fixture.member, "attachment"),
      ),
    ).toBe(false);
  });

  it("rolls back dependencies when PostgreSQL refuses the final agent creation", async () => {
    // Inject a real database write failure after child rows have been inserted.
    // The trigger is restricted to this disposable test workspace and removed in finally.
    const trigger = `test_import_failure_${randomUUID().replaceAll("-", "")}`;
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.workspace_id = '${fixture.destinationId}'::uuid THEN RAISE EXCEPTION 'Test write failure'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON agents FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      ),
    );
    const name = `Rollback skill ${randomUUID()}`;
    try {
      const manifest = {
        type: "agent",
        name: "Atomic import",
        agent: {},
        bundledResources: {
          skills: [
            {
              name,
              skill: {
                markdownFiles: [{ path: "SKILL.md", content: "Rollback" }],
              },
            },
          ],
          mcpPresets: [],
          customTools: [],
        },
      };
      await expect(
        importResourcePackage({
          workspaceId: fixture.destinationId,
          userId: fixture.owner,
          package: { format: "maiah.resource", schemaVersion: 1, manifest },
        }),
      ).rejects.toThrow();
      expect(
        await db.select().from(agentSkills).where(eq(agentSkills.name, name)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(agents)
          .where(eq(agents.workspaceId, fixture.destinationId)),
      ).toEqual([]);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON agents`));
      await db.execute(sql.raw(`DROP FUNCTION ${trigger}()`));
    }
  });
});
