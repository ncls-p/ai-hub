"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ORGANIZATION_THEME_PRESETS,
  resolveOrganizationTheme,
  THEME_TOKEN_KEYS,
  type OrganizationTheme,
  type OrganizationThemeConfig,
  type ThemePalette,
  type ThemeToken,
} from "@/modules/organization/themes";

const PRESET_NAMES = ["ocean", "forest", "ember", "violet", "slate"] as const;

function copyTheme(theme: OrganizationThemeConfig): OrganizationThemeConfig {
  return { light: { ...theme.light }, dark: { ...theme.dark } };
}

function palettePreview(palette: ThemePalette) {
  return [palette.background, palette.primary, palette.accent];
}

function ThemeChoice(props: {
  name: OrganizationTheme;
  colors: string[];
  selected: boolean;
  disabled: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onSelect}
      aria-pressed={props.selected}
      className={cn(
        "rounded-xl border p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px",
        props.selected
          ? "border-primary ring-2 ring-primary/15"
          : "border-border",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="mb-2 flex h-8 overflow-hidden rounded-lg border">
        {props.colors.map((color, index) => (
          <i
            key={`${color}-${index}`}
            className="flex-1"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="text-sm font-medium">{props.label}</span>
    </button>
  );
}

function tokenLabel(token: ThemeToken) {
  return token.replaceAll("-", " ");
}

function ThemePreviewSurface(props: {
  mode: "light" | "dark";
  palette: ThemePalette;
  label: string;
}) {
  return (
    <div
      data-theme-preview={props.mode}
      data-preview-primary={props.palette.primary}
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{
        backgroundColor: props.palette.background,
        borderColor: props.palette.border,
        color: props.palette.foreground,
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          backgroundColor: props.palette.sidebar,
          borderColor: props.palette["sidebar-border"],
          color: props.palette["sidebar-foreground"],
        }}
      >
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em]">
          Maiah
        </span>
        <span className="text-[0.6rem] opacity-70">{props.label}</span>
      </div>
      <div className="grid grid-cols-[2.4rem_1fr] gap-2 p-2.5">
        <div
          className="rounded-lg border p-1.5"
          style={{
            backgroundColor: props.palette.sidebar,
            borderColor: props.palette["sidebar-border"],
          }}
        >
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="mb-1 block h-1.5 rounded-full last:mb-0"
              style={{
                backgroundColor:
                  item === 0
                    ? props.palette["sidebar-primary"]
                    : props.palette["sidebar-accent"],
              }}
            />
          ))}
        </div>
        <div
          className="rounded-lg border p-2"
          style={{
            backgroundColor: props.palette.card,
            borderColor: props.palette.border,
            color: props.palette["card-foreground"],
          }}
        >
          <span className="block h-1.5 w-2/3 rounded-full bg-current opacity-80" />
          <span
            className="mt-1.5 block h-1.5 w-full rounded-full"
            style={{ backgroundColor: props.palette.muted }}
          />
          <span
            className="mt-2 block h-4 w-1/2 rounded-md"
            style={{ backgroundColor: props.palette.primary }}
          />
        </div>
      </div>
    </div>
  );
}

function ThemePreview({ config }: { config: OrganizationThemeConfig }) {
  const t = useTranslations("settings.branding");
  return (
    <div className="mt-4 rounded-xl border bg-muted/10 p-3">
      <p className="mb-2 text-xs font-medium text-foreground">{t("preview")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ThemePreviewSurface
          mode="light"
          palette={config.light}
          label={t("light")}
        />
        <ThemePreviewSurface
          mode="dark"
          palette={config.dark}
          label={t("dark")}
        />
      </div>
    </div>
  );
}

function PaletteFields(props: {
  mode: "light" | "dark";
  palette: ThemePalette;
  disabled: boolean;
  onChange: (palette: ThemePalette) => void;
}) {
  const t = useTranslations("settings.branding");
  return (
    <details
      className="rounded-xl border bg-muted/10"
      open={props.mode === "light"}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {t(props.mode)}
      </summary>
      <div className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
        {THEME_TOKEN_KEYS.map((token) => (
          <Label key={token} className="gap-1.5 capitalize">
            {tokenLabel(token)}
            <span className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
              <input
                type="color"
                value={props.palette[token]}
                disabled={props.disabled}
                aria-label={`${props.mode} ${tokenLabel(token)}`}
                className="size-7 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) =>
                  props.onChange({
                    ...props.palette,
                    [token]: event.target.value,
                  })
                }
              />
              <span className="font-mono text-xs text-muted-foreground">
                {props.palette[token]}
              </span>
            </span>
          </Label>
        ))}
      </div>
    </details>
  );
}

export function OrganizationThemeEditor(props: {
  theme: OrganizationTheme;
  themeConfig: OrganizationThemeConfig | null;
  disabled: boolean;
  onThemeChange: (theme: OrganizationTheme) => void;
  onThemeConfigChange: (theme: OrganizationThemeConfig) => void;
}) {
  const t = useTranslations("settings.branding");
  const customTheme =
    props.themeConfig ?? copyTheme(ORGANIZATION_THEME_PRESETS.ocean);
  const previewTheme = resolveOrganizationTheme(props.theme, props.themeConfig);

  function selectCustom() {
    if (!props.themeConfig) props.onThemeConfigChange(customTheme);
    props.onThemeChange("custom");
  }

  return (
    <div>
      <Label>{t("theme")}</Label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PRESET_NAMES.map((name) => (
          <ThemeChoice
            key={name}
            name={name}
            colors={palettePreview(ORGANIZATION_THEME_PRESETS[name].light)}
            selected={props.theme === name}
            disabled={props.disabled}
            label={t(`themes.${name}`)}
            onSelect={() => props.onThemeChange(name)}
          />
        ))}
        <ThemeChoice
          name="custom"
          colors={palettePreview(customTheme.light)}
          selected={props.theme === "custom"}
          disabled={props.disabled}
          label={t("themes.custom")}
          onSelect={selectCustom}
        />
      </div>
      <ThemePreview config={previewTheme} />
      {props.theme === "custom" ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("customHint")}</p>
          {(["light", "dark"] as const).map((mode) => (
            <PaletteFields
              key={mode}
              mode={mode}
              palette={customTheme[mode]}
              disabled={props.disabled}
              onChange={(palette) =>
                props.onThemeConfigChange({ ...customTheme, [mode]: palette })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
