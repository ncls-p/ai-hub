"use client";

import { useCallback, useEffect, useState, type SVGProps } from "react";
import { RefreshCcwIcon, SettingsIcon, UploadCloudIcon } from "lucide-react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.89-.01-1.75-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.93c.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .27.18.59.69.49A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

type GitHubRepositoryAccess =
  | "admin"
  | "maintain"
  | "write"
  | "triage"
  | "read"
  | "unknown";

type GitHubConnectionOption = {
  id: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: string | null;
  settingsUrl: string | null;
  lastSyncedAt: string | null;
};

type GitHubRepositoryOption = {
  id: string;
  connectionId: string;
  owner: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  access: GitHubRepositoryAccess;
  relationship: "account" | "collaborator";
};

type GitHubBranchOption = {
  name: string;
  protected: boolean;
};

type GitHubPublishResult = {
  kind: "github_publish_result";
  mode: "pull_request" | "direct_push";
  repository: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitSha: string;
  pullRequestUrl: string | null;
  message: string;
};

type GitHubStatusPayload = {
  configured?: boolean;
  connectPath?: string | null;
  connectUrl?: string | null;
  connections?: GitHubConnectionOption[];
  repositories?: GitHubRepositoryOption[];
  error?: string;
};

function formatGitHubAccess(access: GitHubRepositoryAccess) {
  const labels: Record<GitHubRepositoryAccess, string> = {
    admin: "admin",
    maintain: "maintain",
    write: "write",
    triage: "triage",
    read: "read-only",
    unknown: "unknown access",
  };
  return labels[access];
}

function canAttemptPublishToRepository(access: GitHubRepositoryAccess) {
  return (
    access === "unknown" ||
    access === "admin" ||
    access === "maintain" ||
    access === "write"
  );
}

function hasLimitedRepositoryAccess(access: GitHubRepositoryAccess) {
  return access === "read" || access === "triage";
}

function formatLastSynced(value: string | null) {
  if (!value) return "Never synced";
  return `Synced ${new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

export function GitHubPublishDialog({
  artifact,
  workspaceId,
  open,
  onOpenChange,
}: {
  artifact: CodeWorkspaceArtifact;
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [connections, setConnections] = useState<GitHubConnectionOption[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositoryOption[]>(
    [],
  );
  const [syncing, setSyncing] = useState(false);
  const [branches, setBranches] = useState<GitHubBranchOption[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetDirectory, setTargetDirectory] = useState("");
  const [mode, setMode] = useState<"pull_request" | "direct_push">(
    "pull_request",
  );
  const [commitMessage, setCommitMessage] = useState(
    `Update ${artifact.title}`,
  );
  const [confirmDirectPush, setConfirmDirectPush] = useState(false);
  const [result, setResult] = useState<GitHubPublishResult | null>(null);
  const selectedRepository = repositories.find(
    (repo) => repo.id === repositoryId,
  );
  const selectedConnection = selectedRepository
    ? connections.find(
        (connection) => connection.id === selectedRepository.connectionId,
      )
    : null;
  const primaryManageUrl =
    selectedConnection?.settingsUrl ??
    connections[0]?.settingsUrl ??
    connectUrl;
  const canPublishToSelectedRepository = selectedRepository
    ? canAttemptPublishToRepository(selectedRepository.access)
    : false;

  const applyGitHubStatus = useCallback((data: GitHubStatusPayload) => {
    setConfigured(Boolean(data.configured));
    setConnectUrl(data.connectPath ?? data.connectUrl ?? null);
    const nextConnections = data.connections ?? [];
    const nextRepos = data.repositories ?? [];
    setConnections(nextConnections);
    setRepositories(nextRepos);
    setRepositoryId((current) =>
      nextRepos.some((repo) => repo.id === current)
        ? current
        : nextRepos[0]?.id || "",
    );
    setTargetBranch(
      (current) => current || nextRepos[0]?.defaultBranch || "main",
    );
  }, []);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const currentWorkspaceId = workspaceId;
    let cancelled = false;
    async function loadStatus() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const response = await fetch(
          `/api/workspace/github/status?workspaceId=${encodeURIComponent(currentWorkspaceId)}`,
        );
        const data = (await response
          .json()
          .catch(() => null)) as GitHubStatusPayload | null;
        if (!response.ok) throw new Error(data?.error || "GitHub unavailable");
        if (cancelled) return;
        applyGitHubStatus(data ?? {});
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load GitHub status",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [applyGitHubStatus, open, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId || !repositoryId) return;
    const currentWorkspaceId = workspaceId;
    let cancelled = false;
    async function loadBranches() {
      try {
        const response = await fetch(
          `/api/workspace/github/branches?workspaceId=${encodeURIComponent(currentWorkspaceId)}&repositoryId=${encodeURIComponent(repositoryId)}`,
        );
        const data = (await response.json().catch(() => null)) as {
          branches?: GitHubBranchOption[];
          error?: string;
        } | null;
        if (!response.ok)
          throw new Error(data?.error || "Failed to load branches");
        if (cancelled) return;
        const nextBranches = data?.branches ?? [];
        setBranches(nextBranches);
        const selected = repositories.find((repo) => repo.id === repositoryId);
        setTargetBranch((current) =>
          current && nextBranches.some((branch) => branch.name === current)
            ? current
            : selected?.defaultBranch || nextBranches[0]?.name || "main",
        );
      } catch (loadError) {
        if (!cancelled) {
          setBranches([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load branches",
          );
        }
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [open, repositories, repositoryId, workspaceId]);

  async function syncRepositories(connectionId?: string) {
    if (!workspaceId) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as GitHubStatusPayload | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to sync GitHub repositories");
      }
      applyGitHubStatus(data ?? {});
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to sync GitHub repositories",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function publish() {
    if (!workspaceId || !repositoryId || !targetBranch.trim()) return;
    if (!canPublishToSelectedRepository) {
      setError("Grant write access to this repository before publishing.");
      return;
    }
    if (mode === "direct_push" && !confirmDirectPush) {
      setError("Confirm direct push before publishing.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/github/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          projectId: artifact.projectId,
          repositoryId,
          mode,
          targetBranch,
          sourceBranch: sourceBranch.trim() || undefined,
          targetDirectory: targetDirectory.trim() || undefined,
          commitMessage: commitMessage.trim(),
          pullRequestTitle: commitMessage.trim(),
          confirmDirectPush,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        result?: GitHubPublishResult;
        error?: string;
      } | null;
      if (!response.ok || !data?.result) {
        throw new Error(data?.error || "GitHub publish failed");
      }
      setResult(data.result);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "GitHub publish failed",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Publish to GitHub</DialogTitle>
        {!workspaceId ? (
          <p className="text-sm text-muted-foreground">
            GitHub publishing needs an active workspace context.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading GitHub…</p>
        ) : !configured ? (
          <p className="text-sm text-muted-foreground">
            GitHub publishing is not configured on this AI Hub instance.
          </p>
        ) : repositories.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your GitHub account to publish this code workspace to
              private, public, and collaborator repositories that you authorize.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild disabled={!connectUrl}>
                <a href={connectUrl ?? "#"}>
                  <GithubIcon className="size-4" aria-hidden="true" />
                  Connect GitHub
                </a>
              </Button>
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                disabled={syncing || connections.length === 0}
                onClick={() => void syncRepositories()}
              >
                <RefreshCcwIcon className="size-4" aria-hidden="true" />
                {syncing ? "Syncing…" : "Sync existing installs"}
              </Button>
              <Button
                asChild
                variant={OUTLINE_VARIANT}
                disabled={!primaryManageUrl}
              >
                <a
                  href={primaryManageUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SettingsIcon className="size-4" aria-hidden="true" />
                  Manage allowed repos
                </a>
              </Button>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">{result.message}</p>
            <p className="text-muted-foreground">
              Commit {result.commitSha.slice(0, 7)} on {result.repository}
              {result.sourceBranch
                ? ` from ${result.sourceBranch} to ${result.targetBranch}`
                : `:${result.targetBranch}`}
            </p>
            {result.pullRequestUrl ? (
              <Button asChild>
                <a
                  href={result.pullRequestUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open pull request
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {selectedConnection
                      ? `${selectedConnection.accountLogin}${
                          selectedConnection.accountType
                            ? ` · ${selectedConnection.accountType}`
                            : ""
                        }`
                      : "GitHub repositories"}
                  </p>
                  <p className="mt-1">
                    {selectedConnection
                      ? formatLastSynced(selectedConnection.lastSyncedAt)
                      : `${repositories.length} authorized repositories`}
                  </p>
                  <p className="mt-1">
                    This list includes every repository authorized for the
                    GitHub App, including collaborator repositories when the app
                    is allowed on the owning account or organization. To add
                    more repositories, update the installation, then sync.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type={BUTTON_TYPE}
                    variant={OUTLINE_VARIANT}
                    size="sm"
                    disabled={syncing}
                    onClick={() =>
                      void syncRepositories(selectedConnection?.id)
                    }
                  >
                    <RefreshCcwIcon className="size-3" aria-hidden="true" />
                    {syncing ? "Syncing…" : "Sync"}
                  </Button>
                  <Button
                    asChild
                    variant={OUTLINE_VARIANT}
                    size="sm"
                    disabled={!primaryManageUrl}
                  >
                    <a
                      href={primaryManageUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <SettingsIcon className="size-3" aria-hidden="true" />
                      Manage allowed repos
                    </a>
                  </Button>
                  {connectUrl ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={connectUrl}>
                        <GithubIcon className="size-3" aria-hidden="true" />
                        Add account
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {selectedRepository &&
            hasLimitedRepositoryAccess(selectedRepository.access) ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  This repository is currently{" "}
                  {formatGitHubAccess(selectedRepository.access)}.
                </p>
                <p className="mt-1">
                  Grant write, maintain, or admin access in GitHub App settings,
                  then sync before publishing.
                </p>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-repo">
                Repository
              </label>
              <select
                id="github-repo"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={repositoryId}
                onChange={(event) => {
                  setRepositoryId(event.target.value);
                  const repo = repositories.find(
                    (item) => item.id === event.target.value,
                  );
                  setTargetBranch(repo?.defaultBranch || "main");
                }}
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.fullName}
                    {repo.private ? " · private" : ""}
                    {repo.relationship === "collaborator"
                      ? " · collaborator"
                      : ""}
                    {hasLimitedRepositoryAccess(repo.access)
                      ? ` · ${formatGitHubAccess(repo.access)}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-mode">
                Mode
              </label>
              <select
                id="github-mode"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as "pull_request" | "direct_push");
                  setConfirmDirectPush(false);
                }}
              >
                <option value="pull_request">Create a pull request</option>
                <option value="direct_push">Push directly to branch</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-branch">
                Target branch
              </label>
              <input
                id="github-branch"
                list="github-branches"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={targetBranch}
                onChange={(event) => setTargetBranch(event.target.value)}
              />
              <datalist id="github-branches">
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name} />
                ))}
              </datalist>
              {targetBranch === selectedRepository?.defaultBranch ? (
                <p className="text-[11px] text-muted-foreground">
                  This is the default branch for {selectedRepository.fullName}.
                </p>
              ) : null}
            </div>
            {mode === "pull_request" ? (
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="github-source">
                  Source branch (optional)
                </label>
                <input
                  id="github-source"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  placeholder="ai-hub/update-page"
                  value={sourceBranch}
                  onChange={(event) => setSourceBranch(event.target.value)}
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-dir">
                Target directory (optional)
              </label>
              <input
                id="github-dir"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                placeholder="public/site"
                value={targetDirectory}
                onChange={(event) => setTargetDirectory(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="github-commit">
                Commit message
              </label>
              <input
                id="github-commit"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">
                Files to publish
              </p>
              <p>
                {artifact.files.length} file
                {artifact.files.length === 1 ? "" : "s"} from workspace v
                {artifact.version}. GitHub branch protections still apply.
              </p>
            </div>
            {mode === "direct_push" ? (
              <label className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={confirmDirectPush}
                  onChange={(event) =>
                    setConfirmDirectPush(event.target.checked)
                  }
                />
                <span>
                  I confirm direct push to{" "}
                  <strong>{targetBranch || "this branch"}</strong>. No
                  force-push will be used.
                </span>
              </label>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type={BUTTON_TYPE}
                disabled={
                  publishing ||
                  !repositoryId ||
                  !canPublishToSelectedRepository ||
                  !targetBranch.trim() ||
                  !commitMessage.trim() ||
                  (mode === "direct_push" && !confirmDirectPush)
                }
                onClick={() => void publish()}
              >
                <UploadCloudIcon className="size-4" aria-hidden="true" />
                {publishing ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </div>
        )}
        {error && (loading || repositories.length === 0) ? (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
