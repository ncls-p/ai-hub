"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeftIcon } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GovernanceSelect } from "./governance-select";
import { Spinner } from "@/components/ui/spinner";
type Preview = {
  counts: Record<string, number>;
  confirmationToken: string;
  conflictResolutions: {
    resourceId: string;
    label: string;
    from: string;
    to: string;
  }[];
};
export function ProjectTransferDialog({
  workspaceId,
  onTransferred,
}: {
  workspaceId: string;
  onTransferred: () => Promise<void>;
}) {
  const t = useTranslations("access.projectTransfer");
  const countsT = useTranslations("access.scopeCounts");
  const { refresh } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [destinations, setDestinations] = useState<
    { id: string; name: string }[]
  >([]);
  const [destination, setDestination] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  async function load() {
    setPending(true);
    setError("");
    setPreview(null);
    setDestination("");
    setDestinations([]);
    try {
      const data = await fetchJson<{ destinations: typeof destinations }>(
        `/api/workspace/iam/projects/transfer?sourceWorkspaceId=${workspaceId}`,
      );
      setDestinations(data.destinations);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("failed"));
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    setPending(true);
    setError("");
    try {
      const data = await fetchJson<Preview>(
        "/api/workspace/iam/projects/transfer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: preview ? "execute" : "preview",
            sourceWorkspaceId: workspaceId,
            targetOrganizationId: destination,
            confirmationToken: preview?.confirmationToken,
          }),
        },
      );
      if (preview) {
        await refresh();
        await onTransferred();
        setOpen(false);
      } else setPreview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("failed"));
      setPreview(null);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (value) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeftIcon data-icon="inline-start" />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => void load()}
                disabled={pending}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <GovernanceSelect
          label={t("destination")}
          value={destination}
          options={destinations}
          disabled={pending}
          onChange={(value) => {
            setDestination(value);
            setPreview(null);
          }}
        />
        {!pending && !error && !destinations.length ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}
        {preview ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              {Object.entries(preview.counts).map(([key, count]) => (
                <div key={key} className="rounded-lg border p-3">
                  <dt className="text-sm text-muted-foreground">
                    {countsT(key)}
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
            <Alert>
              <AlertDescription>{t("accessWarning")}</AlertDescription>
            </Alert>
            <Alert>
              <AlertDescription>{t("dependenciesWarning")}</AlertDescription>
            </Alert>
            {preview.conflictResolutions.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {preview.conflictResolutions.map((item) => (
                  <li key={item.resourceId}>
                    {item.label}: {item.from} → {item.to}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || !destination}
            onClick={() => void submit()}
          >
            {pending ? <Spinner /> : null}
            {preview ? t("confirm") : t("preview")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
