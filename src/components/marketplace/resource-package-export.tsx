"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  downloadResourcePackage,
  type ResourcePackageExportTarget,
} from "./download-resource-package";

export function ResourcePackageExport({
  resource,
  workspaceId,
  presentation = "button",
  disabled = false,
}: {
  resource: ResourcePackageExportTarget;
  workspaceId: string | null;
  presentation?: "button" | "menu-item";
  disabled?: boolean;
}) {
  const t = useTranslations("resourcePackage");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function download() {
    if (!workspaceId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await downloadResourcePackage(resource, workspaceId, t("failed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const content = (
    <>
      {busy ? (
        <Spinner className="size-4" />
      ) : (
        <DownloadIcon className="size-4" aria-hidden="true" />
      )}
      {t("export")}
    </>
  );
  return presentation === "menu-item" ? (
    <DropdownMenuItem
      className="min-h-10"
      disabled={disabled || busy || !workspaceId}
      onSelect={(event) => {
        event.preventDefault();
        void download();
      }}
    >
      {content}
    </DropdownMenuItem>
  ) : (
    <Button
      variant="outline"
      disabled={disabled || busy || !workspaceId}
      onClick={() => void download()}
    >
      {content}
    </Button>
  );
}
