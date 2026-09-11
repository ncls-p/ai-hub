import { getChatAutomationConfig } from "@/modules/chat/automation.chat-automation-config";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  organizations,
  appSettings,
  aiModels,
  aiProviders,
  resourceOrganizationShares,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { createOrganizationOnly } from "@/modules/organization/organization-management";
import {
  getChatAutomationAdminState,
  setChatAutomationConfig,
  validateChatAutomationConfig,
} from "@/modules/chat/automation";
import { setResourceOrganizations } from "@/modules/iam/organization-resource-sharing";
import {
  getSidebarNavConfig,
  setSidebarNavConfig,
  deleteSidebarNavConfig,
} from "@/modules/navigation/sidebar-config.server";
import { resolveRuntimeModel } from "@/modules/chat/automation.resolve-runtime-model";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("organization customization scope and model revocation", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let recipient: string;
  let providerId: string;
  let modelId: string;
  let siblingId: string;
  beforeAll(async () => {
    f = await createSharingFixture();
    recipient = (
      await createOrganizationOnly(f.outsider, "Empty customization recipient")
    ).id;
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: f.workspaceId,
        name: "Organization model",
        kind: "openai-compatible",
        authType: "bearer",
        createdById: f.owner,
      })
      .returning();
    providerId = provider.id;
    const models = await db
      .insert(aiModels)
      .values(
        ["shared", "private"].map((modelId) => ({
          providerId,
          modelId,
          enabled: true,
        })),
      )
      .returning();
    [modelId, siblingId] = models.map((m) => m.id);
  }, 60000);
  afterAll(async () => {
    if (!f) return;
    await db
      .delete(resourceOrganizationShares)
      .where(eq(resourceOrganizationShares.createdById, f.owner));
    await db.delete(appSettings).where(
      inArray(
        appSettings.key,
        [f.organizationId, recipient].flatMap((id) => [
          `chatAutomation:organization:${id}`,
          `sidebarNavigation:organization:${id}`,
        ]),
      ),
    );
    await db.delete(organizations).where(eq(organizations.id, recipient));
    await f.cleanup();
  });
  it("stores independent automation and navigation settings including an empty organization", async () => {
    const config = {
      enabled: false,
      generateTitles: false,
      generateSuggestions: false,
    };
    await setChatAutomationConfig(config, f.owner, f.organizationId);
    expect(await getChatAutomationConfig(f.organizationId)).toEqual(config);
    expect(await getChatAutomationConfig(recipient)).toMatchObject({
      generateTitles: true,
      generateSuggestions: true,
    });
    await setSidebarNavConfig(
      { items: [{ id: "/chat", visible: true }] },
      f.owner,
      f.organizationId,
    );
    expect(await getSidebarNavConfig(recipient)).toBeNull();
    await deleteSidebarNavConfig(recipient);
    expect(await getSidebarNavConfig(f.organizationId)).not.toBeNull();
  });
  it("only offers own or explicitly shared models, and rechecks availability before using credentials", async () => {
    const config = {
      enabled: true,
      generateTitles: true,
      generateSuggestions: true,
      providerId,
      modelId,
    };
    expect(
      (await getChatAutomationAdminState(f.organizationId)).models.map(
        (m) => m.id,
      ),
    ).toEqual(expect.arrayContaining([modelId, siblingId]));
    expect((await getChatAutomationAdminState(recipient)).models).toHaveLength(
      0,
    );
    expect((await validateChatAutomationConfig(config, recipient)).ok).toBe(
      false,
    );
    // Sharing one model must not expose its provider's other models.
    await setResourceOrganizations({
      actorUserId: f.owner,
      resourceType: "model",
      resourceId: modelId,
      organizationIds: [recipient],
      includeDependencies: true,
    });
    expect(
      (await getChatAutomationAdminState(recipient)).models.map((m) => m.id),
    ).toEqual([modelId]);
    expect((await validateChatAutomationConfig(config, recipient)).ok).toBe(
      true,
    );
    expect(
      (
        await validateChatAutomationConfig(
          { ...config, modelId: siblingId },
          recipient,
        )
      ).ok,
    ).toBe(false);
    await setChatAutomationConfig(config, f.outsider, recipient);
    await setResourceOrganizations({
      actorUserId: f.owner,
      resourceType: "model",
      resourceId: modelId,
      organizationIds: [],
      includeDependencies: true,
    });
    expect(
      (
        await resolveRuntimeModel(
          await getChatAutomationConfig(recipient),
          recipient,
        )
      ).ok,
    ).toBe(false);
    expect((await getChatAutomationAdminState(recipient)).models).toHaveLength(
      0,
    );
  });
});
