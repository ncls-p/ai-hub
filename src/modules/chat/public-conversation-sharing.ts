import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  conversations,
  messages,
  messageParts,
} from "@/server/infrastructure/db/schema";

export async function getPublicConversation(publicShareId: string) {
  const [conversation] = await db
    .select({
      id: conversations.id,
      workspaceId: conversations.workspaceId,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      agentName: agents.name,
      includeFiles: conversations.publicShareIncludesFiles,
    })
    .from(conversations)
    .innerJoin(agents, eq(agents.id, conversations.agentId))
    .where(
      and(
        eq(conversations.publicShareId, publicShareId),
        isNotNull(conversations.publicSharedAt),
        eq(conversations.status, "active"),
        eq(conversations.isEphemeral, false),
        isNull(conversations.archivedAt),
        or(
          isNull(conversations.expiresAt),
          gt(conversations.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);
  return conversation ?? null;
}

export function publicFilePart(content: string, publicShareId: string) {
  try {
    const metadata = JSON.parse(content);
    const kind =
      metadata.kind === "code_workspace_artifact"
        ? "code_workspace"
        : ["chat_image", "chat_file"].includes(metadata.kind)
          ? "attachment"
          : null;
    const id = kind === "code_workspace" ? metadata.projectId : metadata.id;
    if (!kind || !z.uuid().safeParse(id).success) return null;
    const name = kind === "code_workspace" ? metadata.title : metadata.fileName;
    return {
      type: "file" as const,
      content: typeof name === "string" ? name : "Download",
      downloadUrl: `/api/public/conversations/${publicShareId}/files/${id}?kind=${kind}`,
    };
  } catch {
    return null;
  }
}

/** Public file access is scoped to one active link and requires explicit opt-in. */
export async function getPublicConversationFileAccess(
  publicShareId: string,
  assetId: string,
  kind: "attachment" | "code_workspace",
) {
  const conversation = await getPublicConversation(publicShareId);
  if (!conversation?.includeFiles) return null;
  const [reference] = await db
    .select({ id: messageParts.id })
    .from(messageParts)
    .innerJoin(messages, eq(messages.id, messageParts.messageId))
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messageParts.type, "file"),
        or(eq(messages.role, "user"), eq(messages.role, "assistant")),
        kind === "attachment"
          ? sql`${messageParts.metadataJson}->>'id' = ${assetId} and ${messageParts.metadataJson}->>'kind' in ('chat_file', 'chat_image')`
          : sql`${messageParts.metadataJson}->>'projectId' = ${assetId} and ${messageParts.metadataJson}->>'kind' = 'code_workspace_artifact'`,
      ),
    )
    .limit(1);
  return reference ? conversation : null;
}
