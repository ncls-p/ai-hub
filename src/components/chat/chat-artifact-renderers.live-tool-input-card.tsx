"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";

import { type CodeSandboxInputPreview } from "@/components/chat/chat-message-rendering-utils";
import { ToolStateIcon } from "@/components/chat/tool-state-icon";
import { cn } from "@/lib/utils";
import { MAX_LIVE_TOOL_INPUT_CHARS } from "./chat-artifact-renderers.max-live-tool-input-chars";

export function LiveToolInputCard({
  toolName,
  inputText,
  sandboxInput,
  embedded = false,
}: {
  toolName: string;
  inputText: string;
  sandboxInput?: CodeSandboxInputPreview | null;
  embedded?: boolean;
}) {
  const t = useTranslations("chat.artifacts");
  const codeRef = useRef<HTMLPreElement>(null);
  const followCode = useRef(true);
  const visibleInputText = useMemo(() => {
    if (inputText.length <= MAX_LIVE_TOOL_INPUT_CHARS) return inputText;
    return `…${inputText.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${inputText.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
  }, [inputText]);
  const visibleCode = useMemo(() => {
    const code = sandboxInput?.code ?? "";
    if (!code) return "";
    if (code.length <= MAX_LIVE_TOOL_INPUT_CHARS) return code;
    return `…${code.length - MAX_LIVE_TOOL_INPUT_CHARS} earlier characters hidden while streaming\n${code.slice(-MAX_LIVE_TOOL_INPUT_CHARS)}`;
  }, [sandboxInput?.code]);
  const displayText = visibleCode || visibleInputText;

  useEffect(() => {
    const element = codeRef.current;
    if (element && followCode.current) element.scrollTop = element.scrollHeight;
  }, [displayText]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-primary/[0.055] text-xs shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent),0_14px_28px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
        embedded &&
          "rounded-xl border border-border/55 bg-background/45 shadow-none",
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border/40 px-2.5 py-1.5">
        {!embedded ? <ToolStateIcon state="pending" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{toolName}</p>
          <p
            className="t-shimmer truncate text-[11px] text-muted-foreground"
            data-text={
              sandboxInput
                ? t("writingCode", {
                    language: sandboxInput.language ?? "sandbox",
                  })
                : t("writingInput")
            }
          >
            {sandboxInput
              ? t("writingCode", {
                  language: sandboxInput.language ?? "sandbox",
                })
              : t("writingInput")}
          </p>
        </div>
        <span
          className="streaming-thinking__dots mr-2 text-primary"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </span>
      </div>
      {sandboxInput ? (
        <div className="flex flex-wrap gap-2 border-b border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
          {sandboxInput.files.length > 0 ? (
            <span>{t("inputFiles", { count: sandboxInput.files.length })}</span>
          ) : null}
          {sandboxInput.attachments.length > 0 ? (
            <span>
              {t("attachments", { count: sandboxInput.attachments.length })}
            </span>
          ) : null}
        </div>
      ) : null}
      <pre
        ref={codeRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followCode.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            32;
        }}
        className="max-h-72 overflow-auto bg-muted/20 p-3 font-mono text-[11px] leading-4 text-muted-foreground whitespace-pre-wrap"
      >
        {displayText || t("waitingInput")}
      </pre>
    </div>
  );
}
