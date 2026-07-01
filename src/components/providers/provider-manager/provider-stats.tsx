import { useTranslations } from "next-intl";

import { MetricCell } from "@/components/ui/metric-cell";
import { AUTH_TYPE_LABELS, KIND_LABELS } from "./constants";
import { HealthIndicator, ProviderTypeIcon } from "./provider-shared";
import type { ProviderModel, SafeProvider } from "./types";

export function SystemStrip({
  providers,
  models,
}: {
  providers: SafeProvider[];
  models: ProviderModel[];
}) {
  const t = useTranslations("providers.manager");
  const healthyCount = providers.filter(
    (p) => p.healthStatus === "healthy",
  ).length;
  const enabledCount = providers.filter((p) => p.enabled).length;
  const totalModels = providers.reduce(
    (sum, p) => sum + models.filter((m) => m.providerId === p.id).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <MetricCell label={t("connections")} value={providers.length} />
      <MetricCell label={t("models")} value={totalModels} />
      <MetricCell label={t("healthy")} value={healthyCount} accent />
      <MetricCell label={t("enabled")} value={enabledCount} />
    </div>
  );
}

export function StatsSidebar({
  models,
  selectedProvider,
}: {
  models: ProviderModel[];
  selectedProvider: SafeProvider | null;
}) {
  const t = useTranslations("providers.manager");
  const enabledModels = models.filter((m) => m.enabled).length;

  return (
    <aside className="lg:sticky lg:top-6">
      <div className="rounded-xl border bg-card">
        <div className="border-b bg-muted/30 px-5 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("connectionDetails")}
          </p>
        </div>
        {selectedProvider ? (
          <div className="divide-y">
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <ProviderTypeIcon kind={selectedProvider.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {selectedProvider.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABELS[selectedProvider.kind]}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x">
              <div className="px-5 py-4">
                <p className="text-xl font-bold">{models.length}</p>
                <p className="text-xs text-muted-foreground">{t("models")}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xl font-bold text-success">
                  {enabledModels}
                </p>
                <p className="text-xs text-muted-foreground">{t("enabled")}</p>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("status")}</span>
                <HealthIndicator
                  status={selectedProvider.healthStatus}
                  lastChecked={selectedProvider.lastCheckedAt}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("auth")}</span>
                <span className="font-medium">
                  {AUTH_TYPE_LABELS[selectedProvider.authType]}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("endpoint")}</span>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {selectedProvider.baseUrl || t("defaultEndpoint")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("selectProviderDetails")}
          </div>
        )}
      </div>
    </aside>
  );
}
