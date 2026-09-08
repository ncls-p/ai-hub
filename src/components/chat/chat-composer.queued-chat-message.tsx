"use client";

import { PastedTextActions } from "./pasted-text-actions";
import { FileIcon, Maximize2Icon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  FilePreviewDialog,
  useFilePreview,
} from "@/components/chat/file-preview";

import type { ChatAttachment } from "@/components/chat/chat-types";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import type { ChatTodoList } from "@/modules/chat/todo-list";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

export interface QueuedChatMessage {
  id: string;
  content: string;
  reasoningEffort?: ReasoningPreset;
}

export interface ChatComposerProps {
  input: string;
  canChat: boolean;
  needsSetup?: boolean;
  sending: boolean;
  maxInputCharacters?: number;
  queuedMessages?: QueuedChatMessage[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onQueuedMessageChange?: (id: string, content: string) => void;
  onQueuedMessageCancel?: (id: string) => void;
  onUploadCodeWorkspace?: (files: File[]) => Promise<void>;
  onUploadChatAttachment?: (
    file: File,
    replaceAttachmentId?: string,
  ) => Promise<boolean | void>;
  attachments?: ChatAttachment[];
  onRemoveAttachment?: (attachmentId: string) => void;
  todoList?: ChatTodoList | null;
  centered?: boolean;
  promptSuggestions?: string[];
  onPromptSuggestionClick?: (suggestion: string) => void;
}

const codeFilePattern = /\.(?:html?|css|[cm]?js)$/i;

export function uploadedFilePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relativePath?.trim() || file.name;
}

export function isDirectCodeFile(file: File) {
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

export function filesFromDataTransfer(data: DataTransfer) {
  const files = Array.from(data.files);
  if (files.length > 0) return files.map(pastedFileName);
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(pastedFileName);
}

export function dataTransferContainsFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file") ||
    dataTransfer.files.length > 0
  );
}

function attachmentSubtitle(
  attachment: ChatAttachment,
  locale: string,
  t: ReturnType<typeof useTranslations<"chat.composer">>,
) {
  if (attachment.kind === "chat_image") {
    return `${attachment.mimeType.replace("image/", "").toUpperCase()} · ${formatBytes(attachment.size)}`;
  }
  if (attachment.extractionStatus === "unreadable") {
    return t("storedSafely", { size: formatBytes(attachment.size) });
  }
  const readLabel =
    attachment.extractionStatus === "truncated"
      ? t("partiallyRead")
      : t("readable");
  return t("fileSummary", {
    status: readLabel,
    count: attachment.extractedTextChars.toLocaleString(locale),
    size: formatBytes(attachment.size),
  });
}

export function AttachmentPreview({
  attachment,
  onRemove,
  onEditText,
  onRestoreText,
  disabled,
}: {
  disabled?: boolean;
  onEditText?: (id: string, text: string) => Promise<boolean>;
  onRestoreText?: (id: string, text: string) => void;
  attachment: ChatAttachment;
  onRemove?: (attachmentId: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("chat.composer");
  const subtitle = attachmentSubtitle(attachment, locale, t);
  const isPdf =
    attachment.kind === "chat_file" &&
    (attachment.mimeType === "application/pdf" ||
      attachment.fileName.toLowerCase().endsWith(".pdf"));
  const canPreview =
    attachment.kind === "chat_file" &&
    (isPdf || attachment.extractedTextChars > 0);
  const preview = useFilePreview({
    attachmentId: attachment.id,
    canPreview,
    nativePreview: isPdf,
  });

  if (attachment.kind === "chat_image") {
    return (
      <Attachment
        size="sm"
        className="w-full border-border/55 bg-background/78 shadow-[0_1px_2px_rgba(9,30,36,0.035)]"
      >
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
          <AttachmentDescription>{subtitle}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            type="button"
            className="size-10 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label={t("removeFile", { name: attachment.fileName })}
            disabled={disabled}
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
      <Attachment
        size="sm"
        className="w-full border-border/55 bg-background/78 shadow-[0_1px_2px_rgba(9,30,36,0.035)]"
      >
        <AttachmentMedia>
          <FileIcon aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{attachment.fileName}</AttachmentTitle>
          <AttachmentDescription>{subtitle}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <PastedTextActions
            attachment={attachment}
            disabled={disabled}
            onEdit={onEditText}
            onRestore={onRestoreText}
          />
          {canPreview ? (
            <AttachmentAction
              type="button"
              className="size-10 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={t("viewExtractedText", { name: attachment.fileName })}
              onClick={preview.openPreview}
            >
              <Maximize2Icon aria-hidden="true" />
            </AttachmentAction>
          ) : null}
          <AttachmentAction
            type="button"
            className="size-10 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label={t("removeFile", { name: attachment.fileName })}
            disabled={disabled}
            onClick={() => onRemove?.(attachment.id)}
          >
            <XIcon aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      <FilePreviewDialog
        open={preview.previewOpen}
        onOpenChange={preview.setPreviewOpen}
        fileName={attachment.fileName}
        url={attachment.url}
        mimeType={attachment.mimeType}
        subtitle={subtitle}
        previewText={preview.previewText}
        previewError={preview.previewError}
        loadingPreview={preview.loadingPreview}
      />
    </>
  );
}
