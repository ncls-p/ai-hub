import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Download, Globe, Share2, User, Users } from "lucide-react";
import {
  getVisibilityHint,
  getVisibilityLabel,
} from "./marketplace-i18n-helpers";
import { PublishPreviewSummary } from "./publish-preview-summary";
import type { useResourceShareDialogController } from "./resource-share-dialog.resource-share-dialog";
import {
  STEP_INDEX,
  ShareOptionCard,
} from "./resource-share-dialog.share-step";

type Model = Extract<
  ReturnType<typeof useResourceShareDialogController>,
  { kind: "ready" }
>;
export function ResourceShareDialogView({ model }: { model: Model }) {
  const {
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
  } = model;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && onCloseAction()}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            {t("title", { name: resource.name })}
          </DialogTitle>
          <DialogDescription>
            {t(`steps.${step}`)}
            {resource.kind !== "marketplace_item" && step === "choose"
              ? ` ${t(`resourceSubject.${resourceSubjectKey}`)}`
              : ""}
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {t("stepIndicator", {
              current: STEP_INDEX[step],
              total: 2,
            })}
          </p>
        </DialogHeader>

        {previewError && (
          <div role="alert">
            <p className="text-sm text-destructive">{previewError}</p>
            <Button variant="outline" onClick={() => void loadPreview()}>
              {tCommon("retry")}
            </Button>
          </div>
        )}
        {previewLoading && step === "meta" ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : null}

        {step === "meta" && !previewLoading ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="share-name">{t("fields.name")}</Label>
              <Input
                id="share-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-desc">{t("fields.description")}</Label>
              <Textarea
                id="share-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("fields.visibility")}</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as "public" | "private")}
              >
                <SelectTrigger aria-label={t("fields.visibility")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["public", "private"] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      {getVisibilityLabel(v, (key) =>
                        tVisibility(key as "visibility.public"),
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getVisibilityHint(visibility, (key) =>
                tVisibility(key as "visibility.publicHint"),
              ) ? (
                <p className="text-xs text-muted-foreground">
                  {getVisibilityHint(visibility, (key) =>
                    tVisibility(key as "visibility.publicHint"),
                  )}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-tags">{t("fields.tags")}</Label>
              <Input
                id="share-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
            {preview?.manifestPreview ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium">
                  {t("contentPreview")}
                </p>
                <PublishPreviewSummary preview={preview.manifestPreview} />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "choose" ? (
          <div className="grid gap-3">
            <ShareOptionCard
              icon={Download}
              title={tPackage("export")}
              description={tPackage("exportDescription")}
              onClick={() => void handleExport()}
              disabled={busy}
            />
            <ShareOptionCard
              icon={Globe}
              title={t("options.publish.title")}
              description={t("options.publish.description")}
              onClick={() => setStep("meta")}
              disabled={busy}
            />
            <ShareOptionCard
              icon={Users}
              title={t("options.user.title")}
              description={t("options.user.description")}
              onClick={() => setStep("user")}
              disabled={busy}
            />
          </div>
        ) : null}

        {step === "user" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="share-recipient-email">
              {tPackage("recipientEmail")}
            </Label>
            <Input
              id="share-recipient-email"
              type="email"
              autoComplete="email"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={busy}
            />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "meta" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={busy}
              >
                {tCommon("back")}
              </Button>
              <Button
                disabled={!preview || previewLoading || !name.trim() || busy}
                onClick={() => void handlePublishToMarketplace()}
              >
                {busy ? <Spinner className="size-4 mr-1" /> : null}
                <Globe className="size-4 mr-1" />
                {t("publish")}
              </Button>
            </>
          ) : null}
          {step === "choose" ? (
            <Button variant="outline" onClick={onCloseAction} disabled={busy}>
              {tCommon("cancel")}
            </Button>
          ) : null}
          {step === "user" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={busy}
              >
                {tCommon("back")}
              </Button>
              <Button
                disabled={
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedUserId.trim()) ||
                  !preview ||
                  previewLoading ||
                  busy
                }
                onClick={() => void handleShareWithUser()}
              >
                {busy ? <Spinner className="size-4 mr-1" /> : null}
                <User className="size-4 mr-1" />
                {t("action")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
