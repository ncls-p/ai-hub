"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmRemovalButton } from "./access-console.scope-path";
import {
  UsageLimitEditor,
  type LimitCatalog,
  type LimitRow,
} from "./usage-limit-editor";
export function UsageLimitsPanel() {
  const t = useTranslations("governance");
  const [catalog, setCatalog] = useState<LimitCatalog | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<LimitRow | "new" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<LimitCatalog>("/api/admin/usage-limits", {
      signal: controller.signal,
    })
      .then((data) => {
        setCatalog(data);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [revision]);
  async function mutate(
    method: "PUT" | "DELETE",
    data: Record<string, unknown>,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await fetchJson("/api/admin/usage-limits", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setCatalog(await fetchJson<LimitCatalog>("/api/admin/usage-limits"));
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      setPending(false);
      busy.current = false;
    }
  }
  function subjectName(limit: LimitRow) {
    const rows =
      limit.subjectType === "user"
        ? catalog?.users
        : limit.subjectType === "team"
          ? catalog?.teams
          : catalog?.organizations;
    return (
      rows?.find((row) => row.id === limit.subjectId)?.name ?? limit.subjectId
    );
  }
  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-label={t("usageLimits")}
    >
      <h2 className="text-base font-semibold">{t("usageLimits")}</h2>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("usageLimitsHint")}</p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {!catalog ? (
          <p role="status">{t("loading")}</p>
        ) : (
          <>
            <Button
              className="self-start"
              disabled={pending}
              onClick={() => setEditing("new")}
            >
              {t("addLimit")}
            </Button>
            {editing ? (
              <UsageLimitEditor
                key={typeof editing === "string" ? editing : editing.id}
                catalog={catalog}
                initial={editing === "new" ? undefined : editing}
                pending={pending}
                onSave={(data) => void mutate("PUT", data)}
                onCancel={() => setEditing(null)}
              />
            ) : null}
            {!catalog.limits.length ? (
              <p className="text-sm">{t("noLimits")}</p>
            ) : (
              catalog.limits.map((limit) => (
                <div
                  key={limit.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {subjectName(limit)} · {t(limit.period)}
                    </p>
                    <p className="break-words text-muted-foreground">
                      {catalog.providers.find(
                        (row) => row.id === limit.providerId,
                      )?.name ?? t("all")}{" "}
                      /{" "}
                      {catalog.models.find((row) => row.id === limit.modelId)
                        ?.name ?? t("all")}
                    </p>
                    <p>
                      {t("limitSummary", {
                        tokens: limit.tokenLimit ?? "∞",
                        requests: limit.requestLimit ?? "∞",
                        cost: limit.costLimitUsd ?? "∞",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => setEditing(limit)}
                    >
                      {t("edit")}
                    </Button>
                    <ConfirmRemovalButton
                      pending={pending}
                      label={t("delete")}
                      title={t("deleteLimitTitle")}
                      description={t("deleteLimitDescription")}
                      onConfirm={() => void mutate("DELETE", { id: limit.id })}
                    />
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}
