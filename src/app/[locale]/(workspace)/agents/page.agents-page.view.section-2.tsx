import {
  ArrowRightIcon,
  BotIcon,
  Grid2X2Icon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { ModelLogo } from "@/components/providers/model-logo";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCardActions } from "./page.agent-card-actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgentsPageViewModel } from "./page.agents-page.view";
import { ICON_SIZE_CLASS } from "./page.icon-size-class";
export function AgentsPageSection2({ model }: { model: AgentsPageViewModel }) {
  const {
    agentKindFilter,
    agents,
    canCreateAgent,
    displayMode,
    filteredAgents,
    loadError,
    loading,
    organizationDefaultAgentId,
    refreshAgents,
    router,
    searchQuery,
    setAgentKindFilter,
    setDisplayMode,
    setSearchQuery,
    setShowCreateDialog,
    t,
    tCommon,
    tList,
    userDefaultAgentId,
  } = model;
  return (
    <div className="flex flex-col gap-6">
      {/* Agents list card */}
      <section
        className={cn(
          "rounded-2xl",
          (loading || loadError || agents.length > 0) && "bg-transparent",
        )}
      >
        {/* Toolbar */}
        {!loading && !loadError && agents.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={tList("filterPlaceholder")}
                placeholder={tList("filterPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 bg-card/70 pl-9 text-sm"
              />
              {searchQuery ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setSearchQuery("")}
                  aria-label={tList("clearSearch")}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <div
              className="flex w-full items-center rounded-xl bg-muted/60 p-1 sm:ml-auto sm:w-auto"
              role="group"
              aria-label={tList("filterPlaceholder")}
            >
              {(
                [
                  {
                    value: "all",
                    label: tList("filterAll"),
                    count: agents.length,
                  },
                  {
                    value: "assistant",
                    label: tList("filterAssistants"),
                    count: agents.filter(
                      (agent) => agent.kind !== "orchestrator",
                    ).length,
                  },
                  {
                    value: "orchestrator",
                    label: tList("filterOrchestrators"),
                    count: agents.filter(
                      (agent) => agent.kind === "orchestrator",
                    ).length,
                  },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={agentKindFilter === filter.value}
                  onClick={() => setAgentKindFilter(filter.value)}
                  className={cn(
                    "flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium transition-[background-color,color,box-shadow] sm:flex-none",
                    agentKindFilter === filter.value
                      ? "bg-card text-foreground shadow-[var(--control-shadow)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span className="font-mono text-[0.6rem] text-primary">
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 shrink-0 rounded-xl bg-card/70"
              aria-label={
                displayMode === "grid"
                  ? tList("showAsList")
                  : tList("showAsGrid")
              }
              onClick={() =>
                setDisplayMode((current) =>
                  current === "grid" ? "list" : "grid",
                )
              }
            >
              {displayMode === "grid" ? (
                <Grid2X2Icon className="size-4" aria-hidden="true" />
              ) : (
                <ListIcon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        ) : null}

        {/* List content */}
        {loading ? (
          <PageLoading
            label={tCommon("loading")}
            className="border-0 shadow-none"
          />
        ) : loadError ? (
          <div className="px-5 py-12 text-center" role="alert">
            <p className="text-sm font-medium">{tList("loadErrorTitle")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refreshAgents()}
            >
              {tList("retry")}
            </Button>
          </div>
        ) : agents.length === 0 ? (
          <PageEmptyState
            icon={BotIcon}
            title={tList("emptyTitle")}
            description={tList("emptyDescription")}
            className="min-h-[22rem]"
          >
            {canCreateAgent ? (
              <Button onClick={() => setShowCreateDialog(true)}>
                <PlusIcon className={ICON_SIZE_CLASS} aria-hidden="true" />
                {tList("emptyCta")}
              </Button>
            ) : null}
          </PageEmptyState>
        ) : filteredAgents.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {tList("noMatch", { query: searchQuery })}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3 pt-4",
              displayMode === "grid" && "sm:grid-cols-2",
            )}
          >
            {filteredAgents.map((agent) => {
              const isReady = Boolean(
                agent.activeVersionId && agent.modelDisplayName,
              );
              const isOrganizationDefault =
                agent.id === organizationDefaultAgentId ||
                agent.isOrganizationDefault;
              const isUserDefault = agent.id === userDefaultAgentId;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    "group flex min-h-48 min-w-0 flex-col rounded-2xl border border-border/70 bg-card/82 p-4 shadow-[var(--surface-shadow)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[var(--surface-shadow-hover)]",
                    isOrganizationDefault &&
                      "border-primary/20 bg-primary/[0.025]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ModelLogo
                      logoUrl={agent.logoUrl}
                      label={agent.name}
                      size="md"
                      imageFit="cover"
                      className={cn(
                        "rounded-xl",
                        agent.kind === "orchestrator" &&
                          "border border-primary/25 bg-primary/5 text-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-[-0.015em]">
                        {agent.name}
                      </p>
                      <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
                        {agent.kind === "orchestrator"
                          ? tList("kindOrchestrator")
                          : tList("kindAssistant")}
                        {" · "}
                        {agent.isGlobal
                          ? tList("scopeOrganization")
                          : tList("scopePersonal")}
                      </p>
                    </div>
                    <AgentCardActions
                      agent={agent}
                      model={model}
                      isReady={isReady}
                      isUserDefault={isUserDefault}
                    />
                  </div>

                  <p className="mt-4 min-h-10 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {agent.description || tList("descriptionFallback")}
                  </p>

                  <div className="mt-4 flex min-h-7 flex-wrap items-center gap-1.5">
                    {agent.modelDisplayName ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-muted/55 px-2 py-1 text-[0.62rem] font-normal text-muted-foreground"
                      >
                        {agent.modelDisplayName}
                      </Badge>
                    ) : null}
                    {typeof agent.toolCount === "number" ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-muted/55 px-2 py-1 text-[0.62rem] font-normal text-muted-foreground"
                      >
                        {tList("toolCount", { count: agent.toolCount })}
                      </Badge>
                    ) : null}
                    <ResourceProvenanceBadge provenance={agent.provenance} />
                    {agent.isRecommended ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-primary/8 px-2 py-1 text-[0.62rem] font-normal text-primary"
                      >
                        {tList("badgeRecommended")}
                      </Badge>
                    ) : null}
                    {isOrganizationDefault || isUserDefault ? (
                      <Badge
                        variant="outline"
                        className="rounded-lg border-transparent bg-primary/8 px-2 py-1 text-[0.62rem] font-normal text-primary"
                      >
                        {isUserDefault
                          ? tList("badgeMyDefault")
                          : tList("badgeOrganizationDefault")}
                      </Badge>
                    ) : null}
                    {agent.hiddenInChat ? (
                      <Badge variant="secondary">
                        {tList("hiddenFromChat")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center border-t border-border/60 pt-3">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-[0.7rem]",
                        isReady ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      <i
                        className={cn(
                          "size-1.5 rounded-full",
                          isReady ? "bg-success" : "bg-muted-foreground/60",
                        )}
                        aria-hidden="true"
                      />
                      {isReady ? t("statusReady") : tList("statusNeedsSetup")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-10 gap-1 rounded-xl px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,scale] hover:text-foreground active:scale-[0.96]"
                      onClick={() =>
                        router.push(
                          isReady
                            ? `/chat?agentId=${agent.id}`
                            : `/agents/${agent.id}`,
                        )
                      }
                    >
                      {isReady
                        ? t("chat")
                        : agent.canEdit
                          ? tList("setup")
                          : tList("view")}
                      <ArrowRightIcon className="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
