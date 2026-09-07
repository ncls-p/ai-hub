import { getTranslations } from "next-intl/server";
import { WorkspacePage } from "@/components/workspace-page";
import { getSession } from "@/modules/auth/session";
import { SettingsPasswordCard } from "./settings-password-card";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const session = await getSession();
  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="default"
    >
      <div className="flex max-w-2xl flex-col gap-6">
        <section className="border-b pb-5" aria-label={t("accountTitle")}>
          <h2 className="text-base font-medium break-words [overflow-wrap:anywhere]">
            {session?.user.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground break-all">
            {session?.user.email}
          </p>
        </section>
        <SettingsPasswordCard />
      </div>
    </WorkspacePage>
  );
}
