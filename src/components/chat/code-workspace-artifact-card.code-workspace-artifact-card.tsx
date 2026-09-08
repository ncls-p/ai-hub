"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  DEFAULT_CODE_WORKSPACE_LAYOUT,
  codeWorkspaceGridTemplate,
  normalizeCodeWorkspaceLayout,
  visibleCodeWorkspacePanes,
  type CodeWorkspaceLayout,
  type CodeWorkspacePane,
} from "@/components/chat/code-workspace-layout";
import {
  CODE_WORKSPACE_ARTIFACT_EVENT,
  CODE_WORKSPACE_LAYOUT_STORAGE_KEY,
  broadcastCodeWorkspaceArtifact,
  initialCodeWorkspacePath,
  loadCodeWorkspaceFileContent,
  requestUpdatedCodeWorkspaceArtifact,
  subscribeToCodeWorkspaceArtifacts,
} from "./code-workspace-artifact-card.button-type";
import { CodeWorkspaceArtifactCardView } from "./code-workspace-artifact-card.code-workspace-artifact-card.view";
import {
  codeWorkspaceArtifactFromEvent,
  dispatchCodeWorkspaceArtifact,
} from "./code-workspace-artifact-card.code-workspace-file-tree";
import { buildCodeWorkspaceTree } from "./code-workspace-artifact-card.highlight-code";
import { useCodeWorkspacePopoutWindows } from "./code-workspace-artifact-card.use-popout-windows";

export function useCodeWorkspaceArtifactCardController({
  artifact,
  workspaceId,
  variant = "card",
  activateOnMount = false,
  standalone = false,
  initialPath = null,
}: {
  artifact: CodeWorkspaceArtifact;
  workspaceId?: string;
  variant?: "card" | "workbench";
  activateOnMount?: boolean;
  /** True when the card is the whole window (pop-out page). */
  standalone?: boolean;
  initialPath?: string | null;
}) {
  const t = useTranslations("chat.artifacts");
  const [currentArtifact, setCurrentArtifact] = useState(artifact);
  const [selectedPath, setSelectedPath] = useState<string | null>(() =>
    initialCodeWorkspacePath(artifact, initialPath),
  );
  const [content, setContent] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [fileReloadKey, setFileReloadKey] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenPane, setFullscreenPane] = useState<
    "code" | "preview" | null
  >(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deletePath, setDeletePath] = useState<string | null>(null);
  const [workspaceLayout, setWorkspaceLayout] = useState<CodeWorkspaceLayout>(
    DEFAULT_CODE_WORKSPACE_LAYOUT,
  );
  const paneIdPrefix = useId();
  const selectedFile = currentArtifact.files.find(
    (file) => file.path === selectedPath,
  );
  const fileTree = useMemo(
    () => buildCodeWorkspaceTree(currentArtifact.files),
    [currentArtifact.files],
  );
  const visiblePanes = visibleCodeWorkspacePanes(workspaceLayout);
  const workspaceGridTemplate = codeWorkspaceGridTemplate(workspaceLayout);
  const popoutWindows = useCodeWorkspacePopoutWindows({
    artifact: currentArtifact,
    workspaceId,
    selectedPath,
    standalone,
  });

  function paneId(pane: CodeWorkspacePane) {
    return `${paneIdPrefix}-${pane}`;
  }

  function updateWorkspaceLayout(
    updater: (current: CodeWorkspaceLayout) => CodeWorkspaceLayout,
  ) {
    setWorkspaceLayout((current) => {
      const next = updater(current);
      try {
        window.localStorage.setItem(
          CODE_WORKSPACE_LAYOUT_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // The layout still works for this session when storage is unavailable.
      }
      return next;
    });
  }

  useEffect(() => {
    if (variant !== "workbench") return;
    try {
      const persisted = window.localStorage.getItem(
        CODE_WORKSPACE_LAYOUT_STORAGE_KEY,
      );
      if (!persisted) return;
      const next = normalizeCodeWorkspaceLayout(JSON.parse(persisted));
      queueMicrotask(() => setWorkspaceLayout(next));
    } catch {
      // Ignore malformed or unavailable local storage and keep safe defaults.
    }
  }, [variant]);

  useEffect(() => {
    dispatchCodeWorkspaceArtifact(artifact, { activate: activateOnMount });
    queueMicrotask(() => setCurrentArtifact(artifact));
  }, [activateOnMount, artifact]);

  useEffect(() => {
    function handleWorkspaceUpdate(event: Event) {
      const nextArtifact = codeWorkspaceArtifactFromEvent(event);
      if (nextArtifact?.projectId !== artifact.projectId) return;
      setCurrentArtifact((current) =>
        nextArtifact.version >= current.version ? nextArtifact : current,
      );
    }
    window.addEventListener(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      handleWorkspaceUpdate,
    );
    // Pop-out windows edit the same project: replay their updates as a local
    // event so this card and the chat page stay in sync (unsaved drafts are
    // left untouched).
    const unsubscribe = subscribeToCodeWorkspaceArtifacts(
      artifact.projectId,
      (nextArtifact) => dispatchCodeWorkspaceArtifact(nextArtifact),
    );
    return () => {
      window.removeEventListener(
        CODE_WORKSPACE_ARTIFACT_EVENT,
        handleWorkspaceUpdate,
      );
      unsubscribe();
    };
  }, [artifact.projectId]);

  useEffect(() => {
    if (
      selectedPath &&
      currentArtifact.files.some((file) => file.path === selectedPath)
    ) {
      return;
    }
    queueMicrotask(() => {
      setSelectedPath(initialCodeWorkspacePath(currentArtifact));
    });
  }, [currentArtifact, selectedPath]);

  useEffect(() => {
    const filePath = selectedFile?.binary ? null : selectedPath;
    let cancelled = false;
    async function loadSelectedFile() {
      setLoadingFile(true);
      setCanEdit(false);
      setError(null);
      try {
        const fileContent = await loadCodeWorkspaceFileContent(
          currentArtifact.projectId,
          filePath,
          t("loadFileFailed"),
        );
        if (!cancelled) {
          setContent(fileContent.content);
          setCanEdit(fileContent.canEdit);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("loadFileFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    }
    void loadSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [
    currentArtifact.projectId,
    fileReloadKey,
    selectedFile?.binary,
    selectedPath,
    t,
  ]);

  async function saveSelectedFile() {
    if (!canEdit || !selectedPath || selectedFile?.binary) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(
        currentArtifact.projectId,
        "PUT",
        { path: selectedPath, content },
        t("saveFileFailed"),
      );
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
      broadcastCodeWorkspaceArtifact(nextArtifact);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("saveFileFailed"),
      );
    } finally {
      setSavingFile(false);
    }
  }

  async function deleteSelectedFile() {
    if (!canEdit || !deletePath) return;
    setSavingFile(true);
    setError(null);
    try {
      const nextArtifact = await requestUpdatedCodeWorkspaceArtifact(
        currentArtifact.projectId,
        "DELETE",
        { path: deletePath },
        t("deleteFileFailed"),
      );
      setCurrentArtifact(nextArtifact);
      dispatchCodeWorkspaceArtifact(nextArtifact, { activate: true });
      broadcastCodeWorkspaceArtifact(nextArtifact);
      setDeletePath(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("deleteFileFailed"),
      );
    } finally {
      setSavingFile(false);
    }
  }

  return {
    kind: "ready",
    canEdit,
    content,
    currentArtifact,
    deletePath,
    deleteSelectedFile,
    error,
    fileTree,
    fullscreenPane,
    loadingFile,
    paneId,
    popoutWindows,
    publishOpen,
    saveSelectedFile,
    savingFile,
    selectedFile,
    selectedPath,
    setContent,
    setDeletePath,
    setFileReloadKey,
    setFullscreenPane,
    setPublishOpen,
    setSelectedPath,
    t,
    updateWorkspaceLayout,
    variant,
    visiblePanes,
    workspaceGridTemplate,
    workspaceId,
    workspaceLayout,
  } as const;
}

export function CodeWorkspaceArtifactCard(
  ...args: Parameters<typeof useCodeWorkspaceArtifactCardController>
) {
  const model = useCodeWorkspaceArtifactCardController(...args);
  if (!("kind" in model)) return model;
  return <CodeWorkspaceArtifactCardView model={model} />;
}
