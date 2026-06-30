"use client";

import { LanguagesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsSection } from "@/components/admin/settings-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function SettingsLocaleCard() {
  const t = useTranslations("settings");

  return (
    <SettingsSection
      icon={LanguagesIcon}
      title={t("languageTitle")}
      description={t("languageDescription")}
      stagger="stagger-1"
    >
      <LocaleSwitcher className="w-full max-w-xs" />
    </SettingsSection>
  );
}
