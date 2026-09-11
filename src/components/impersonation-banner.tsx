"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const AUTH_SESSION_CHANGED = "maiah-auth-session-changed";
export function ImpersonationBanner({
  active,
  name,
}: {
  active: boolean;
  name: string;
}) {
  const t = useTranslations("impersonation");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_CHANGED) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  if (!active) return null;
  async function stop() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/admin/stop-impersonating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("stop_failed");
      window.localStorage.setItem(AUTH_SESSION_CHANGED, crypto.randomUUID());
      window.location.assign(`/${locale}/members`);
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/15 px-4 py-3 text-sm"
    >
      <p className="flex min-w-0 items-center gap-2">
        <ShieldAlertIcon className="size-5 shrink-0" aria-hidden="true" />
        <span>{t("active", { name })}</span>
      </p>
      <Button variant="outline" disabled={pending} onClick={() => void stop()}>
        {pending ? t("stopping") : t("stop")}
      </Button>
      {error ? (
        <p role="alert" className="w-full">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
