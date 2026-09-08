"use client";

import { useRef, type SVGProps } from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { CODE_WORKSPACE_RESIZE_STEP } from "@/components/chat/code-workspace-layout";

export const BUTTON_TYPE = "button";
export const OUTLINE_VARIANT = "outline";
export const GHOST_VARIANT = "ghost";
export const COMPACT_ICON_CLASS = "size-3";
export const CODE_WORKSPACE_LAYOUT_STORAGE_KEY =
  "maiah-code-workspace-layout-v1";

export function CodeWorkspaceResizeHandle({
  controls,
  label,
  maximum,
  minimum,
  onResize,
  value,
}: {
  controls: string;
  label: string;
  maximum: number;
  minimum: number;
  onResize: (width: number) => void;
  value: number;
}) {
  const pointerState = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);

  return (
    <div
      aria-controls={controls}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={maximum}
      aria-valuemin={minimum}
      aria-valuenow={value}
      className="group relative z-10 -mx-1.5 hidden w-6 touch-none cursor-col-resize items-center justify-center outline-none lg:flex"
      onKeyDown={(event) => {
        let nextWidth: number | null = null;
        if (event.key === "ArrowLeft") {
          nextWidth = value - CODE_WORKSPACE_RESIZE_STEP;
        } else if (event.key === "ArrowRight") {
          nextWidth = value + CODE_WORKSPACE_RESIZE_STEP;
        } else if (event.key === "Home") {
          nextWidth = minimum;
        } else if (event.key === "End") {
          nextWidth = maximum;
        }
        if (nextWidth === null) return;
        event.preventDefault();
        onResize(nextWidth);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerState.current = {
          pointerId: event.pointerId,
          startWidth: value,
          startX: event.clientX,
        };
      }}
      onPointerMove={(event) => {
        const pointer = pointerState.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        onResize(pointer.startWidth + event.clientX - pointer.startX);
      }}
      onPointerUp={(event) => {
        if (pointerState.current?.pointerId !== event.pointerId) return;
        pointerState.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        pointerState.current = null;
      }}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="h-full w-px bg-border/60 transition-[background-color,box-shadow] duration-150 group-hover:bg-primary/55 group-focus-visible:bg-primary group-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
      />
    </div>
  );
}

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.93c.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function isCodeWorkspaceArtifactOutput(
  value: unknown,
): value is CodeWorkspaceArtifact {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "code_workspace_artifact" &&
    typeof record.projectId === "string" &&
    typeof record.title === "string" &&
    typeof record.version === "number" &&
    Array.isArray(record.files)
  );
}

export const CODE_WORKSPACE_ARTIFACT_EVENT = "code-workspace-artifact-updated";
const CODE_WORKSPACE_SYNC_CHANNEL = "maiah-code-workspace-sync";
const CODE_WORKSPACE_WINDOW_FEATURES = "popup=yes,width=1280,height=860";

type CodeWorkspaceSyncMessage = { artifact?: CodeWorkspaceArtifact };

function codeWorkspaceSyncChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CODE_WORKSPACE_SYNC_CHANNEL);
}

/** Tells the other windows (pop-outs, main chat) that the project changed. */
export function broadcastCodeWorkspaceArtifact(
  artifact: CodeWorkspaceArtifact,
) {
  const channel = codeWorkspaceSyncChannel();
  if (!channel) return;
  channel.postMessage({ artifact } satisfies CodeWorkspaceSyncMessage);
  channel.close();
}

export function subscribeToCodeWorkspaceArtifacts(
  projectId: string,
  onArtifact: (artifact: CodeWorkspaceArtifact) => void,
) {
  const channel = codeWorkspaceSyncChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<CodeWorkspaceSyncMessage>) => {
    const artifact = event.data?.artifact;
    if (!isCodeWorkspaceArtifactOutput(artifact)) return;
    if (artifact.projectId !== projectId) return;
    onArtifact(artifact);
  };
  return () => channel.close();
}

export type CodeWorkspaceWindowSurface = "workbench" | "preview";

export function codeWorkspaceWindowUrl(
  locale: string,
  artifact: Pick<CodeWorkspaceArtifact, "projectId">,
  options: {
    surface?: CodeWorkspaceWindowSurface;
    workspaceId?: string;
    path?: string | null;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options.path) params.set("path", options.path);
  const query = params.toString();
  const suffix = options.surface === "preview" ? "/preview" : "";
  return `/${locale}/code-workspace/${artifact.projectId}${suffix}${query ? `?${query}` : ""}`;
}

/**
 * Opens a workspace surface in its own browser window. Reusing the window
 * name means clicking the button again focuses the existing pop-out instead of
 * stacking new ones.
 */
export function openCodeWorkspaceWindow(url: string, name: string) {
  const popup = window.open(url, name, CODE_WORKSPACE_WINDOW_FEATURES);
  popup?.focus();
  return popup;
}

type CodeWorkspaceFilePayload = {
  canEdit?: boolean;
  content?: string;
  error?: string;
};

async function requestCodeWorkspaceJson<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
) {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || fallbackError);
  return data as T | null;
}

export async function loadCodeWorkspaceFileContent(
  projectId: string,
  path: string | null,
  fallbackError: string,
) {
  const data = await requestCodeWorkspaceJson<CodeWorkspaceFilePayload>(
    `/api/workspace/code-projects/${projectId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    undefined,
    fallbackError,
  );
  if (!data || (path && typeof data.content !== "string")) {
    throw new Error(data?.error || fallbackError);
  }
  return { content: data.content ?? "", canEdit: data.canEdit === true };
}

export async function requestUpdatedCodeWorkspaceArtifact(
  projectId: string,
  method: "PUT" | "DELETE",
  payload: { path: string; content?: string },
  fallbackError: string,
) {
  const nextArtifact = await requestCodeWorkspaceJson<
    CodeWorkspaceArtifact | { error?: string }
  >(
    `/api/workspace/code-projects/${projectId}/files`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    fallbackError,
  );
  if (!isCodeWorkspaceArtifactOutput(nextArtifact)) {
    throw new Error(
      (nextArtifact as { error?: string } | null)?.error || fallbackError,
    );
  }
  return nextArtifact;
}

export function initialCodeWorkspacePath(
  artifact: CodeWorkspaceArtifact,
  preferredPath: string | null = null,
) {
  const preferred = artifact.files.find(
    (file) => file.path === preferredPath && !file.binary,
  );
  return (
    preferred?.path ??
    artifact.rootFile ??
    artifact.files.find((file) => !file.binary)?.path ??
    null
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}
