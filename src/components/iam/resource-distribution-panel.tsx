"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GovernanceSelect } from "./governance-select";
import type { DirectoryOrganization } from "./organization-directory";
const types = [
  "agent",
  "provider",
  "model",
  "knowledge_base",
  "mcp_server",
  "skill",
  "workflow",
  "custom_tool",
];
export function ResourceDistributionPanel() {
  const t = useTranslations("governance");
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState<DirectoryOrganization[]>(
    [],
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [type, setType] = useState("agent");
  const [resources, setResources] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [resourceId, setResourceId] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  const key = `${type}:${resourceId}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchJson<{ organizations: DirectoryOrganization[] }>(
      "/api/organizations",
      { signal: controller.signal },
    )
      .then((data) => setOrganizations(data.organizations))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [open, revision]);
  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      workspaceId,
      resourceType: type,
      search: query,
      offset: String(offset),
    });
    fetchJson<{
      resources: { id: string; name: string }[];
      nextOffset: number | null;
    }>(`/api/admin/resource-organizations?${params}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setResources((current) =>
          offset ? [...current, ...data.resources] : data.resources,
        );
        setNextOffset(data.nextOffset);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [open, workspaceId, type, query, offset, revision]);
  useEffect(() => {
    if (!resourceId) return;
    const controller = new AbortController();
    fetchJson<{ organizationIds: string[] }>(
      `/api/admin/resource-organizations?${new URLSearchParams({ resourceType: type, resourceId })}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setRecipientIds(data.organizationIds);
        setLoadedKey(key);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadedKey("");
          setError(error.message);
        }
      });
    return () => controller.abort();
  }, [resourceId, type, key, revision]);
  function resetSelection() {
    setResourceId("");
    setLoadedKey("");
    setResources([]);
    setOffset(0);
    setSaved(false);
  }
  async function save() {
    if (busy.current || loadedKey !== key) return;
    busy.current = true;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await fetchJson("/api/admin/resource-organizations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: type,
          resourceId,
          organizationIds: recipientIds,
          includeDependencies: type === "agent" && includeDependencies,
        }),
      });
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <details
      className="rounded-xl border p-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        {t("distribution")}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("distributionHint")}</p>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <GovernanceSelect
            label={t("sourceProject")}
            value={workspaceId}
            options={organizations.flatMap((org) =>
              org.projects.map((project) => ({
                id: project.id,
                name: `${org.name} · ${project.name}`,
              })),
            )}
            disabled={pending}
            onChange={(value) => {
              setWorkspaceId(value);
              resetSelection();
            }}
          />
          <GovernanceSelect
            label={t("resourceType")}
            value={type}
            options={types.map((id) => ({
              id,
              name: t(`resourceTypes.${id}`),
            }))}
            disabled={pending}
            onChange={(value) => {
              setType(value);
              resetSelection();
            }}
          />
        </div>
        {workspaceId ? (
          <>
            <Input
              aria-label={t("searchResource")}
              placeholder={t("searchResource")}
              value={query}
              disabled={pending}
              onChange={(event) => {
                setQuery(event.target.value);
                resetSelection();
              }}
            />
            <GovernanceSelect
              label={t("resource")}
              value={resourceId}
              options={resources}
              disabled={pending}
              onChange={(value) => {
                setResourceId(value);
                setSaved(false);
              }}
            />
            {nextOffset !== null ? (
              <Button variant="outline" onClick={() => setOffset(nextOffset)}>
                {t("loadMore")}
              </Button>
            ) : null}
          </>
        ) : null}
        {resourceId ? (
          loadedKey !== key ? (
            <p role="status">{t("loading")}</p>
          ) : (
            <>
              <fieldset
                className="grid gap-2 sm:grid-cols-2"
                disabled={pending}
              >
                <legend className="mb-2 text-sm font-medium">
                  {t("recipients")}
                </legend>
                {organizations.map((org) => (
                  <label
                    key={org.id}
                    className="flex min-h-10 items-center gap-2 text-sm"
                  >
                    <Checkbox
                      aria-label={org.name}
                      checked={recipientIds.includes(org.id)}
                      disabled={pending}
                      onCheckedChange={(checked) => {
                        setRecipientIds((current) =>
                          checked
                            ? [...current, org.id]
                            : current.filter((id) => id !== org.id),
                        );
                        setSaved(false);
                      }}
                    />
                    {org.name}
                  </label>
                ))}
              </fieldset>
              {type === "agent" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label={t("includeDependencies")}
                    checked={includeDependencies}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      setIncludeDependencies(value === true)
                    }
                  />
                  {t("includeDependencies")}
                </label>
              ) : null}
              <Button
                className="self-start"
                disabled={pending || Boolean(error)}
                onClick={() => void save()}
              >
                {t("saveSharing")}
              </Button>
              {saved ? (
                <p role="status" className="text-sm">
                  {t("saved")}
                </p>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </details>
  );
}
