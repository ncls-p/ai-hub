"use client";

import { Link } from "@/i18n/navigation";
import {
  CopyIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  Maximize2Icon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChatAttachment,
  ChatFileAttachment,
} from "@/components/chat/chat-types";
import { cn } from "@/lib/utils";

export interface QueuedChatMessage {
  id: string;
  content: string;
}

interface ChatComposerProps {
  input: string;
  canChat: boolean;
  sending: boolean;
  queuedMessages?: QueuedChatMessage[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onQueuedMessageChange?: (id: string, content: string) => void;
  onQueuedMessageCancel?: (id: string) => void;
  onUploadCodeWorkspace?: (files: File[]) => Promise<void>;
  onUploadChatAttachment?: (file: File) => Promise<void>;
  attachments?: ChatAttachment[];
  onRemoveAttachment?: (attachmentId: string) => void;
}

const maxChatAttachments = 8;
const codeFilePattern = /\.(?:html?|css|[cm]?js)$/i;

function uploadedFilePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relativePath?.trim() || file.name;
}

function isDirectCodeFile(file: File) {
  return codeFilePattern.test(uploadedFilePath(file));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function pastedFileName(file: File, index: number) {
  if (file.name.trim()) return file;
  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const safeExtension = extension?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return new File(
    [file],
    `pasted-image-${index + 1}.${safeExtension || "png"}`,
    {
      type: file.type || "image/png",
      lastModified: file.lastModified,
    },
  );
}

function filesFromClipboard(data: DataTransfer) {
  const files = Array.from(data.files);
  if (files.length > 0) return files.map(pastedFileName);
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(pastedFileName);
}

function attachmentSubtitle(attachment: ChatAttachment) {
  if (attachment.kind === "chat_image") {
    return `${attachment.mimeType.replace("image/", "").toUpperCase()} · ${formatBytes(attachment.size)}`;
  }
  if (attachment.extractionStatus === "unreadable") {
    return `Stored safely · ${formatBytes(attachment.size)}`;
  }
  const readLabel =
    attachment.extractionStatus === "truncated" ? "Partially read" : "Readable";
  return `${readLabel} · ${attachment.extractedTextChars.toLocaleString()} chars · ${formatBytes(attachment.size)}`;
}

type ChatFilePreviewPayload = {
  attachment?: ChatFileAttachment;
  text?: string;
  error?: string;
};

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove?: (attachmentId: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const canPreview =
    attachment.kind === "chat_file" && attachment.extractedTextChars > 0;

  async function loadPreviewText() {
    if (
      attachment.kind !== "chat_file" ||
      !canPreview ||
      previewText !== null
    ) {
      return;
    }
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const response = await fetch(
        `/api/workspace/chat-attachments/${attachment.id}/extracted`,
      );
      const data = (await response
        .json()
        .catch(() => null)) as ChatFilePreviewPayload | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load extracted file text");
      }
      setPreviewText(data?.text ?? "");
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Failed to load extracted file text",
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  function openPreview() {
    setPreviewOpen(true);
    void loadPreviewText();
  }

  if (attachment.kind === "chat_image") {
    return (
      <Attachment orientation="vertical" className="w-24">
        <AttachmentMedia
          variant="image"
          role="img"
          aria-label={attachment.fileName}
          style={{
            backgroundImage: `url("${attachment.url.replace(/"/g, '\\"')}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>
            {attachmentSubtitle(attachment)}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            type="button"
            variant="secondary"
            aria-label={`Remove ${attachment.fileName}`}
            onClick={() => onRemove?.(attachment.id)}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    );
  }

  return (
    <>
      <Attachment className="w-72 max-w-full">
        <AttachmentMedia>
          <FileIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>
            {attachmentSubtitle(attachment)}
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          {canPreview ? (
            <AttachmentAction
              type="button"
              aria-label={`View extracted text for ${attachment.fileName}`}
              onClick={openPreview}
            >
              <Maximize2Icon aria-hidden="true" />
            </AttachmentAction>
          ) : null}
          <AttachmentAction
            type="button"
            aria-label={`Remove ${attachment.fileName}`}
            onClick={() => onRemove?.(attachment.id)}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col overflow-hidden">
          <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">
                {attachment.fileName}
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {attachmentSubtitle(attachment)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 pr-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                disabled={!previewText}
                onClick={() => {
                  if (!previewText) return;
                  void navigator.clipboard.writeText(previewText);
                }}
              >
                <CopyIcon className="size-3" aria-hidden="true" />
                Copy
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
              >
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  <DownloadIcon className="size-3" aria-hidden="true" />
                  Download
                </a>
              </Button>
            </div>
          </div>
          {loadingPreview ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : previewError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {previewError}
            </p>
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/20 p-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">
              {previewText || "No extracted text available."}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ChatComposer({
  input,
  canChat,
  sending,
  queuedMessages = [],
  onSubmit,
  onInputChange,
  onStop,
  onQueuedMessageChange,
  onQueuedMessageCancel,
  onUploadCodeWorkspace,
  onUploadChatAttachment,
  attachments = [],
  onRemoveAttachment,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${newHeight}px`;
  }, [input]);

  async function handleSelectedFiles(files: File[]) {
    const uploadedFiles = files.filter(Boolean);
    if (uploadedFiles.length === 0) return;
    if (!canChat) return;
    if (sending) {
      toast.error("Wait for the current response before attaching files.");
      return;
    }
    setUploadingAttachment(true);
    try {
      const zipFiles = uploadedFiles.filter((file) =>
        file.name.toLowerCase().endsWith(".zip"),
      );
      const codeFiles = uploadedFiles.filter(isDirectCodeFile);
      if (zipFiles.length > 0) {
        if (uploadedFiles.length > 1) {
          toast.error("Upload one ZIP or attach other files separately.");
          return;
        }
        await onUploadCodeWorkspace?.(zipFiles);
        return;
      }
      if (
        codeFiles.length === uploadedFiles.length &&
        codeFiles.some((file) => /\.html?$/i.test(uploadedFilePath(file)))
      ) {
        await onUploadCodeWorkspace?.(codeFiles);
        return;
      }
      if (!onUploadChatAttachment) {
        toast.error("File attachments are not available for this chat.");
        return;
      }
      if (attachments.length + uploadedFiles.length > maxChatAttachments) {
        toast.error(
          `You can attach up to ${maxChatAttachments} files per message.`,
        );
        return;
      }
      for (const file of uploadedFiles) {
        await onUploadChatAttachment(file);
      }
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleSelectedFiles(files);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void handleSelectedFiles(files);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3"
    >
      {queuedMessages.length > 0 ? (
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-col gap-2">
          {queuedMessages.map((message, index) => (
            <div key={message.id} className="rounded-xl border bg-card p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Queued message {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                  aria-label="Cancel queued message"
                  onClick={() => onQueuedMessageCancel?.(message.id)}
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                aria-label={`Queued message ${index + 1}`}
                value={message.content}
                onChange={(event) =>
                  onQueuedMessageChange?.(message.id, event.target.value)
                }
                rows={1}
                className="max-h-28 min-h-9 resize-none text-sm shadow-none"
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative mx-auto w-full min-w-0 max-w-4xl">
        {attachments.length > 0 ? (
          <AttachmentGroup className="mb-2">
            {attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                onRemove={onRemoveAttachment}
              />
            ))}
          </AttachmentGroup>
        ) : null}
        <div className={cn("composer-box rounded-xl sm:rounded-2xl")}>
          <div className="flex items-end gap-1.5 p-1.5 sm:gap-2 sm:p-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(event) => void handleFileChange(event)}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9"
              aria-label="Upload files"
              disabled={uploadingAttachment || sending || !canChat}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAttachment ? (
                <Loader2Icon
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <PaperclipIcon className="size-4" aria-hidden="true" />
              )}
            </Button>

            <Textarea
              ref={textareaRef}
              aria-label="Message"
              name="message"
              autoComplete="off"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                canChat
                  ? sending
                    ? "Queue your next message…"
                    : "Message, paste images, or attach files…"
                  : "Finish setup before chatting…"
              }
              disabled={!canChat}
              rows={1}
              className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm placeholder:text-muted-foreground"
            />

            <Button
              type="submit"
              size="icon"
              disabled={!canChat || (!input.trim() && attachments.length === 0)}
              aria-label={sending ? "Queue message" : "Send message"}
              className={cn(
                "size-9 shrink-0 rounded-lg transition-colors sm:size-10 sm:rounded-xl",
                canChat && (input.trim() || attachments.length > 0)
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "opacity-60",
              )}
            >
              <SendIcon className="size-4" aria-hidden="true" />
            </Button>

            {sending ? (
              <Button
                type="button"
                size="icon"
                aria-label="Stop generation"
                className="size-9 shrink-0 rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 sm:size-10 sm:rounded-xl"
                onClick={onStop}
              >
                <SquareIcon
                  className="size-3.5 fill-current"
                  aria-hidden="true"
                />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Footer hints */}
        <div className="mt-2 flex items-center justify-between px-1">
          {!canChat ? (
            <p className="text-center text-xs text-muted-foreground/70 animate-in-fade">
              This assistant needs a provider and model.{" "}
              <Link
                href="/agents"
                className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
              >
                Configure assistant
              </Link>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>
                {sending
                  ? "Enter queues · Shift+Enter adds a line"
                  : "Enter sends · Shift+Enter adds a line · paste images"}
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <FileArchiveIcon className="size-3" aria-hidden="true" />{" "}
                ZIP/code
                <ImageIcon className="size-3" aria-hidden="true" /> Images
                <FileIcon className="size-3" aria-hidden="true" />{" "}
                PDF/Word/PPTX/MD
              </span>
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
