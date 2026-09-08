"use client";

import { BotIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";

type Payload = {
  conversation: {
    title: string;
    agentName: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    parts: Array<{ type: string; content: string; downloadUrl?: string }>;
  }>;
};

export function PublicConversation({
  publicShareId,
}: {
  publicShareId: string;
}) {
  const t = useTranslations("chat.publicConversation");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/conversations/${publicShareId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("not_found");
        setPayload((await response.json()) as Payload);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setNotFound(true);
      });
    return () => controller.abort();
  }, [publicShareId]);

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center justify-center p-6 text-center">
        <p>{t("notFound")}</p>
      </main>
    );
  }
  if (!payload) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center justify-center p-6 text-sm text-muted-foreground">
        {t("loading")}
      </main>
    );
  }
  return (
    <main className="min-h-svh bg-muted/20 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 rounded-2xl border bg-card p-6 shadow-[var(--surface-shadow)]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("sharedBy", { agent: payload.conversation.agentName })}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-editorial)] text-3xl font-semibold tracking-tight">
            {payload.conversation.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("readOnly")}</p>
        </header>
        <div className="flex flex-col gap-4">
          {payload.messages.map((message) => (
            <article
              key={message.id}
              className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {message.role === "assistant" ? (
                  <BotIcon aria-hidden="true" />
                ) : (
                  <UserIcon aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {message.role === "assistant"
                    ? payload.conversation.agentName
                    : t("user")}
                </p>
                {message.parts
                  .filter((part) => part.content.trim().length > 0)
                  .map((part, index) => (
                    <div key={index}>
                      {part.type === "file" && part.downloadUrl ? (
                        <a
                          href={part.downloadUrl}
                          className="block break-words py-2 text-primary underline underline-offset-4"
                        >
                          {t("download", { name: part.content })}
                        </a>
                      ) : (
                        <ChatMarkdown>{part.content}</ChatMarkdown>
                      )}
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
