"use client";

import {
  ImageIcon,
  PaletteIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { applyOrganizationTheme } from "@/components/organization-theme";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  type OrganizationTheme,
  type OrganizationThemeConfig,
} from "@/modules/organization/themes";
import {
  copyOrganizationHero,
  DEFAULT_ORGANIZATION_HERO,
  type OrganizationHeroConfig,
} from "@/modules/organization/hero-branding";
import { OrganizationHeroEditor } from "./organization-hero-editor";
import { OrganizationThemeEditor } from "./organization-theme-editor";

type Branding = {
  organizationName: string;
  logoUrl: string | null;
  theme: OrganizationTheme;
  themeConfig: OrganizationThemeConfig | null;
  heroConfig: OrganizationHeroConfig | null;
  canManage: boolean;
};

async function readLogo(file: File) {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
    throw new Error("invalid_type");
  }
  if (file.size > 256 * 1024) throw new Error("too_large");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function OrganizationBrandingContent() {
  const t = useTranslations("settings.branding");
  const { workspaceId, refresh } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<OrganizationTheme>("ocean");
  const [themeConfig, setThemeConfig] =
    useState<OrganizationThemeConfig | null>(null);
  const [heroConfig, setHeroConfig] = useState<OrganizationHeroConfig>(() =>
    copyOrganizationHero(),
  );
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void fetch(`/api/workspace/branding?workspaceId=${workspaceId}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("load_failed");
        return response.json() as Promise<Branding>;
      })
      .then((data) => {
        setBranding(data);
        setLogoUrl(data.logoUrl);
        setTheme(data.theme);
        setThemeConfig(data.themeConfig);
        setHeroConfig(
          copyOrganizationHero(data.heroConfig ?? DEFAULT_ORGANIZATION_HERO),
        );
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
  }, [t, workspaceId, retry]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setLogoUrl(await readLogo(file));
    } catch (error) {
      const code = error instanceof Error ? error.message : "read_failed";
      toast.error(
        t(
          code === "too_large"
            ? "logoTooLarge"
            : code === "invalid_type"
              ? "logoInvalid"
              : "logoReadFailed",
        ),
      );
    }
  }

  async function save() {
    if (!workspaceId || !branding?.canManage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/workspace/branding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          logoUrl,
          theme,
          themeConfig,
          heroConfig,
        }),
      });
      if (!response.ok) throw new Error("save_failed");
      applyOrganizationTheme(theme, themeConfig);
      await refresh();
      setBranding({ ...branding, logoUrl, theme, themeConfig, heroConfig });
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("loadFailed")}</AlertTitle>
        <AlertDescription>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoadError(false);
              setRetry((value) => value + 1);
            }}
          >
            {t("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!branding) return <Skeleton className="h-80 rounded-2xl" />;
  const savedHero = branding.heroConfig ?? DEFAULT_ORGANIZATION_HERO;
  const dirty =
    logoUrl !== branding.logoUrl ||
    theme !== branding.theme ||
    JSON.stringify(themeConfig) !== JSON.stringify(branding.themeConfig) ||
    JSON.stringify(heroConfig) !== JSON.stringify(savedHero);
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--surface-shadow)]">
      <div className="border-b px-5 py-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PaletteIcon className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("description", { organization: branding.organizationName })}
        </p>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[14rem_1fr]">
        <div>
          <Label>{t("logo")}</Label>
          <button
            type="button"
            disabled={!branding.canManage}
            onClick={() => inputRef.current?.click()}
            className="mt-2 grid h-28 w-full place-items-center overflow-hidden rounded-xl border border-dashed bg-muted/25 transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={branding.organizationName}
                width={180}
                height={72}
                unoptimized
                className="max-h-16 w-auto max-w-[11rem] object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="size-6" aria-hidden="true" />
                {t("logoEmpty")}
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          {branding.canManage ? (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <UploadIcon className="size-4" aria-hidden="true" />
                {t("chooseLogo")}
              </Button>
              {logoUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogoUrl(null)}
                >
                  {t("removeLogo")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <OrganizationThemeEditor
          theme={theme}
          themeConfig={themeConfig}
          disabled={!branding.canManage}
          onThemeChange={setTheme}
          onThemeConfigChange={setThemeConfig}
        />
      </div>
      <OrganizationHeroEditor
        value={heroConfig}
        disabled={!branding.canManage}
        onChange={setHeroConfig}
      />
      <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {branding.canManage ? t("scopeHint") : t("readOnly")}
        </p>
        {branding.canManage ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setLogoUrl(branding.logoUrl);
                setTheme(branding.theme);
                setThemeConfig(branding.themeConfig);
                setHeroConfig(copyOrganizationHero(savedHero));
              }}
            >
              <RotateCcwIcon className="size-4" aria-hidden="true" />
              {t("reset")}
            </Button>
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function OrganizationBrandingCard() {
  const { workspaceId, isLoading } = useWorkspace();
  const t = useTranslations("settings.branding");
  if (isLoading && !workspaceId)
    return <Skeleton className="h-80 rounded-2xl" />;
  if (!workspaceId)
    return (
      <p className="text-sm text-muted-foreground">{t("noOrganization")}</p>
    );
  return <OrganizationBrandingContent key={workspaceId} />;
}
