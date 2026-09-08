import { getConversationMessages } from "@/modules/agent/use-cases";
import {
  getPublicConversation,
  publicFilePart,
} from "@/modules/chat/public-conversation-sharing";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicShareId: string }> },
) {
  const parsed = z.object({ publicShareId: z.uuid() }).safeParse(await params);
  const conversation = parsed.success
    ? await getPublicConversation(parsed.data.publicShareId)
    : null;
  if (!conversation || !parsed.success)
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  const messages = (await getConversationMessages(conversation.id))
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: new Date(message.createdAt).toISOString(),
      parts: message.parts.flatMap((part) => {
        if (part.type === "text")
          return [{ type: part.type, content: part.content }];
        if (part.type !== "file" || !conversation.includeFiles) return [];
        const file = publicFilePart(part.content, parsed.data.publicShareId);
        return file ? [file] : [];
      }),
    }));
  return NextResponse.json(
    {
      conversation: {
        title: conversation.title,
        agentName: conversation.agentName,
        updatedAt: conversation.updatedAt,
      },
      messages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
