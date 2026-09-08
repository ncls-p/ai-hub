"use client";

import { CopyIcon, Globe2Icon, Share2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { useConversationSharing } from "./use-conversation-sharing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useReleaseBodyPointerEvents } from "./use-release-body-pointer-events";

export function ConversationShareDialog({
  conversationId,
}: {
  conversationId: string;
}) {
  const {
    t,
    open,
    setOpen,
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
    removeShare,
    setPublic,
  } = useConversationSharing(conversationId);
  useReleaseBodyPointerEvents(open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-xl"
          aria-label={t("action")}
        >
          <Share2Icon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {loading && !payload ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : payload ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="conversation-share-email">
                {t("email")}
              </FieldLabel>
              <Input
                id="conversation-share-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPlaceholder")}
              />
            </Field>
            <Field orientation="horizontal">
              <div className="flex-1">
                <FieldLabel htmlFor="conversation-can-continue">
                  {t("canContinue")}
                </FieldLabel>
                <FieldDescription>
                  {t("canContinueDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="conversation-can-continue"
                checked={canContinue}
                onCheckedChange={setCanContinue}
              />
            </Field>
            {canContinue ? (
              <Field>
                <FieldLabel>{t("continuationMode")}</FieldLabel>
                <Select
                  value={continuationMode}
                  onValueChange={(value) =>
                    setContinuationMode(value as "shared" | "fork")
                  }
                >
                  <SelectTrigger aria-label={t("continuationMode")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="fork">{t("modeFork")}</SelectItem>
                      <SelectItem value="shared">{t("modeShared")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t(
                    continuationMode === "shared"
                      ? "modeSharedDescription"
                      : "modeForkDescription",
                  )}
                </FieldDescription>
              </Field>
            ) : null}
            <Button
              type="button"
              disabled={
                saving ||
                loading ||
                payload.isEphemeral ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
              }
              onClick={() => void addShare()}
            >
              <Share2Icon data-icon="inline-start" aria-hidden="true" />
              {t("share")}
            </Button>
            {payload.shares.length ? (
              <div className="flex flex-col gap-2">
                {payload.shares.map((share) => (
                  <div
                    key={share.userId}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {share.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {share.email} ·{" "}
                        {share.canContinue
                          ? t(
                              share.continuationMode === "shared"
                                ? "modeShared"
                                : "modeFork",
                            )
                          : t("readOnly")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove")}
                      disabled={saving || loading}
                      onClick={() => void removeShare(share.userId)}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Field
              orientation="horizontal"
              data-disabled={payload.isEphemeral || undefined}
            >
              <div className="flex-1">
                <FieldLabel htmlFor="conversation-public">
                  <Globe2Icon aria-hidden="true" />
                  {t("public")}
                </FieldLabel>
                <FieldDescription>
                  {payload.isEphemeral
                    ? t("ephemeralCannotShare")
                    : t("publicDescription")}
                </FieldDescription>
              </div>
              <Switch
                id="conversation-public"
                disabled={payload.isEphemeral || saving || loading}
                checked={Boolean(payload.publicShareId)}
                onCheckedChange={(checked) => void setPublic(checked)}
              />
            </Field>
            {publicUrl && (
              <Field orientation="horizontal">
                <div className="flex-1">
                  <FieldLabel htmlFor="conversation-public-files">
                    {t("publicFiles")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("publicFilesDescription")}
                  </FieldDescription>
                </div>
                <Switch
                  id="conversation-public-files"
                  checked={payload.publicShareIncludesFiles}
                  disabled={saving || loading}
                  onCheckedChange={(checked) => void setPublic(true, checked)}
                />
              </Field>
            )}
            {publicUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(publicUrl)
                    .then(() => toast.success(t("copied")))
                    .catch(() => toast.error(t("copyFailed")))
                }
              >
                <CopyIcon data-icon="inline-start" aria-hidden="true" />
                {t("copyPublicLink")}
              </Button>
            ) : null}
          </FieldGroup>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
