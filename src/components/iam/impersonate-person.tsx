"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { UserRoundCogIcon } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AUTH_SESSION_CHANGED } from "@/components/impersonation-banner";

export function ImpersonatePerson({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const t = useTranslations("impersonation");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenuItem
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        void fetch("/api/auth/admin/impersonate-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
          .then((response) => {
            if (!response.ok) throw new Error("impersonation_failed");
            window.localStorage.setItem(
              AUTH_SESSION_CHANGED,
              crypto.randomUUID(),
            );
            window.location.assign(`/${locale}/chat`);
          })
          .catch(() => {
            toast.error(t("startError"));
            setPending(false);
          });
      }}
    >
      <UserRoundCogIcon aria-hidden="true" />
      {t("start", { name })}
    </DropdownMenuItem>
  );
}
