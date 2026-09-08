"use client";

import { downloadResourcePackage } from "./download-resource-package";
import type { PublishPreviewResult } from "@/modules/marketplace/use-cases";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ResourceShareDialogView } from "./resource-share-dialog.resource-share-dialog.view";
import {
  ShareStep,
  ShareableResource,
  previewQueryParams,
} from "./resource-share-dialog.share-step";

export function useResourceShareDialogController({
  resource,
  workspaceId,
  open,
  onCloseAction,
  onSuccessAction,
}: {
  resource: ShareableResource | null;
  workspaceId: string | null;
  open: boolean;
  onCloseAction: () => void;
  onSuccessAction?: () => void;
}) {
  const t = useTranslations("marketplace.share");
  const tVisibility = useTranslations("marketplace");
  const tCommon = useTranslations("common");
  const tPackage = useTranslations("resourcePackage");
  const [step, setStep] = useState<ShareStep>("meta");
  const [preview, setPreview] = useState<PublishPreviewResult | null>(null);
  const previewRequest = useRef(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [changelog, setChangelog] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const loadPreview = useCallback(async () => {
    if (!resource || !workspaceId) return;
    const current = ++previewRequest.current;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const params = previewQueryParams(resource, workspaceId);
      const res = await fetch(`/api/marketplace/publish-preview?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toast.loadFailed"));
      }
      const data = (await res.json()) as PublishPreviewResult;
      if (current !== previewRequest.current) return;
      setPreview(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setVersion(data.suggestedVersion);
      setTagsInput(data.tags.join(", "));
    } catch (error) {
      if (current === previewRequest.current)
        setPreviewError(
          error instanceof Error ? error.message : t("toast.loadFailed"),
        );
      return;
    } finally {
      if (current === previewRequest.current) setPreviewLoading(false);
    }
  }, [resource, workspaceId, t]);

  useEffect(() => {
    const request = previewRequest;
    let disposed = false;
    if (open && resource && workspaceId) {
      queueMicrotask(() => {
        if (disposed) return;
        setStep("choose");
        setSelectedUserId("");
        setBusy(false);
        setVisibility("public");
        setChangelog("");
        void loadPreview();
      });
    }
    return () => {
      disposed = true;
      request.current++;
    };
  }, [open, resource, workspaceId, loadPreview]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput],
  );

  const createOrUpdateDraft = useCallback(async () => {
    if (!resource) throw new Error("missing resource");
    if (!workspaceId) throw new Error("missing workspace");

    if (resource.kind === "marketplace_item") {
      const updateRes = await fetch(`/api/marketplace/items/${resource.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, tags }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}));
        throw new Error(err.error || t("toast.publishFailed"));
      }
      return resource.id;
    }

    const body: Record<string, unknown> = {
      workspaceId,
      version,
      name,
      description: description || undefined,
      changelog: changelog || undefined,
      visibility,
      tags,
      draftOnly: true,
    };

    if (resource.kind === "agent") body.agentId = resource.id;
    if (resource.kind === "skill") body.skillId = resource.id;
    if (resource.kind === "custom_tool") body.customToolId = resource.id;
    if (resource.kind === "mcp_server") body.mcpServerId = resource.id;
    if (resource.kind === "mcp_tool") body.mcpToolId = resource.id;

    const res = await fetch("/api/marketplace/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t("toast.publishFailed"));
    }

    const data = await res.json();
    if (!data.item?.id) throw new Error(t("toast.publishFailed"));
    return data.item.id as string;
  }, [
    resource,
    workspaceId,
    version,
    name,
    description,
    changelog,
    visibility,
    tags,
    t,
  ]);

  const publishToMarketplace = useCallback(async () => {
    if (!resource) throw new Error("missing resource");
    if (!workspaceId) throw new Error("missing workspace");

    if (resource.kind === "marketplace_item") {
      const updateRes = await fetch(`/api/marketplace/items/${resource.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, tags, visibility }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}));
        throw new Error(err.error || t("toast.publishFailed"));
      }
      return resource.id;
    }

    const body: Record<string, unknown> = {
      workspaceId,
      version,
      name,
      description: description || undefined,
      changelog: changelog || undefined,
      visibility,
      tags,
    };

    if (resource.kind === "agent") body.agentId = resource.id;
    if (resource.kind === "skill") body.skillId = resource.id;
    if (resource.kind === "custom_tool") body.customToolId = resource.id;
    if (resource.kind === "mcp_server") body.mcpServerId = resource.id;
    if (resource.kind === "mcp_tool") body.mcpToolId = resource.id;

    if (resource.kind !== "agent") body.draftOnly = true;

    const res = await fetch("/api/marketplace/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t("toast.publishFailed"));
    }

    const data = await res.json();
    const itemId = data.item?.id as string | undefined;
    if (!itemId) throw new Error(t("toast.publishFailed"));

    if (resource.kind === "agent") return itemId;

    const publishRes = await fetch(`/api/marketplace/items/${itemId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility, tags }),
    });
    if (!publishRes.ok) {
      const err = await publishRes.json().catch(() => ({}));
      throw new Error(err.error || t("toast.publishFailed"));
    }
    return itemId;
  }, [
    resource,
    workspaceId,
    version,
    name,
    description,
    changelog,
    visibility,
    tags,
    t,
  ]);

  const handleExport = useCallback(async () => {
    if (!resource || !workspaceId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await downloadResourcePackage(resource, workspaceId, tPackage("failed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tPackage("failed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [resource, workspaceId, tPackage]);

  const finish = useCallback(() => {
    onSuccessAction?.();
    onCloseAction();
  }, [onCloseAction, onSuccessAction]);

  const handlePublishToMarketplace = useCallback(async () => {
    if (!resource || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await publishToMarketplace();
      toast.success(t("toast.published", { name }));
      finish();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.publishFailed"),
      );
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [resource, publishToMarketplace, name, finish, t]);

  const handleShareWithUser = useCallback(async () => {
    if (!resource || !selectedUserId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const itemId = await createOrUpdateDraft();
      const shareRes = await fetch(`/api/marketplace/items/${itemId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmail: selectedUserId.trim() }),
      });
      if (!shareRes.ok) {
        const err = await shareRes.json().catch(() => ({}));
        throw new Error(err.error || t("toast.shareFailed"));
      }
      toast.success(t("toast.shared", { name }));
      finish();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.shareFailed"),
      );
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [resource, selectedUserId, createOrUpdateDraft, name, finish, t]);

  if (!resource) return null;

  const resourceSubjectKey =
    resource.kind === "marketplace_item" ? "marketplace_item" : resource.kind;

  return {
    kind: "ready",
    busy,
    description,
    handlePublishToMarketplace,
    handleShareWithUser,
    handleExport,
    tPackage,
    name,
    onCloseAction,
    open,
    preview,
    previewLoading,
    previewError,
    loadPreview,
    resource,
    resourceSubjectKey,
    selectedUserId,
    setDescription,
    setName,
    setSelectedUserId,
    setStep,
    setTagsInput,
    setVisibility,
    step,
    t,
    tCommon,
    tVisibility,
    tagsInput,
    visibility,
  } as const;
}

export function ResourceShareDialog(
  ...args: Parameters<typeof useResourceShareDialogController>
) {
  const model = useResourceShareDialogController(...args);
  if (model === null) return null;
  if (!("kind" in model)) return model;
  return <ResourceShareDialogView model={model} />;
}
