"use client";

import { SaveIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SyntheticEvent, useState } from "react";
import { toast } from "sonner";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function SettingsPasswordCard() {
  const t = useTranslations("settings");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const feedbackId = error
    ? "password-change-error"
    : "password-change-success";

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          (data as { message?: string; error?: string } | null)?.message ??
            (data as { message?: string; error?: string } | null)?.error ??
            t("passwordUpdateFailed"),
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setRevokeOtherSessions(true);
      setSuccess(t("passwordUpdated"));
      toast.success(t("passwordUpdated"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("passwordUpdateFailed");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-0 rounded-none shadow-none bg-transparent">
      <CardHeader className="px-0">
        <CardTitle>{t("passwordTitle")}</CardTitle>
        <CardDescription>{t("passwordDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={handleSubmit}
          aria-busy={loading}
        >
          {error ? (
            <Alert id={feedbackId} variant="destructive">
              <AlertTitle>{t("passwordUpdateFailed")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert id={feedbackId}>
              <AlertTitle>{t("passwordUpdated")}</AlertTitle>
              <AlertDescription>
                {t("passwordUpdatedDescription")}
              </AlertDescription>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel htmlFor="current-password">
              {t("currentPassword")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error || success ? feedbackId : undefined}
              />
            </FieldContent>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="new-password">{t("newPassword")}</FieldLabel>
              <FieldContent>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error || success ? feedbackId : undefined}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                {t("confirmPassword")}
              </FieldLabel>
              <FieldContent>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error || success ? feedbackId : undefined}
                />
              </FieldContent>
            </Field>
          </div>

          <label className="flex items-start gap-3 rounded-xl border bg-background p-3 text-sm">
            <Checkbox
              checked={revokeOtherSessions}
              onCheckedChange={(checked) =>
                setRevokeOtherSessions(checked === true)
              }
              aria-label={t("revokeOtherSessions")}
            />
            <span>
              <span className="font-medium">{t("revokeOtherSessions")}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("revokeOtherSessionsHint")}
              </span>
            </span>
          </label>

          <Button type="submit" className="w-fit" disabled={loading}>
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {loading ? t("updatingPassword") : t("updatePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
