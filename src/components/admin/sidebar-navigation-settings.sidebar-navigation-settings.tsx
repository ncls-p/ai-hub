"use client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useSettingsOrganizationId } from "./organization-settings-context";
import {
  SettingsLoadError,
  SettingsSection,
  SettingsSectionSkeleton,
  SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SidebarNavSection } from "@/modules/navigation/sidebar-config";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  PanelLeftIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SidebarNavItem,
  SidebarNavState,
} from "./sidebar-navigation-settings.sidebar-nav-item";
export function SidebarNavigationSettings() {
  const organizationId = useSettingsOrganizationId();
  const workspace = useWorkspace();
  const t = useTranslations("admin.settingsPage.sidebarNavigation");
  const tPage = useTranslations("admin.settingsPage");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [state, setState] = useState<SidebarNavState | null>(null);
  const [items, setItems] = useState<SidebarNavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(
          `/api/admin/sidebar-navigation?organizationId=${organizationId}`,
          { signal },
        );
        if (!res.ok) throw new Error(tPage("loadFailed"));
        const data = (await res.json()) as SidebarNavState;
        if (signal?.aborted) return;
        setState(data);
        setItems(data.config.items);
      } catch (error) {
        if (signal?.aborted) return;
        setLoadError(true);
        toast.error(
          error instanceof Error ? error.message : tPage("loadFailed"),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tPage, organizationId],
  );
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async settings bootstrap
    void loadSettings(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadSettings]);
  const labelById = new Map(
    (state?.catalog ?? []).map((entry) => [entry.id, entry.labelKey]),
  );
  const defaultSectionById = new Map(
    (state?.catalog ?? []).map((entry) => [entry.id, entry.defaultSection]),
  );
  function resolveItemSection(item: SidebarNavItem): SidebarNavSection {
    return item.section ?? defaultSectionById.get(item.id) ?? "advanced";
  }
  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }
  function toggleVisible(id: string, isVisible: boolean) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, visible: isVisible } : item,
      ),
    );
  }
  function setItemSection(id: string, section: SidebarNavSection) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, section } : item)),
    );
  }
  function reorderByDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === draggingId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggingId(null);
  }
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/sidebar-navigation?organizationId=${organizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        },
      );
      if (!res.ok) {
        throw new Error((await res.json()).error || tPage("saveFailed"));
      }
      const data = (await res.json()) as SidebarNavState;
      setState(data);
      setItems(data.config.items);
      toast.success(t("saved"));
      await workspace.refresh();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tPage("saveFailed"));
      return;
    } finally {
      setSaving(false);
    }
  }
  async function resetDefaults() {
    setResetting(true);
    try {
      const res = await fetch(
        `/api/admin/sidebar-navigation?organizationId=${organizationId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        throw new Error((await res.json()).error || tPage("resetFailed"));
      }
      const data = (await res.json()) as SidebarNavState;
      setState(data);
      setItems(data.config.items);
      toast.success(t("resetDone"));
      await workspace.refresh();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tPage("resetFailed"),
      );
      return;
    } finally {
      setResetting(false);
    }
  }
  if (loading) {
    return <SettingsSectionSkeleton rows={6} />;
  }
  if (loadError || !state) {
    return (
      <SettingsLoadError
        title={tPage("loadFailed")}
        description={tPage("loadErrorDescription")}
        retryLabel={tPage("retry")}
        onRetry={() => void loadSettings()}
      />
    );
  }
  const visibleCount = items.filter((item) => item.visible).length;
  return (
    <SettingsSection
      icon={PanelLeftIcon}
      title={t("title")}
      description={t("description")}
      stagger="stagger-2"
      badge={
        <SettingsStatusBadge
          label={state.isCustomized ? t("statusCustom") : t("statusDefault")}
          tone={state.isCustomized ? "primary" : "muted"}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <ul className="space-y-2">
          {items.map((item, index) => {
            const labelKey = labelById.get(item.id) ?? item.id;
            const section = resolveItemSection(item);
            return (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderByDrop(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border/70 bg-background/55 px-3 py-2.5 transition-colors",
                  draggingId === item.id && "border-primary/40 bg-primary/5",
                  !item.visible && "opacity-60",
                )}
              >
                <GripVerticalIcon
                  className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tNav(labelKey)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.id}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={section}
                    onValueChange={(value) =>
                      setItemSection(item.id, value as SidebarNavSection)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-[7.5rem]"
                      aria-label={t("sectionFor", { item: tNav(labelKey) })}
                    >
                      <SelectValue placeholder={t("section")} />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="primary">
                        {t("sectionPrimary")}
                      </SelectItem>
                      <SelectItem value="planning">
                        {t("sectionPlanning")}
                      </SelectItem>
                      <SelectItem value="advanced">
                        {t("sectionAdvanced")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    onClick={() => moveItem(item.id, -1)}
                    aria-label={t("moveUp")}
                  >
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(item.id, 1)}
                    aria-label={t("moveDown")}
                  >
                    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                  <div className="flex items-center gap-2 pl-1">
                    <Switch
                      id={`sidebar-nav-${item.id}`}
                      checked={item.visible}
                      onCheckedChange={(visible) =>
                        toggleVisible(item.id, visible)
                      }
                      aria-label={t("toggleVisibility", {
                        item: tNav(labelKey),
                      })}
                    />
                    <Label
                      htmlFor={`sidebar-nav-${item.id}`}
                      className="sr-only"
                    >
                      {t("toggleVisibility", { item: tNav(labelKey) })}
                    </Label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          {t("visibleCount", { count: visibleCount, total: items.length })}
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void resetDefaults()}
            disabled={saving || resetting}
          >
            {resetting ? <Spinner data-icon="inline-start" /> : null}
            {t("reset")}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || resetting || visibleCount === 0}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
