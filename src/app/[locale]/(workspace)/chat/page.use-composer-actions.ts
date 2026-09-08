"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";

import type { QueuedChatMessage } from "@/components/chat/chat-composer";
import type {
  ChatAttachment,
  CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import { createQueuedMessage, uploadPathForFile } from "./chat-page-helpers";
import { uploadDocumentInChunks } from "@/modules/document-upload/chunked-upload";
import type { useChatStream } from "@/hooks/use-chat-stream";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

import {
  CODING_INTERFACE_MODE,
  type InterfaceMode,
} from "./chat-interface-mode";

type Setter<T> = Dispatch<SetStateAction<T>>;
type SubmitChat = ReturnType<typeof useChatStream>["handleSubmit"];

type ComposerActionsContext = {
  workspaceId: string | null | undefined;
  activeConversationId: string | null;
  ephemeral: boolean;
  ephemeralTtlMinutes: number;
  input: string;
  attachments: ChatAttachment[];
  canChat: boolean;
  sending: boolean;
  interfaceMode: InterfaceMode;
  codeWorkspaceArtifact: CodeWorkspaceArtifact | null;
  handleSubmit: SubmitChat;
  setInput: Setter<string>;
  setAttachments: Setter<ChatAttachment[]>;
  setQueuedMessages: Setter<QueuedChatMessage[]>;
  setCodeWorkspaceArtifact: Setter<CodeWorkspaceArtifact | null>;
  setInterfaceMode: Setter<InterfaceMode>;
  setOrganizationDefaultAgentId: Setter<string | null>;
  setUserDefaultAgentId: Setter<string | null>;
  userSelectedInterfaceModeRef: MutableRefObject<InterfaceMode | null>;
  lastAutoOpenedWorkspaceRef: MutableRefObject<string | null>;
  t: (key: string) => string;
  reasoningEffort: ReasoningPreset | null;
};

export function useComposerActions(c: ComposerActionsContext) {
  function skipPendingSuggestions() {
    if (!c.activeConversationId) return;
    void fetch(
      `/api/workspace/conversations/${c.activeConversationId}/skip-suggestions`,
      { method: "POST" },
    ).catch(() => undefined);
  }
  function queueMessage(content: string) {
    skipPendingSuggestions();
    c.setQueuedMessages((current) => [
      ...current,
      {
        ...createQueuedMessage(content),
        reasoningEffort: c.reasoningEffort ?? undefined,
      },
    ]);
  }
  function submitMessage() {
    const hasAttachments = c.attachments.length > 0;
    const content =
      c.input.trim() ||
      (hasAttachments
        ? c.attachments.every(({ kind }) => kind === "chat_image")
          ? c.t("attachments.analyzeImage")
          : c.t("attachments.analyzeFile")
        : "");
    if (!content || !c.canChat) return;
    if (c.sending && hasAttachments) {
      toast.error(c.t("attachments.waitForResponse"));
      return;
    }
    const attachments = c.attachments;
    c.setInput("");
    c.setAttachments([]);
    if (c.sending) return queueMessage(content);
    void c.handleSubmit(content, {
      codeWorkspaceId:
        c.interfaceMode === CODING_INTERFACE_MODE
          ? c.codeWorkspaceArtifact?.projectId
          : undefined,
      attachments,
      ephemeral: !c.activeConversationId && c.ephemeral,
      ephemeralTtlMinutes: c.ephemeral ? c.ephemeralTtlMinutes : undefined,
      reasoningEffort: c.reasoningEffort ?? undefined,
    });
  }

  async function uploadCodeWorkspace(files: File[]) {
    if (!c.workspaceId || !c.canChat) return;
    const uploadedFiles = files.filter(Boolean);
    if (uploadedFiles.length === 0) return;
    const zipFiles = uploadedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".zip"),
    );
    if (zipFiles.length > 0 && uploadedFiles.length > 1) {
      toast.error(c.t("attachments.singleCodeSource"));
      return;
    }
    if (
      zipFiles.length === 0 &&
      !uploadedFiles.some((file) => /\.html?$/i.test(uploadPathForFile(file)))
    ) {
      toast.error(c.t("attachments.htmlRequired"));
      return;
    }
    try {
      const formData = new FormData();
      formData.set("workspaceId", c.workspaceId);
      if (zipFiles.length === 1) formData.set("file", zipFiles[0]);
      else
        for (const file of uploadedFiles)
          formData.append("files", file, uploadPathForFile(file));
      const response = await fetch("/api/workspace/code-projects/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        artifact?: CodeWorkspaceArtifact;
        prompt?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.artifact || !data.prompt)
        throw new Error(data?.error || c.t("attachments.codeUploadFailed"));
      c.setAttachments([]);
      c.setCodeWorkspaceArtifact(data.artifact);
      c.userSelectedInterfaceModeRef.current = CODING_INTERFACE_MODE;
      c.setInterfaceMode(CODING_INTERFACE_MODE);
      c.lastAutoOpenedWorkspaceRef.current = `${data.artifact.projectId}:${data.artifact.version}`;
      toast.success(c.t("attachments.codeUploaded"));
      await c.handleSubmit(data.prompt, {
        codeWorkspaceArtifact: data.artifact,
        reasoningEffort: c.reasoningEffort ?? undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : c.t("attachments.codeUploadFailed"),
      );
    }
  }

  async function uploadChatAttachment(
    file: File,
    replaceAttachmentId?: string,
  ) {
    if (!c.workspaceId || !c.canChat) return false;
    try {
      const data = await uploadDocumentInChunks<{
        attachment?: ChatAttachment;
        error?: string;
      }>({
        workspaceId: c.workspaceId,
        file,
        chunkUrl: "/api/workspace/chat-attachments/upload?phase=chunk",
        completeUrl: "/api/workspace/chat-attachments/upload?phase=complete",
      });
      if (!data.attachment)
        throw new Error(data.error || c.t("attachments.uploadFailed"));
      c.setAttachments((current) =>
        replaceAttachmentId
          ? current.map((item) =>
              item.id === replaceAttachmentId ? data.attachment! : item,
            )
          : [...current, data.attachment!],
      );
      toast.success(
        data.attachment.kind === "chat_image"
          ? c.t("attachments.imageAttached")
          : c.t("attachments.fileAttached"),
      );
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : c.t("attachments.uploadFailed"),
      );
      return false;
    }
  }
  function submitSuggestion(content: string) {
    const trimmed = content.trim();
    if (!trimmed || !c.canChat) return;
    c.setInput("");
    if (c.sending) return queueMessage(trimmed);
    void c.handleSubmit(trimmed, {
      ephemeral: !c.activeConversationId && c.ephemeral,
      ephemeralTtlMinutes: c.ephemeral ? c.ephemeralTtlMinutes : undefined,
      reasoningEffort: c.reasoningEffort ?? undefined,
    });
  }
  async function setUserDefaultAgent(agentId: string | null) {
    if (!c.workspaceId) return;
    try {
      const response = await fetch("/api/workspace/agents/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: c.workspaceId,
          scope: "user",
          defaultAgentId: agentId,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        organizationDefaultAgentId?: string | null;
        userDefaultAgentId?: string | null;
      } | null;
      if (!response.ok)
        throw new Error(data?.error || c.t("defaultSaveFailed"));
      c.setOrganizationDefaultAgentId(data?.organizationDefaultAgentId ?? null);
      c.setUserDefaultAgentId(data?.userDefaultAgentId ?? null);
      toast.success(c.t("defaultSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : c.t("defaultSaveFailed"),
      );
    }
  }
  const updateQueuedMessage = (id: string, content: string) =>
    c.setQueuedMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content } : message,
      ),
    );
  const cancelQueuedMessage = (id: string) =>
    c.setQueuedMessages((current) =>
      current.filter((message) => message.id !== id),
    );
  return {
    submitMessage,
    uploadCodeWorkspace,
    uploadChatAttachment,
    submitSuggestion,
    setUserDefaultAgent,
    updateQueuedMessage,
    cancelQueuedMessage,
  };
}
