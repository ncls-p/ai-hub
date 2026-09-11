import { ResourceDistributionPanel } from "@/components/iam/resource-distribution-panel";
import { UsageLimitsPanel } from "@/components/iam/usage-limits-panel";
import { OrganizationDirectory } from "@/components/iam/organization-directory";
import { getTranslations } from "next-intl/server";

import { AccessConsole } from "@/components/iam/access-console";
import { WorkspacePage } from "@/components/workspace-page";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import { listAdminUsers } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

export default async function MembersPage() {
  const t = await getTranslations("access");
  const session = await getSession();
  const isPlatformAdmin = await isPlatformAdminSession(session);
  const users = isPlatformAdmin ? await listAdminUsers() : [];

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
    >
      <OrganizationDirectory />
      {isPlatformAdmin ? (
        <>
          <ResourceDistributionPanel />
          <UsageLimitsPanel />
        </>
      ) : null}
      <AccessConsole
        platformUsers={
          isPlatformAdmin
            ? users.map((user) => ({
                ...user,
                createdAt: user.createdAt.toISOString(),
              }))
            : undefined
        }
        currentUserId={session?.user.id}
      />
    </WorkspacePage>
  );
}
