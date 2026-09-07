"use client";

import { LanguagesIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ORGANIZATION_HERO_LOCALES,
  type OrganizationHeroConfig,
  type OrganizationHeroCopy,
  type OrganizationHeroLocale,
} from "@/modules/organization/hero-branding";

const COPY_FIELDS = [
  "kicker",
  "lineOne",
  "lineTwoPrefix",
  "accent",
  "lineTwoSuffix",
] as const satisfies readonly (keyof OrganizationHeroCopy)[];

export function OrganizationHeroEditor(props: {
  value: OrganizationHeroConfig;
  disabled: boolean;
  onChange: (value: OrganizationHeroConfig) => void;
}) {
  const t = useTranslations("settings.branding.hero");

  function update(
    locale: OrganizationHeroLocale,
    field: keyof OrganizationHeroCopy,
    value: string,
  ) {
    props.onChange({
      ...props.value,
      [locale]: { ...props.value[locale], [field]: value },
    });
  }

  return (
    <div className="border-t border-border/60 px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <SparklesIcon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {ORGANIZATION_HERO_LOCALES.map((locale) => (
          <fieldset
            key={locale}
            disabled={props.disabled}
            className="min-w-0 rounded-2xl border border-border/65 bg-muted/15 p-4"
          >
            <legend className="px-1">
              <span className="inline-flex items-center gap-2 text-xs font-semibold">
                <LanguagesIcon
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                {t(`locales.${locale}`)}
              </span>
            </legend>
            <div className="mb-4 rounded-xl border border-border/55 bg-background/75 px-4 py-3 text-center">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-primary">
                {props.value[locale].kicker}
              </p>
              <p className="mt-2 text-lg font-medium leading-tight tracking-[-0.035em]">
                {props.value[locale].lineOne}
                <span className="block">
                  {props.value[locale].lineTwoPrefix}{" "}
                  <em className="font-editorial font-normal text-primary">
                    {props.value[locale].accent}
                  </em>{" "}
                  {props.value[locale].lineTwoSuffix}
                </span>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {COPY_FIELDS.map((field, index) => (
                <div
                  key={field}
                  className={index < 2 ? "sm:col-span-2" : undefined}
                >
                  <Label
                    htmlFor={`hero-${locale}-${field}`}
                    className="text-xs"
                  >
                    {t(`fields.${field}`)}
                  </Label>
                  <Input
                    id={`hero-${locale}-${field}`}
                    value={props.value[locale][field]}
                    onChange={(event) =>
                      update(locale, field, event.target.value)
                    }
                    maxLength={field === "kicker" ? 80 : 100}
                    className="mt-1.5 h-9 bg-background text-xs"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
