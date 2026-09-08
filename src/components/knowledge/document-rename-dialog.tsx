"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PencilIcon } from "lucide-react";

export function DocumentRenameDialog({
  title,
  url,
  onRenamed,
}: {
  title: string;
  url: string;
  onRenamed: () => Promise<void>;
}) {
  const t = useTranslations("knowledge");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false),
    [name, setName] = useState(title);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (inFlight.current || !name.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", title: name.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("renameFailed"));
      await onRenamed();
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("renameFailed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!inFlight.current) {
          setOpen(next);
          setName(title);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("renameAria", { name: title })}
        >
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renameDocument")}</DialogTitle>
          <DialogDescription>{t("renameDescription")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="grid gap-4"
        >
          <Label htmlFor="document-rename">{t("documentTitle")}</Label>
          <Input
            id="document-rename"
            autoFocus
            maxLength={512}
            disabled={busy}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {common("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={busy || !name.trim() || name.trim() === title}
            >
              {common("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
