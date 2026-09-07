"use client";

import {
  Building2Icon,
  CheckIcon,
  ChevronRightIcon,
  FolderKanbanIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AccessSnapshot } from "./access-console.access-member";

export function ScopePath({ snapshot }: { snapshot: AccessSnapshot }) {
  const t = useTranslations("access");
  return (
    <Card className="bg-muted/25" size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Building2Icon aria-hidden="true" />
            <span className="truncate font-medium">
              {snapshot.organization.name}
            </span>
          </span>
          <ChevronRightIcon
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="flex min-w-0 items-center gap-2">
            <FolderKanbanIcon aria-hidden="true" />
            <span className="truncate font-medium">
              {snapshot.activeProject.name}
            </span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("inheritanceHint")}</p>
      </CardContent>
    </Card>
  );
}

export function MutatingButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <CheckIcon data-icon="inline-start" aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}

export function ConfirmRemovalButton({
  label,
  title,
  description,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("access");
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        {pending ? <Spinner /> : <Trash2Icon aria-hidden="true" />}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("confirmRemove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
