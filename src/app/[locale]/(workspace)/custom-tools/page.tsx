import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomToolBuilder } from "@/components/custom-tools/custom-tool-builder";
import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("customTools");
  return { title: t("title") };
}

export default async function CustomToolsPage() {
  const t = await getTranslations("customTools");

  return (
    <RequireWorkspaceAccess required="canConfigureTools">
      <WorkspacePage
        title={t("title")}
        description={t("description")}
        width="wide"
      >
        <CustomToolBuilder />
      </WorkspacePage>
    </RequireWorkspaceAccess>
  );
}
