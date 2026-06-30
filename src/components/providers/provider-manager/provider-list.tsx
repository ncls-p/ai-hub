import {
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { KIND_LABELS, kindAccent } from "./constants";
import {
  HealthIndicator,
  ProviderCardSkeleton,
  ProviderTypeIcon,
} from "./provider-shared";
import type { SafeProvider } from "./types";

type ProviderListProps = {
  providers: SafeProvider[];
  filteredProviders: SafeProvider[];
  selectedProviderId: string | null;
  providerSearch: string;
  loadingProviders: boolean;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onAddProvider: () => void;
  onSelectProvider: (providerId: string) => void;
  onToggleProvider: (provider: SafeProvider) => void;
  onTestProvider: (providerId: string) => void;
  onEditProvider: (provider: SafeProvider) => void;
  onDeleteProvider: (providerId: string) => void;
};

export function ProviderList(props: ProviderListProps) {
  return (
    <section className="rounded-xl border bg-card">
      <ProviderListHeader {...props} />
      <ProviderListBody {...props} />
    </section>
  );
}

function ProviderListHeader({
  providers,
  providerSearch,
  onSearchChange,
}: ProviderListProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-base font-semibold">{t("connections")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("configuredConnections", { count: providers.length })}
        </p>
      </div>
      {providers.length > 2 ? (
        <div className="relative w-56 sm:w-64">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="provider-search"
            autoComplete="off"
            placeholder={t("filterConnections")}
            value={providerSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-9 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}

function ProviderListBody(props: ProviderListProps) {
  const t = useTranslations("providers.manager");
  const { loadingProviders, filteredProviders, providers, providerSearch } =
    props;

  if (loadingProviders) {
    return (
      <div className="space-y-1 p-2">
        <ProviderCardSkeleton />
        <ProviderCardSkeleton />
      </div>
    );
  }

  if (filteredProviders.length === 0 && providers.length === 0) {
    return <EmptyProviders onAddProvider={props.onAddProvider} />;
  }

  if (filteredProviders.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        {t("noProviderMatch", { query: providerSearch })}
      </div>
    );
  }

  return (
    <div className="divide-y">
      {filteredProviders.map((provider) => (
        <ProviderRow key={provider.id} provider={provider} {...props} />
      ))}
    </div>
  );
}

function EmptyProviders({ onAddProvider }: { onAddProvider: () => void }) {
  const t = useTranslations("providers.manager");
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium">{t("noConnections")}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {t("noConnectionsHint")}
      </p>
      <Button size="sm" className="mt-4" onClick={onAddProvider}>
        <PlusIcon className="size-4" aria-hidden="true" />
        {t("addFirstProvider")}
      </Button>
    </div>
  );
}

function ProviderRow({
  provider,
  selectedProviderId,
  busy,
  onSelectProvider,
  onToggleProvider,
  onTestProvider,
  onEditProvider,
  onDeleteProvider,
}: ProviderListProps & { provider: SafeProvider }) {
  const t = useTranslations("providers.manager");
  const colors = kindAccent(provider.kind);
  const isSelected = selectedProviderId === provider.id;

  function selectOnKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectProvider(provider.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectProvider(provider.id)}
      onKeyDown={selectOnKeyboard}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected ? "bg-muted/50" : "",
      )}
    >
      <div
        className={cn(
          "hidden h-8 w-1 shrink-0 rounded-full sm:block",
          colors.bar,
        )}
      />
      <ProviderTypeIcon kind={provider.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{provider.name}</p>
          {isSelected ? (
            <Badge variant="secondary" className="text-xs">
              {t("active")}
            </Badge>
          ) : null}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {provider.baseUrl || t("defaultEndpoint")}
        </p>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {KIND_LABELS[provider.kind]}
      </span>
      <HealthIndicator
        status={provider.healthStatus}
        lastChecked={provider.lastCheckedAt}
      />
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={provider.enabled}
          onCheckedChange={() => onToggleProvider(provider)}
          size="sm"
          aria-label={
            provider.enabled ? t("disableProvider") : t("enableProvider")
          }
        />
      </div>
      <ProviderActions
        busy={busy}
        provider={provider}
        onEditProvider={onEditProvider}
        onTestProvider={onTestProvider}
        onDeleteProvider={onDeleteProvider}
      />
    </div>
  );
}

function ProviderActions({
  busy,
  provider,
  onEditProvider,
  onTestProvider,
  onDeleteProvider,
}: Pick<
  ProviderListProps,
  "busy" | "onEditProvider" | "onTestProvider" | "onDeleteProvider"
> & { provider: SafeProvider }) {
  const t = useTranslations("providers.manager");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("providerActions")}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEditProvider(provider)}>
          {t("editConnection")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onClick={() => onTestProvider(provider.id)}
        >
          <RefreshCwIcon className="size-4" aria-hidden="true" />
          {t("testConnection")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDeleteProvider(provider.id)}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
          {t("archiveProvider")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
