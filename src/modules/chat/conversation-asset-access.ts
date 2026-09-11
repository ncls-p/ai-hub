import { getRequestAuthContext } from "@/modules/auth/request-auth-context";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import {
  hasResourcePermissionForRequest,
  hasWorkspacePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import { db } from "@/server/infrastructure/db";
import {
  conversationShares,
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";

type ConversationAsset = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
};

/** Resolve access from persisted file parts, never from a client-supplied URL.
 * Copies retain their own references; revocation removes access to the source.
 */
export async function canReadSharedConversationAsset(
  asset: ConversationAsset,
  userId: string,
  kind: "attachment" | "code_workspace",
) {
  const personal = getRequestAuthContext()?.type !== "api_key";
  if (
    !personal &&
    !(await isWorkspaceMemberForRequest(userId, asset.workspaceId))
  )
    return false;

  const references = await db
    .selectDistinct({ id: conversations.id })
    .from(messageParts)
    .innerJoin(messages, eq(messages.id, messageParts.messageId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(
      conversationShares,
      and(
        eq(conversationShares.conversationId, conversations.id),
        eq(conversationShares.sharedWithUserId, userId),
      ),
    )
    .where(
      and(
        eq(messageParts.type, "file"),
        kind === "attachment"
          ? sql`${messageParts.metadataJson}->>'id' = ${asset.id}
              and ${messageParts.metadataJson}->>'kind' in ('chat_file', 'chat_image')`
          : sql`${messageParts.metadataJson}->>'projectId' = ${asset.id}
              and ${messageParts.metadataJson}->>'kind' = 'code_workspace_artifact'`,
        eq(conversations.workspaceId, asset.workspaceId),
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
        or(
          isNull(conversations.expiresAt),
          gt(conversations.expiresAt, new Date()),
        ),
        or(
          eq(conversations.userId, userId),
          eq(conversationShares.sharedWithUserId, userId),
        ),
      ),
    );
  if (personal) return references.length > 0;
  for (const reference of references) {
    if (
      await hasResourcePermissionForRequest(
        userId,
        asset.workspaceId,
        "conversations.viewOwn",
        "conversation",
        reference.id,
      )
    )
      return true;
  }
  return false;
}

export async function canReadConversationAsset(
  asset: ConversationAsset,
  userId: string,
  kind: "attachment" | "code_workspace",
) {
  if (asset.createdByUserId === userId) {
    if (getRequestAuthContext()?.type !== "api_key") return true;
    return hasWorkspacePermissionForRequest(
      userId,
      asset.workspaceId,
      "agents.chat",
    );
  }
  return canReadSharedConversationAsset(asset, userId, kind);
}
