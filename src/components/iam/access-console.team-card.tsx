"use client";

import { TeamEditDialog } from "./team-edit-dialog";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AccessMember, AccessTeam } from "./access-console.access-member";
import { ConfirmRemovalButton } from "./access-console.scope-path";

export function TeamCard({
  team,
  members,
  canManage,
  canDelete,
  pending,
  onAdd,
  onRemove,
  onDelete,
  onEdit,
}: {
  team: AccessTeam;
  members: AccessMember[];
  canManage: boolean;
  canDelete: boolean;
  pending: string | null;
  onAdd: (userId: string) => Promise<boolean>;
  onRemove: (userId: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onEdit: (value: { name: string; description: string }) => Promise<boolean>;
}) {
  const t = useTranslations("access");
  const [userId, setUserId] = useState("");
  const availableMembers = members.filter(
    (member) =>
      !team.members.some((teamMember) => teamMember.userId === member.userId),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    if (await onAdd(userId)) setUserId("");
  }

  return (
    <Card>
      <CardHeader className="grid-cols-1">
        <CardTitle className="break-words [overflow-wrap:anywhere]">
          {team.name}
        </CardTitle>
        <CardDescription>
          {team.description || t("noTeamDescription")}
        </CardDescription>
        <CardAction className="col-start-1 row-start-auto flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t("memberCount", { count: team.members.length })}
          </Badge>
          {canManage ? (
            <TeamEditDialog
              team={team}
              pending={Boolean(pending)}
              onSave={onEdit}
            />
          ) : null}
          {canDelete ? (
            <ConfirmRemovalButton
              pending={pending === `delete-team-${team.id}`}
              label={t("deleteTeam", { name: team.name })}
              title={t("deleteTeamTitle", { name: team.name })}
              description={t("deleteTeamDescription")}
              onConfirm={() => void onDelete()}
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {team.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyTeam")}</p>
          ) : (
            team.members.map((member) => (
              <span
                key={member.id}
                className="flex min-w-0 max-w-full items-center gap-0.5"
              >
                <Badge
                  variant="outline"
                  className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                >
                  {member.name}
                </Badge>
                {canManage ? (
                  <ConfirmRemovalButton
                    pending={
                      pending === `team-member-${team.id}-${member.userId}`
                    }
                    label={t("removeTeamMember", { name: member.name })}
                    title={t("removeTeamMemberTitle", { name: member.name })}
                    description={t("removeTeamMemberDescription", {
                      team: team.name,
                    })}
                    onConfirm={() => void onRemove(member.userId)}
                  />
                ) : null}
              </span>
            ))
          )}
        </div>
        {canManage && availableMembers.length > 0 ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={submit}
          >
            <Field className="flex-1">
              <FieldLabel htmlFor={`team-member-${team.id}`}>
                {t("addTeamMember")}
              </FieldLabel>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id={`team-member-${team.id}`} className="w-full">
                  <SelectValue placeholder={t("chooseMember")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" disabled={!userId || Boolean(pending)}>
              {pending === `team-${team.id}` ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("add")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
