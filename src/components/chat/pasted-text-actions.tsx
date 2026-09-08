"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { AttachmentAction } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { ChatAttachment } from "./chat-types";

export function PastedTextActions({
  attachment,
  disabled,
  onEdit,
  onRestore,
}: {
  attachment: ChatAttachment;
  disabled?: boolean;
  onEdit?: (id: string, content: string) => Promise<boolean>;
  onRestore?: (id: string, content: string) => void;
}) {
  const t = useTranslations("chat.composer");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false),
    [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const inFlight = useRef(false);
  if (
    !/^pasted-text-.*\.txt$/i.test(attachment.fileName) ||
    attachment.kind !== "chat_file" ||
    !onEdit ||
    !onRestore
  )
    return null;
  async function read(restore: boolean) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    if (!restore) setOpen(true);
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error("Unable to read pasted text");
      const content = await response.text();
      if (restore) onRestore!(attachment.id, content);
      else setText(content);
    } catch {
      if (restore) toast.error(t("pastedTextLoadFailed"));
      else setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (inFlight.current || disabled || !text.trim()) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (await onEdit!(attachment.id, text)) setOpen(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <AttachmentAction
        type="button"
        disabled={disabled || busy}
        aria-label={t("editPastedText")}
        onClick={() => void read(false)}
      >
        <PencilIcon />
      </AttachmentAction>
      <AttachmentAction
        type="button"
        disabled={disabled || busy}
        aria-label={t("restorePastedText")}
        onClick={() => void read(true)}
      >
        <Undo2Icon />
      </AttachmentAction>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("editPastedText")}</DialogTitle>
            <DialogDescription>{t("pastedTextEditHint")}</DialogDescription>
          </DialogHeader>
          {error ? (
            <div role="alert" className="grid gap-3">
              <p>{t("pastedTextLoadFailed")}</p>
              <Button variant="outline" onClick={() => void read(false)}>
                {common("retry")}
              </Button>
            </div>
          ) : (
            <>
              <Label htmlFor="pasted-text-editor">
                {t("pastedTextContent")}
              </Label>
              <Textarea
                id="pasted-text-editor"
                className="field-sizing-fixed min-h-64 max-h-[55svh] font-mono text-sm"
                disabled={busy}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </>
          )}
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {common("cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || error || disabled}
              onClick={() => {
                onRestore(attachment.id, text);
                setOpen(false);
              }}
            >
              {t("restorePastedText")}
            </Button>
            <Button
              type="button"
              disabled={busy || error || disabled || !text.trim()}
              onClick={() => void save()}
            >
              {busy && <Spinner />}
              {t("savePastedText")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
