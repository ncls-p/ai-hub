import {
  getChatAttachment,
  isChatFileAttachment,
  isChatImageAttachment,
  publicChatAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";
import { canReadConversationAsset } from "@/modules/chat/conversation-asset-access";
import { db } from "@/server/infrastructure/db";
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";

const maximumAvailableConversationAttachments = 64;

export async function loadAuthorizedConversationAttachments(input: {
  conversationId: string;
  workspaceId: string;
  userId: string;
  current: ChatAttachment[];
}) {
  const rows = await db
    .select({ metadata: messageParts.metadataJson })
    .from(messageParts)
    .innerJoin(messages, eq(messageParts.messageId, messages.id))
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.role, "user"),
        eq(messageParts.type, "file"),
      ),
    )
    .orderBy(desc(messages.createdAt), messageParts.sortOrder)
    .limit(maximumAvailableConversationAttachments);

  const attachmentIds = new Set(
    input.current.map((attachment) => attachment.id),
  );
  for (const row of rows) {
    if (
      isChatFileAttachment(row.metadata) ||
      isChatImageAttachment(row.metadata)
    )
      attachmentIds.add(row.metadata.id);
  }

  const currentById = new Map(
    input.current.map((attachment) => [attachment.id, attachment]),
  );
  const available = await Promise.all(
    [...attachmentIds].map(async (attachmentId) => {
      const current = currentById.get(attachmentId);
      if (current) return current;
      try {
        const metadata = await getChatAttachment(attachmentId);
        if (
          metadata.workspaceId !== input.workspaceId ||
          !(await canReadConversationAsset(
            metadata,
            input.userId,
            "attachment",
          ))
        )
          return null;
        return publicChatAttachment(metadata);
      } catch {
        return null;
      }
    }),
  );
  return available.filter((attachment): attachment is ChatAttachment =>
    Boolean(attachment),
  );
}
