"use client";

import type { ElementType } from "react";
import {
  ActivityIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  BarChart3Icon,
  CalendarRangeIcon,
  FilterIcon,
  GaugeIcon,
  LayersIcon,
  RotateCcwIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface UsageEvent {
  id: string;
  operation: string;
  inputTokens: number | null;
  outputTokens: number | null;
  status: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface UsageResponse {
  totals: { inputTokens: number; outputTokens: number; events: number };
  events: UsageEvent[];
  quota: {
    limit: number;
    used: number;
    remaining: number;
  } | null;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatLatency(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusTone(status: string | null) {
  const normalized = status?.toLowerCase() ?? "";
  if (
    normalized === "success" ||
    normalized === "ok" ||
    normalized === "completed"
  ) {
    return "success" as const;
  }
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure"
  ) {
    return "destructive" as const;
  }
  return "muted" as const;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-transparent bg-card p-4 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow] duration-150 ease-out hover:shadow-[var(--surface-shadow-hover)]">
      <div
        className={cn(
          "absolute top-0 left-0 h-full w-1 opacity-70 transition-opacity duration-150 ease-out group-hover:opacity-100",
          accent,
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </span>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 ease-out group-hover:scale-[1.03]",
            color,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function QuotaHero({
  quota,
  t,
}: {
  quota: NonNullable<UsageResponse["quota"]>;
  t: ReturnType<typeof useTranslations<"admin.usage">>;
}) {
  const ratio = quota.used / quota.limit;
  const percent = Math.min(100, Math.round(ratio * 100));
  const isWarning = ratio >= 0.8;

  return (
    <section className="overflow-hidden rounded-2xl border border-transparent bg-card p-0 shadow-[var(--surface-shadow)] animate-in-fade">
      <div className="relative border-b px-5 py-6 sm:px-6 sm:py-7">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary">
              <GaugeIcon className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {t("monthlyTokens")}
              </span>
            </div>
            <p className="text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
              {formatCount(quota.used)}
              <span className="text-lg font-medium text-muted-foreground">
                {" "}
                / {formatCount(quota.limit)}
              </span>
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("monthlyTokensDescription", {
                used: formatCount(quota.used),
                limit: formatCount(quota.limit),
              })}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge
              variant={isWarning ? "destructive" : "secondary"}
              className="rounded-full px-3 py-1"
            >
              {percent}% {t("used")}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {t("remaining", { count: formatCount(quota.remaining) })}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <div className="h-2.5 overflow-hidden rounded-full bg-muted/80">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
              isWarning ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        {isWarning ? (
          <p className="mt-3 text-sm text-warning">{t("quotaWarning")}</p>
        ) : null}
      </div>
    </section>
  );
}

function UsageFilters({
  operationFilter,
  fromDate,
  toDate,
  busy,
  onOperationChangeAction,
  onFromChangeAction,
  onToChangeAction,
  onApplyAction,
  onResetAction,
  t,
}: {
  operationFilter: string;
  fromDate: string;
  toDate: string;
  busy: boolean;
  onOperationChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
  t: ReturnType<typeof useTranslations<"admin.usage">>;
}) {
  const hasFilters = Boolean(operationFilter.trim() || fromDate || toDate);

  return (
    <section className="rounded-2xl border border-transparent bg-card p-4 shadow-[var(--surface-shadow)] sm:p-5 animate-in-fade stagger-2">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <FilterIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        {t("filters")}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_10rem_10rem_auto] lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="usage-operation-filter">{t("operationFilter")}</Label>
          <Input
            id="usage-operation-filter"
            autoComplete="off"
            placeholder={t("operationPlaceholder")}
            value={operationFilter}
            onChange={(e) => onOperationChangeAction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApplyAction();
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="usage-from">{t("from")}</Label>
          <div className="relative">
            <CalendarRangeIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="usage-from"
              type="date"
              className="pl-9"
              value={fromDate}
              onChange={(e) => onFromChangeAction(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="usage-to">{t("to")}</Label>
          <div className="relative">
            <CalendarRangeIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="usage-to"
              type="date"
              className="pl-9"
              value={toDate}
              onChange={(e) => onToChangeAction(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="outline"
            disabled={!hasFilters || busy}
            onClick={onResetAction}
          >
            <RotateCcwIcon className="size-4" aria-hidden="true" />
            {t("resetFilter")}
          </Button>
          <Button disabled={busy} onClick={onApplyAction}>
            {t("applyFilter")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function TokenChart({
  events,
  t,
}: {
  events: UsageEvent[];
  t: ReturnType<typeof useTranslations<"admin.usage">>;
}) {
  const chartEvents = [...events].slice(0, 24).reverse();
  const chartMaxTokens = Math.max(
    ...chartEvents.map(
      (event) => (event.inputTokens ?? 0) + (event.outputTokens ?? 0),
    ),
    1,
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-transparent bg-card p-5 shadow-[var(--surface-shadow)] animate-in-fade stagger-3">
      <div className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <BarChart3Icon className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">{t("tokenChart")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("tokenChartDescription", { count: chartEvents.length })}
        </p>
      </div>

      {chartEvents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
          <BarChart3Icon
            className="size-8 text-muted-foreground/60"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">{t("noChartData")}</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-1" />
              {t("inputLegend")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-2" />
              {t("outputLegend")}
            </span>
          </div>
          <div className="flex h-44 items-end gap-1.5 sm:gap-2">
            {chartEvents.map((event) => {
              const input = event.inputTokens ?? 0;
              const output = event.outputTokens ?? 0;
              const total = input + output;
              const height = Math.max(6, (total / chartMaxTokens) * 100);
              const inputShare = total > 0 ? (input / total) * 100 : 50;
              return (
                <div
                  key={event.id}
                  className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${event.operation}: ${formatCount(input)} in / ${formatCount(output)} out`}
                >
                  <div
                    className="flex min-h-[6px] w-full flex-col justify-end overflow-hidden rounded-t-md border border-border/40 bg-muted/30 transition-[border-color,height] duration-150 ease-out group-hover:border-primary/30"
                    style={{ height: `${height}%` }}
                  >
                    {output > 0 ? (
                      <div
                        className="w-full bg-chart-2"
                        style={{ height: `${100 - inputShare}%` }}
                      />
                    ) : null}
                    {input > 0 ? (
                      <div
                        className="w-full bg-chart-1"
                        style={{ height: `${inputShare}%` }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function UsageEventRow({
  event,
  t,
}: {
  event: UsageEvent;
  t: ReturnType<typeof useTranslations<"admin.usage">>;
}) {
  const input = event.inputTokens ?? 0;
  const output = event.outputTokens ?? 0;
  const total = input + output;
  const tone = statusTone(event.status);
  const createdAt = new Date(event.createdAt);

  return (
    <article className="group flex flex-col gap-3 rounded-xl border border-transparent bg-background/80 px-4 py-3 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-muted/20 hover:shadow-[var(--surface-shadow-hover)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-md font-mono text-[11px]">
            {event.operation}
          </Badge>
          {event.status ? (
            <Badge
              variant={
                tone === "success"
                  ? "default"
                  : tone === "destructive"
                    ? "destructive"
                    : "secondary"
              }
              className="rounded-md capitalize"
            >
              {event.status}
            </Badge>
          ) : null}
          <time
            className="text-xs tabular-nums text-muted-foreground"
            dateTime={event.createdAt}
            title={createdAt.toLocaleString()}
          >
            {createdAt.toLocaleString()}
          </time>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
            <ArrowDownToLineIcon
              className="size-3.5 text-chart-1"
              aria-hidden="true"
            />
            {formatCount(input)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
            <ArrowUpFromLineIcon
              className="size-3.5 text-chart-2"
              aria-hidden="true"
            />
            {formatCount(output)}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
            <ZapIcon className="size-3.5" aria-hidden="true" />
            {formatLatency(event.latencyMs)}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-1 sm:w-36 sm:shrink-0">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>{t("tokens")}</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatCount(total)}
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          {input > 0 ? (
            <div
              className="bg-chart-1"
              style={{ width: `${total > 0 ? (input / total) * 100 : 0}%` }}
            />
          ) : null}
          {output > 0 ? (
            <div
              className="bg-chart-2"
              style={{ width: `${total > 0 ? (output / total) * 100 : 0}%` }}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function UsageEventList({
  events,
  t,
}: {
  events: UsageEvent[];
  t: ReturnType<typeof useTranslations<"admin.usage">>;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-transparent bg-card p-5 shadow-[var(--surface-shadow)] animate-in-fade stagger-4">
      <div className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">{t("recentUsage")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("recentUsageDescription")}
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
          <ActivityIcon
            className="size-8 text-muted-foreground/60"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
        </div>
      ) : (
        <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
          {events.map((event) => (
            <UsageEventRow key={event.id} event={event} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

export function UsageDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
      </div>
    </div>
  );
}

export function UsageDashboard({
  data,
  busy,
  operationFilter,
  fromDate,
  toDate,
  onOperationChangeAction,
  onFromChangeAction,
  onToChangeAction,
  onApplyAction,
  onResetAction,
}: {
  data: UsageResponse;
  busy: boolean;
  operationFilter: string;
  fromDate: string;
  toDate: string;
  onOperationChangeAction: (value: string) => void;
  onFromChangeAction: (value: string) => void;
  onToChangeAction: (value: string) => void;
  onApplyAction: () => void;
  onResetAction: () => void;
}) {
  const t = useTranslations("admin.usage");
  const totalTokens = data.totals.inputTokens + data.totals.outputTokens;

  return (
    <div className="flex flex-col gap-6">
      {data.quota ? <QuotaHero quota={data.quota} t={t} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-in-up stagger-1">
        <StatCard
          label={t("events")}
          value={formatCount(data.totals.events)}
          icon={ActivityIcon}
          color="bg-primary/10 text-primary"
          accent="bg-primary"
        />
        <StatCard
          label={t("inputTokens")}
          value={formatCount(data.totals.inputTokens)}
          icon={ArrowDownToLineIcon}
          color="bg-chart-1/15 text-chart-1"
          accent="bg-chart-1"
        />
        <StatCard
          label={t("outputTokens")}
          value={formatCount(data.totals.outputTokens)}
          icon={ArrowUpFromLineIcon}
          color="bg-chart-2/15 text-chart-2"
          accent="bg-chart-2"
        />
        <StatCard
          label={t("totalTokens")}
          value={formatCount(totalTokens)}
          icon={LayersIcon}
          color="bg-info/10 text-info"
          accent="bg-info"
        />
      </div>

      <UsageFilters
        operationFilter={operationFilter}
        fromDate={fromDate}
        toDate={toDate}
        busy={busy}
        onOperationChangeAction={onOperationChangeAction}
        onFromChangeAction={onFromChangeAction}
        onToChangeAction={onToChangeAction}
        onApplyAction={onApplyAction}
        onResetAction={onResetAction}
        t={t}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TokenChart events={data.events} t={t} />
        </div>
        <div className="lg:col-span-3">
          <UsageEventList events={data.events} t={t} />
        </div>
      </div>
    </div>
  );
}
