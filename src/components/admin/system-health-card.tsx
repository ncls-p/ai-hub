"use client";

import { useEffect, useState } from "react";
import { ActivityIcon, DatabaseIcon, StoreIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  SettingsMetricRow,
  SettingsSection,
  SettingsSectionSkeleton,
  SettingsStatusBadge,
} from "@/components/admin/settings-panel";

type HealthResponse = {
  status: string;
  database?: string;
};

function useSystemHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [healthRes, marketplaceRes] = await Promise.all([
          fetch("/api/health"),
          fetch("/api/marketplace/items?status=pending_review"),
        ]);
        if (!cancelled && healthRes.ok) {
          setHealth((await healthRes.json()) as HealthResponse);
        }
        if (!cancelled && marketplaceRes.ok) {
          const items = (await marketplaceRes.json()) as unknown[];
          setPendingReviews(Array.isArray(items) ? items.length : 0);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setPendingReviews(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { health, loading, pendingReviews };
}

export function SystemHealthCard() {
  const t = useTranslations("admin.settingsPage.health");
  const { health, loading, pendingReviews } = useSystemHealth();

  if (loading) {
    return <SettingsSectionSkeleton rows={2} />;
  }

  const apiHealthy = health?.status === "ok";

  return (
    <SettingsSection
      icon={ActivityIcon}
      title={t("title")}
      description={t("description")}
      stagger="stagger-2"
      badge={
        <SettingsStatusBadge
          label={apiHealthy ? t("statusHealthy") : t("statusUnknown")}
          tone={apiHealthy ? "success" : "warning"}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <SettingsMetricRow
          label={t("apiHealth")}
          value={health?.status ?? t("statusUnknown")}
          icon={ActivityIcon}
          tone={apiHealthy ? "success" : "destructive"}
        />
        {health?.database ? (
          <SettingsMetricRow
            label={t("database")}
            value={health.database}
            icon={DatabaseIcon}
            tone={health.database === "ok" ? "success" : "warning"}
          />
        ) : null}
        {pendingReviews !== null ? (
          <SettingsMetricRow
            label={t("marketplacePending")}
            value={pendingReviews}
            icon={StoreIcon}
            tone={pendingReviews > 0 ? "warning" : "muted"}
          />
        ) : null}
      </div>
    </SettingsSection>
  );
}
