"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { GovernanceSelect } from "./governance-select";
export type LimitRow = {
  id: string;
  subjectType: "user" | "team" | "organization";
  subjectId: string;
  providerId: string | null;
  modelId: string | null;
  period: "day" | "month";
  tokenLimit: number | null;
  requestLimit: number | null;
  costLimitUsd: string | null;
};
export type LimitCatalog = {
  limits: LimitRow[];
  users: { id: string; name: string; email: string }[];
  teams: { id: string; name: string; organizationId: string }[];
  organizations: { id: string; name: string }[];
  providers: { id: string; name: string }[];
  models: { id: string; name: string; providerId: string }[];
};
export function UsageLimitEditor({
  catalog,
  initial,
  pending,
  onSave,
  onCancel,
}: {
  catalog: LimitCatalog;
  initial?: LimitRow;
  pending: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("governance");
  const [subjectType, setSubjectType] = useState(
    initial?.subjectType ?? "user",
  );
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [providerId, setProviderId] = useState(initial?.providerId ?? "all");
  const [modelId, setModelId] = useState(initial?.modelId ?? "all");
  const [period, setPeriod] = useState(initial?.period ?? "month");
  const [tokens, setTokens] = useState(initial?.tokenLimit?.toString() ?? "");
  const [requests, setRequests] = useState(
    initial?.requestLimit?.toString() ?? "",
  );
  const [cost, setCost] = useState(initial?.costLimitUsd ?? "");
  const subjects =
    subjectType === "user"
      ? catalog.users.map((user) => ({
          id: user.id,
          name: `${user.name} (${user.email})`,
        }))
      : subjectType === "team"
        ? catalog.teams.map((team) => ({
            id: team.id,
            name: `${team.name} · ${catalog.organizations.find((org) => org.id === team.organizationId)?.name ?? ""}`,
          }))
        : catalog.organizations;
  const all = { id: "all", name: t("all") };
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          id: initial?.id,
          subjectType,
          subjectId,
          providerId: providerId === "all" ? null : providerId,
          modelId: modelId === "all" ? null : modelId,
          period,
          tokenLimit: tokens === "" ? null : Number(tokens),
          requestLimit: requests === "" ? null : Number(requests),
          costLimitUsd: cost === "" ? null : Number(cost),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <GovernanceSelect
          label={t("subjectType")}
          value={subjectType}
          options={["user", "team", "organization"].map((id) => ({
            id,
            name: t(id),
          }))}
          onChange={(value) => {
            setSubjectType(value as typeof subjectType);
            setSubjectId("");
          }}
          disabled={pending || Boolean(initial)}
        />
        <GovernanceSelect
          label={t("subject")}
          value={subjectId}
          options={subjects}
          onChange={setSubjectId}
          disabled={pending || Boolean(initial)}
        />
        <GovernanceSelect
          label={t("provider")}
          value={providerId}
          options={[all, ...catalog.providers]}
          onChange={(value) => {
            setProviderId(value);
            setModelId("all");
          }}
          disabled={pending || Boolean(initial)}
        />
        <GovernanceSelect
          label={t("model")}
          value={modelId}
          options={[
            all,
            ...catalog.models.filter(
              (model) =>
                providerId === "all" || model.providerId === providerId,
            ),
          ]}
          onChange={setModelId}
          disabled={pending || Boolean(initial)}
        />
        <GovernanceSelect
          label={t("period")}
          value={period}
          options={["day", "month"].map((id) => ({ id, name: t(id) }))}
          onChange={(value) => setPeriod(value as typeof period)}
          disabled={pending || Boolean(initial)}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("limitFieldsHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            id: "tokens",
            label: t("tokens"),
            value: tokens,
            set: setTokens,
            step: "1",
          },
          {
            id: "requests",
            label: t("requests"),
            value: requests,
            set: setRequests,
            step: "1",
          },
          {
            id: "cost",
            label: t("cost"),
            value: cost,
            set: setCost,
            step: "0.00000001",
          },
        ].map((field) => (
          <Field key={field.id}>
            <FieldLabel htmlFor={`limit-${field.id}`}>{field.label}</FieldLabel>
            <Input
              id={`limit-${field.id}`}
              type="number"
              min="0"
              step={field.step}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              disabled={pending}
            />
          </Field>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pending || !subjectId || (!tokens && !requests && !cost)}
        >
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
