"use client";

import { PaperclipIcon, SendIcon, SquareIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";

import { Link } from "@/i18n/navigation";
import type { ChatComposerControls } from "@/components/chat/chat-layout.chat-composer-controls-context";
import { ChatTodoListDock } from "@/components/chat/chat-todo-list-card";
import { AttachmentGroup } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsTextClamped } from "@/hooks/use-is-text-clamped";
import { cn } from "@/lib/utils";
import { ChatComposerMediaControls } from "./chat-composer-media-controls";
import { preserveComposerTextFocus } from "./chat-composer-mobile";
import { useComposerDictation } from "./chat-composer.use-dictation";
import {
  AttachmentPreview,
  ChatComposerProps,
} from "./chat-composer.queued-chat-message";

interface ChatComposerBodyProps {
  input: string;
  canChat: boolean;
  needsSetup: boolean;
  sending: boolean;
  maxInputCharacters?: number;
  attachments: NonNullable<ChatComposerProps["attachments"]>;
  todoList: ChatComposerProps["todoList"];
  centered: boolean;
  promptSuggestions: string[];
  uploadingAttachment: boolean;
  controls: ChatComposerControls;
  onInputChange: ChatComposerProps["onInputChange"];
  onStop: ChatComposerProps["onStop"];
  onRemoveAttachment: ChatComposerProps["onRemoveAttachment"];
  onEditText?: (id: string, content: string) => Promise<boolean>;
  onPromptSuggestionClick: ChatComposerProps["onPromptSuggestionClick"];
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

function PromptSuggestionButton({
  index,
  suggestion,
  onClick,
}: {
  index: number;
  suggestion: string;
  onClick?: (suggestion: string) => void;
}) {
  const { ref, clamped } = useIsTextClamped<HTMLButtonElement>();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          className="group min-h-10 truncate rounded-xl border border-border/70 bg-card/55 px-3 text-left text-xs text-muted-foreground transition-[border-color,background-color,color,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => onClick?.(suggestion)}
        >
          <span className="mr-2 font-mono text-[0.62rem] text-primary">
            {String(index + 1).padStart(2, "0")}
          </span>
          {suggestion}
        </button>
      </TooltipTrigger>
      {clamped ? (
        <TooltipContent side="top" className="max-w-72">
          {suggestion}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

function resizeComposerTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";

  const maxHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
  const contentHeight = element.scrollHeight;
  const nextHeight = Number.isFinite(maxHeight)
    ? Math.min(contentHeight, maxHeight)
    : contentHeight;

  element.style.height = `${nextHeight}px`;
  element.style.overflowY = contentHeight > nextHeight ? "auto" : "hidden";
}

export function ChatComposerBody(props: ChatComposerBodyProps) {
  const t = useTranslations("chat.composer");
  const locale = useLocale();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasSendingRef = useRef(false);
  const { listening, toggleDictation } = useComposerDictation({
    enabled: props.canChat && !props.needsSetup,
    value: props.input,
    onTranscript: props.onInputChange,
  });

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    if (props.sending && !wasSendingRef.current) element.blur();
    wasSendingRef.current = props.sending;

    const resize = () => resizeComposerTextarea(element);
    resize();
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, [props.needsSetup, props.input, props.sending]);
  return (
    <div className="@container/composer relative mx-auto w-full min-w-0 max-w-4xl">
      {props.todoList ? (
        <div className="mb-2">
          <ChatTodoListDock todoList={props.todoList} />
        </div>
      ) : null}
      {props.attachments.length > 0 ? (
        <div className="mb-2 rounded-2xl border border-border/55 bg-card/72 p-2 shadow-[var(--surface-shadow)]">
          <div className="flex min-h-8 items-center gap-2 px-1 pb-1.5">
            <PaperclipIcon
              className="size-3.5 text-primary"
              aria-hidden="true"
            />
            <span
              className="text-xs font-medium text-foreground"
              aria-live="polite"
            >
              {t("attachedFiles", { count: props.attachments.length })}
            </span>
          </div>
          <AttachmentGroup className="grid snap-none grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-2 overflow-visible overscroll-auto py-0">
            {props.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                onRemove={props.onRemoveAttachment}
                disabled={
                  props.sending || props.uploadingAttachment || !props.canChat
                }
                onEditText={props.onEditText}
                onRestoreText={
                  props.onRemoveAttachment
                    ? (id, content) => {
                        props.onInputChange(
                          [props.input, content].filter(Boolean).join("\n\n"),
                        );
                        props.onRemoveAttachment?.(id);
                      }
                    : undefined
                }
              />
            ))}
          </AttachmentGroup>
        </div>
      ) : null}
      <div
        className="composer-box overflow-hidden rounded-3xl"
        onPointerDownCapture={preserveComposerTextFocus}
      >
        <div className="px-3 pt-2 sm:px-4 sm:pt-2.5">
          <Textarea
            ref={textareaRef}
            aria-label={t("messageLabel")}
            name="message"
            autoComplete="off"
            value={props.input}
            maxLength={props.maxInputCharacters}
            onChange={(event) => props.onInputChange(event.target.value)}
            onPaste={props.onPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              props.needsSetup
                ? t("setupPlaceholder")
                : props.sending
                  ? t("queuePlaceholder")
                  : t("messagePlaceholder")
            }
            disabled={props.needsSetup}
            rows={1}
            className="scrollbar-none max-h-28 min-h-12 w-full resize-none overscroll-contain border-0 bg-transparent px-1 py-1.5 text-base shadow-none hover:border-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:max-h-40 sm:text-sm placeholder:text-muted-foreground"
          />
          {props.maxInputCharacters ? (
            <p
              className={cn(
                "pb-1 text-right font-mono text-[0.65rem] tabular-nums text-muted-foreground/70",
                props.input.length >= props.maxInputCharacters * 0.9
                  ? "text-warning"
                  : "max-sm:sr-only",
              )}
              aria-live="polite"
            >
              {t("characterCount", {
                current: props.input.length.toLocaleString(locale),
                maximum: props.maxInputCharacters.toLocaleString(locale),
              })}
            </p>
          ) : null}
        </div>
        {/*
          The action row adapts to the composer's own width (container query),
          not the viewport: the composer can be narrow inside the code
          workspace split view even on a large screen. Below @sm the assistant
          controls wrap onto their own row so nothing overlaps the send button.
        */}
        <div className="grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1.5 border-t border-border/55 px-2 py-1 @xl/composer:items-center @xl/composer:gap-x-2 @xl/composer:px-3">
          <div className="col-start-1 row-start-1">
            <ChatComposerMediaControls
              disabled={!props.canChat || props.needsSetup}
              uploading={props.uploadingAttachment}
              sending={props.sending}
              listening={listening}
              onFileChange={props.onFileChange}
              onToggleDictation={toggleDictation}
            />
          </div>
          <div
            data-slot="chat-composer-primary-controls"
            className="col-span-3 col-start-1 row-start-2 min-w-0 pb-1 @sm/composer:col-span-1 @sm/composer:col-start-2 @sm/composer:row-start-1 @sm/composer:pb-0"
          >
            {props.controls.primary}
          </div>
          <div
            data-slot="chat-composer-primary-action"
            className="col-start-3 row-start-1"
          >
            {props.sending ? (
              <Button
                type="button"
                size="icon"
                aria-label={t("stopGeneration")}
                className="size-10 shrink-0 rounded-xl bg-destructive text-destructive-foreground transition-[background-color,color,box-shadow] hover:bg-destructive/90"
                onClick={props.onStop}
              >
                <SquareIcon
                  className="size-3.5 fill-current"
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={
                  !props.canChat ||
                  (!props.input.trim() && props.attachments.length === 0)
                }
                aria-label={t("sendMessage")}
                className={cn(
                  "size-10 shrink-0 rounded-xl transition-[background-color,color,box-shadow,opacity]",
                  props.canChat &&
                    (props.input.trim() || props.attachments.length > 0)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "opacity-60",
                )}
              >
                <SendIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        {props.controls.secondary ? (
          <div
            data-slot="chat-composer-usage"
            className="flex min-w-0 border-t border-border/55 px-2 py-1 @xl/composer:px-3"
          >
            {props.controls.secondary}
          </div>
        ) : null}
      </div>
      {props.centered &&
      !props.needsSetup &&
      props.promptSuggestions.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3 animate-in-fade">
          {props.promptSuggestions.slice(0, 3).map((suggestion, index) => (
            <PromptSuggestionButton
              key={suggestion}
              index={index}
              suggestion={suggestion}
              onClick={props.onPromptSuggestionClick}
            />
          ))}
        </div>
      ) : null}
      {props.needsSetup ? (
        <div className="mt-1.5 min-h-5 px-1">
          <p className="text-xs text-muted-foreground animate-in-fade">
            {t("needsSetup")}{" "}
            <Link
              href="/agents"
              className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
            >
              {t("configureAssistant")}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
