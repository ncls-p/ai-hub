"use client";

import { useTranslations } from "next-intl";
import {
  formatManifestPreview,
  type ManifestPreviewData,
} from "./marketplace-i18n-helpers";

export function PublishPreviewSummary({
  preview,
}: {
  preview: ManifestPreviewData;
}) {
  const t = useTranslations("marketplace.manifest");
  const bullets = formatManifestPreview(preview, (key, values) =>
    t(key as "preview.agentModel", values),
  );

  if (bullets.length === 0) return null;

  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {bullets.map((bullet) => (
        <li key={bullet.label} className="flex items-start gap-2">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          {bullet.label}
        </li>
      ))}
    </ul>
  );
}
