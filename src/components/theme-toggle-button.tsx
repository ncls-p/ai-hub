"use client";

import { MoonStarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@teispace/next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggleButton({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations("shell");
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "rounded-full text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      aria-label={t("toggleTheme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <MoonStarIcon
        data-icon={iconOnly ? undefined : "inline-start"}
        aria-hidden="true"
        className="transition-transform duration-300"
      />
      {iconOnly ? <span className="sr-only">{t("theme")}</span> : t("theme")}
    </Button>
  );
}
