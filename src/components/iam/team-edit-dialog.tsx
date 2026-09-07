"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AccessTeam } from "./access-console.access-member";
import { MutatingButton } from "./access-console.scope-path";

export function TeamEditDialog({
  team,
  pending,
  onSave,
}: {
  team: AccessTeam;
  pending: boolean;
  onSave: (value: { name: string; description: string }) => Promise<boolean>;
}) {
  const t = useTranslations("access");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          if (value) {
            setName(team.name);
            setDescription(team.description ?? "");
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <PencilIcon data-icon="inline-start" />
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("simpleAccess.editTeam")}</DialogTitle>
          <DialogDescription>
            {t("simpleAccess.editTeamDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!pending && (await onSave({ name, description })))
              setOpen(false);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`edit-team-name-${team.id}`}>
                {t("teamName")}
              </FieldLabel>
              <Input
                id={`edit-team-name-${team.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={255}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-team-description-${team.id}`}>
                {t("descriptionLabel")}
              </FieldLabel>
              <Textarea
                id={`edit-team-description-${team.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("simpleAccess.cancel")}
            </Button>
            <MutatingButton pending={pending}>
              {t("simpleAccess.save")}
            </MutatingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
