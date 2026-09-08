"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { describeResourcePackage } from "@/modules/resource-package/summary";

type Preview = ReturnType<typeof describeResourcePackage>;

export function ResourcePackageImport({
  workspaceId,
}: {
  workspaceId: string | null;
}) {
  const t = useTranslations("resourcePackage");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const requestId = useRef(0);
  const inFlight = useRef(false);

  function reset(nextOpen: boolean) {
    if (inFlight.current) return;
    requestId.current++;
    setOpen(nextOpen);
    setError(null);
    setPreview(null);
    setFile(null);
  }

  async function submit(previewOnly: boolean) {
    if (!file || !workspaceId || inFlight.current) return;
    const currentRequest = ++requestId.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(t("tooLarge"));
      const response = await fetch(
        `/api/workspace/resource-packages?${new URLSearchParams({ workspaceId, preview: String(previewOnly) })}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: file,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("failed"));
      if (requestId.current !== currentRequest) return;
      if (previewOnly) setPreview(data.preview);
      else {
        toast.success(t("imported", { name: data.resource.name }));
        setOpen(false);
        const paths: Record<string, string> = {
          agent: `/agents/${data.resource.id}`,
          skill: "/tools?tab=skills",
          mcp_preset: "/tools?tab=mcp",
          custom_tool: "/custom-tools",
          workflow: `/workflows/${data.resource.id}`,
        };
        router.push(paths[data.resource.type] ?? "/marketplace");
      }
    } catch (failure) {
      if (requestId.current === currentRequest)
        setError(failure instanceof Error ? failure.message : t("failed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={!workspaceId}
        onClick={() => reset(true)}
      >
        <Upload data-icon="inline-start" />
        {t("import")}
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("import")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="resource-package-file">{t("file")}</FieldLabel>
            <Input
              id="resource-package-file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {preview && (
            <div className="flex min-w-0 flex-col gap-3">
              <p className="font-medium break-words">{preview.name}</p>
              <ul className="max-h-48 overflow-y-auto text-sm">
                {preview.resources.map((resource, index) => (
                  <li key={index} className="break-words">
                    {t(
                      resource.agentKind === "orchestrator"
                        ? "types.orchestrator"
                        : `types.${resource.type}`,
                    )}{" "}
                    — {resource.name}
                  </li>
                ))}
              </ul>
              <Alert>
                <AlertDescription>{t("copies")}</AlertDescription>
              </Alert>
              {(preview.models.length > 0 ||
                preview.knowledge.length > 0 ||
                preview.requiresCredentials) && (
                <Alert>
                  <AlertDescription className="flex flex-col gap-2">
                    {preview.requiresCredentials && <p>{t("credentials")}</p>}
                    {preview.models.length > 0 && (
                      <p>{t("models", { names: preview.models.join(", ") })}</p>
                    )}
                    {preview.knowledge.length > 0 && (
                      <p>
                        {t("knowledge", {
                          names: preview.knowledge.join(", "),
                        })}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => reset(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={!file || busy}
              onClick={() => void submit(!preview)}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {preview ? t("confirm") : t("preview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
