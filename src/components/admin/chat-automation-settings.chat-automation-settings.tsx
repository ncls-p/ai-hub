"use client";
import { useSettingsOrganizationId } from "./organization-settings-context";
import {
  SettingsDisabledNotice,
  SettingsFeatureToggle,
  SettingsLoadError,
  SettingsSection,
  SettingsSectionSkeleton,
  SettingsStatusBadge,
  SettingsToggleRow,
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
import { Link } from "@/i18n/navigation";
import { MessageSquareTextIcon, PlugZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChatAutomationConfig,
  ChatAutomationState,
  ChecklistItem,
  NONE,
} from "./chat-automation-settings.none";
export function ChatAutomationSettings() {
  const organizationId = useSettingsOrganizationId();
  const t = useTranslations("admin.settingsPage.chatAutomation");
  const tPage = useTranslations("admin.settingsPage");
  const [state, setState] = useState<ChatAutomationState | null>(null);
  const [config, setConfig] = useState<ChatAutomationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(
          `/api/admin/chat-automation?organizationId=${organizationId}`,
          { signal },
        );
        if (!res.ok) throw new Error(tPage("loadFailed"));
        const data = (await res.json()) as ChatAutomationState;
        if (signal?.aborted) return;
        setState(data);
        setConfig(data.config);
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
  const filteredModels =
    state && config?.providerId
      ? state.models.filter((model) => model.providerId === config.providerId)
      : [];
  function canSaveCurrentConfig(current: ChatAutomationConfig) {
    return !current.enabled || Boolean(current.providerId && current.modelId);
  }
  async function save() {
    if (!config) return;
    if (!canSaveCurrentConfig(config)) {
      toast.error(t("saveInvalid"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/chat-automation?organizationId=${organizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...config,
            providerId: config.providerId || undefined,
            modelId: config.modelId || undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || tPage("saveFailed"));
      }
      const nextConfig = (await res.json()) as ChatAutomationConfig;
      setConfig(nextConfig);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tPage("saveFailed"));
      return;
    } finally {
      setSaving(false);
    }
  }
  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/admin/chat-automation/test?organizationId=${organizationId}`,
        {
          method: "POST",
        },
      );
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error || t("testFailed"));
      }
      toast.success(t("testSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("testFailed"));
      return;
    } finally {
      setTesting(false);
    }
  }
  if (loading) {
    return <SettingsSectionSkeleton rows={4} />;
  }
  if (loadError || !state || !config) {
    return (
      <SettingsLoadError
        title={tPage("loadFailed")}
        description={tPage("loadErrorDescription")}
        retryLabel={tPage("retry")}
        onRetry={() => void loadSettings()}
      />
    );
  }
  const ready = Boolean(config.enabled && config.providerId && config.modelId);
  const savedReady = Boolean(
    state.config.enabled && state.config.providerId && state.config.modelId,
  );
  const statusLabel = !config.enabled
    ? t("statusDisabled")
    : ready
      ? t("statusReady")
      : t("statusIncomplete");
  const statusTone = !config.enabled ? "muted" : ready ? "success" : "warning";
  return (
    <SettingsSection
      icon={MessageSquareTextIcon}
      title={t("title")}
      description={t("description")}
      stagger="stagger-3"
      badge={<SettingsStatusBadge label={statusLabel} tone={statusTone} />}
    >
      <div className="space-y-5">
        <SettingsToggleRow
          id="chat-automation-enabled"
          label={t("enable")}
          description={t("enableDescription")}
          checked={config.enabled}
          onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
        />
        {!config.enabled ? (
          <SettingsDisabledNotice
            title={t("disabledTitle")}
            description={t("disabledDescription")}
          />
        ) : null}
        {config.enabled && state.providers.length === 0 ? (
          <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
            <PlugZapIcon
              className="mt-0.5 size-4 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                {t("noProvidersTitle")}
              </p>
              <p className="text-muted-foreground">
                {t("noProvidersDescription")}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/providers">{t("noProvidersAction")}</Link>
              </Button>
            </div>
          </div>
        ) : null}
        {config.enabled && !ready ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            <p className="mb-2 text-sm font-medium">{t("checklistTitle")}</p>
            <ul className="space-y-1.5">
              <ChecklistItem
                done={config.enabled}
                label={t("checklistEnable")}
              />
              <ChecklistItem
                done={Boolean(config.providerId)}
                label={t("checklistProvider")}
              />
              <ChecklistItem
                done={Boolean(config.modelId)}
                label={t("checklistModel")}
              />
              <ChecklistItem done={savedReady} label={t("checklistSave")} />
            </ul>
          </div>
        ) : null}
        {config.enabled ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("provider")}</Label>
                <Select
                  value={config.providerId || NONE}
                  onValueChange={(providerId) =>
                    setConfig({
                      ...config,
                      providerId: providerId === NONE ? undefined : providerId,
                      modelId: undefined,
                    })
                  }
                  disabled={state.providers.length === 0}
                >
                  <SelectTrigger aria-label={t("provider")}>
                    <SelectValue placeholder={t("providerPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("notConfigured")}</SelectItem>
                    {state.providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name} · {provider.kind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("model")}</Label>
                <Select
                  value={config.modelId || NONE}
                  onValueChange={(modelId) =>
                    setConfig({
                      ...config,
                      modelId: modelId === NONE ? undefined : modelId,
                    })
                  }
                  disabled={!config.providerId || filteredModels.length === 0}
                >
                  <SelectTrigger aria-label={t("model")}>
                    <SelectValue placeholder={t("modelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("notConfigured")}</SelectItem>
                    {filteredModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.displayName || model.modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsFeatureToggle
                icon={MessageSquareTextIcon}
                label={t("titles")}
                description={t("titlesDescription")}
                checked={config.generateTitles}
                onCheckedChange={(generateTitles) =>
                  setConfig({ ...config, generateTitles })
                }
              />
              <SettingsFeatureToggle
                icon={MessageSquareTextIcon}
                label={t("suggestions")}
                description={t("suggestionsDescription")}
                checked={config.generateSuggestions}
                onCheckedChange={(generateSuggestions) =>
                  setConfig({ ...config, generateSuggestions })
                }
              />
            </div>
          </>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
          {ready ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void testConnection()}
              disabled={testing || saving}
            >
              {testing ? <Spinner data-icon="inline-start" /> : null}
              {t("testConnection")}
            </Button>
          ) : null}
          <Button
            onClick={() => void save()}
            disabled={saving || testing || !canSaveCurrentConfig(config)}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
