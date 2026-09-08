"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

type SharePayload = {
  shares: Array<{
    userId: string;
    name: string;
    email: string;
    canContinue: boolean;
    continuationMode: "shared" | "fork";
  }>;
  publicShareId: string | null;
  publicShareIncludesFiles: boolean;
  isEphemeral: boolean;
};

export function useConversationSharing(conversationId: string) {
  const t = useTranslations("chat.share");
  const locale = useLocale();
  const [open, updateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [email, setEmail] = useState("");
  const [canContinue, setCanContinue] = useState(false);
  const [continuationMode, setContinuationMode] = useState<"shared" | "fork">(
    "fork",
  );
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const baseUrl = `/api/workspace/conversations/${conversationId}/share`;
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(baseUrl);
      if (!response.ok) throw new Error(t("loadFailed"));
      const data = (await response.json()) as SharePayload;
      if (current === requestId.current) setPayload(data);
    } catch {
      if (current === requestId.current) {
        setPayload(null);
        setError(t("loadFailed"));
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [baseUrl, t]);

  useEffect(() => {
    const request = requestId;
    let disposed = false;
    if (open)
      queueMicrotask(() => {
        if (disposed) return;
        setPayload(null);
        setEmail("");
        setCanContinue(false);
        setContinuationMode("fork");
        void load();
      });
    return () => {
      disposed = true;
      request.current++;
    };
  }, [open, load]);

  async function mutate(
    method: string,
    body: unknown,
    errorMessage: string,
    suffix = "",
  ) {
    if (inFlight.current || loading || !payload) return false;
    inFlight.current = true;
    setSaving(true);
    try {
      const response = await fetch(baseUrl + suffix, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || errorMessage);
      await load();
      return true;
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : errorMessage);
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  async function addShare() {
    if (!email.trim()) return;
    if (
      await mutate(
        "POST",
        { targetEmail: email.trim(), canContinue, continuationMode },
        t("saveFailed"),
      )
    ) {
      setEmail("");
      toast.success(t("shared"));
    }
  }
  const publicUrl =
    payload?.publicShareId && typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/share/${payload.publicShareId}`
      : null;
  return {
    t,
    open,
    setOpen: (next: boolean) => {
      if (!inFlight.current) updateOpen(next);
    },
    loading,
    saving,
    payload,
    error,
    load,
    email,
    setEmail,
    canContinue,
    setCanContinue,
    continuationMode,
    setContinuationMode,
    publicUrl,
    addShare,
    removeShare: (id: string) =>
      mutate("DELETE", undefined, t("removeFailed"), `?userId=${id}`),
    setPublic: (
      next: boolean,
      includeFiles = payload?.publicShareIncludesFiles ?? false,
    ) => mutate("PATCH", { public: next, includeFiles }, t("publicFailed")),
  };
}
