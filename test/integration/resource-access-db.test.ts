import { storage } from "@/server/infrastructure/storage";
import { loadAuthorizedConversationAttachments } from "@/app/api/workspace/[agentId]/chat/route.orchestrator-attachments";
import { canReadSharedConversationAsset } from "@/modules/chat/conversation-asset-access";
import {
  forkSharedConversation,
  upsertConversationShare,
} from "@/modules/chat/conversation-sharing";
import { replaceDirectResourceSharing } from "@/modules/iam/resource-direct-sharing";
import { db } from "@/server/infrastructure/db";
import {
  agentSkillBindings,
  agentSkills,
  conversations,
  conversationShares,
  messageParts,
  messages,
  roleBindings,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createSharingFixture } from "./resource-sharing-db.fixture";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("resource package round trips and sharing on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("keeps dependencies available until every independent direct share is revoked", async () => {
    const first = await fixture.makeAgent("First shared assistant");
    const second = await fixture.makeAgent("Second shared assistant");
    const [skill] = await db
      .insert(agentSkills)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Common dependency",
        markdownFilesJson: [{ path: "SKILL.md", content: "Shared" }],
      })
      .returning();
    await db.insert(agentSkillBindings).values(
      [first, second].map(({ version }) => ({
        agentVersionId: version.id,
        skillId: skill.id,
      })),
    );
    const share = (resourceId: string, userIds: string[]) =>
      replaceDirectResourceSharing({
        actorUserId: fixture.owner,
        workspaceId: fixture.workspaceId,
        resourceType: "agent",
        resourceId,
        userIds,
      });
    await share(first.agent.id, [fixture.member]);
    await share(second.agent.id, [fixture.member]);
    const bindings = () =>
      db
        .select()
        .from(roleBindings)
        .where(
          and(
            eq(roleBindings.resourceId, skill.id),
            eq(roleBindings.principalId, fixture.member),
          ),
        );
    expect(
      (await bindings()).map((binding) => binding.grantSource).sort(),
    ).toEqual([`agent:${first.agent.id}`, `agent:${second.agent.id}`].sort());
    await share(first.agent.id, []);
    expect(await bindings()).toMatchObject([
      { grantSource: `agent:${second.agent.id}` },
    ]);
    await share(second.agent.id, []);
    expect(await bindings()).toEqual([]);
  });

  it("checks persisted attachment and code references, revocation, forks, workspace and expiry", async () => {
    const { agent, version } = await fixture.makeAgent("Chat attachments");
    const [conversation] = await db
      .insert(conversations)
      .values({
        workspaceId: fixture.workspaceId,
        agentId: agent.id,
        agentVersionId: version.id,
        userId: fixture.owner,
        title: "Shared files",
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
    const asset = {
      id: randomUUID(),
      workspaceId: fixture.workspaceId,
      createdByUserId: fixture.owner,
    };
    const project = { ...asset, id: randomUUID() };
    const attachment = {
      ...asset,
      kind: "chat_file",
      fileName: "shared.txt",
      mimeType: "text/plain",
      size: 10,
      hash: "fixture-hash",
      url: `/api/workspace/chat-attachments/${asset.id}`,
      category: "text",
      extractionStatus: "readable",
      extractedTextChars: 10,
      objectKey: "fixture/original",
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(storage, "download").mockResolvedValue(
      Buffer.from(JSON.stringify(attachment)),
    );
    const loadForContinuation = () =>
      loadAuthorizedConversationAttachments({
        conversationId: conversation.id,
        workspaceId: fixture.workspaceId,
        userId: fixture.member,
        current: [],
      });
    await db.insert(messageParts).values([
      {
        messageId: message.id,
        type: "file",
        metadataJson: attachment,
      },
      {
        messageId: message.id,
        type: "file",
        metadataJson: {
          kind: "code_workspace_artifact",
          projectId: project.id,
        },
      },
    ]);
    const read = () =>
      canReadSharedConversationAsset(asset, fixture.member, "attachment");
    expect(await read()).toBe(false);
    expect(await loadForContinuation()).toEqual([]);
    await upsertConversationShare({
      conversation,
      ownerUserId: fixture.owner,
      targetEmail: `${fixture.member}@example.test`,
      canContinue: true,
      continuationMode: "fork",
    });
    expect(await read()).toBe(true);
    expect(await loadForContinuation()).toMatchObject([
      { id: asset.id, fileName: "shared.txt" },
    ]);
    expect(
      await canReadSharedConversationAsset(
        project,
        fixture.member,
        "code_workspace",
      ),
    ).toBe(true);
    expect(
      await canReadSharedConversationAsset(
        { ...asset, id: randomUUID() },
        fixture.member,
        "attachment",
      ),
    ).toBe(false);
    expect(
      await canReadSharedConversationAsset(
        { ...asset, workspaceId: fixture.destinationId },
        fixture.member,
        "attachment",
      ),
    ).toBe(false);
    expect(
      await canReadSharedConversationAsset(
        asset,
        fixture.outsider,
        "attachment",
      ),
    ).toBe(false);
    await db
      .update(conversations)
      .set({ expiresAt: new Date(0) })
      .where(eq(conversations.id, conversation.id));
    expect(await read()).toBe(false);
    await db
      .update(conversations)
      .set({ expiresAt: null, archivedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    expect(await read()).toBe(false);
    await db
      .update(conversations)
      .set({ archivedAt: null })
      .where(eq(conversations.id, conversation.id));
    const fork = await forkSharedConversation(conversation, fixture.member);
    await db
      .delete(conversationShares)
      .where(eq(conversationShares.conversationId, conversation.id));
    expect(await read()).toBe(true);
    await db.delete(conversations).where(eq(conversations.id, fork.id));
    expect(await read()).toBe(false);
    expect(await loadForContinuation()).toEqual([]);
  });
});
