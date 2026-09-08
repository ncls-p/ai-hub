import { ResourcePackageImport } from "@/components/marketplace/resource-package-import";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { ResourceShareDialog } from "@/components/marketplace/resource-share-dialog";
import { PageEmptyState } from "@/components/page-empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePage } from "@/components/workspace-page";
import { PackagePlus, Search, Share2, Store } from "lucide-react";
import { MarketplaceItemCard } from "./page.marketplace-item-card";
import type { useMarketplacePageController } from "./page.marketplace-page";

type Model = Extract<
  ReturnType<typeof useMarketplacePageController>,
  { kind: "ready" }
>;
export function MarketplacePageView({ model }: { model: Model }) {
  const {
    currentUserId,
    deleting,
    filteredMyItems,
    filteredPublished,
    filteredShared,
    handleDelete,
    handleFeature,
    handleInstall,
    handleUnfeature,
    hasMarketplaceItems,
    isAdmin,
    locale,
    openShareDialog,
    pendingDelete,
    reload,
    requestDelete,
    search,
    setPendingDelete,
    setSearch,
    setShareResource,
    setSortBy,
    setTypeFilter,
    shareResource,
    sortBy,
    t,
    tMarketplace,
    typeFilter,
    typeOptions,
    workspaceId,
  } = model;
  return (
    <WorkspacePage
      title={tMarketplace("title")}
      description={tMarketplace("description")}
      actions={
        <ResourcePackageImport key={workspaceId} workspaceId={workspaceId} />
      }
    >
      {!hasMarketplaceItems ? (
        <PageEmptyState
          icon={Store}
          title={t("emptyAll")}
          description={t("emptyAllDescription")}
          className="min-h-[22rem]"
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                aria-label={t("searchPlaceholder")}
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger
                className="w-full sm:w-32"
                aria-label={t("filterType")}
              >
                <SelectValue placeholder={t("filterType")} />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                {typeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger
                className="w-full sm:w-36"
                aria-label={t("filterSort")}
              >
                <SelectValue placeholder={t("filterSort")} />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100]">
                <SelectItem value="featured">{t("sort.featured")}</SelectItem>
                <SelectItem value="newest">{t("sort.newest")}</SelectItem>
                <SelectItem value="downloads">{t("sort.downloads")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                {t("tabs.all", { count: filteredPublished.length })}
              </TabsTrigger>
              <TabsTrigger value="my-items">
                {t("tabs.myItems", { count: filteredMyItems.length })}
              </TabsTrigger>
              <TabsTrigger value="shared">
                {t("tabs.shared", { count: filteredShared.length })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {filteredPublished.length === 0 ? (
                <PageEmptyState
                  icon={Store}
                  title={t("emptyAll")}
                  description={t("emptyAllDescription")}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPublished.map((item) => (
                    <MarketplaceItemCard
                      key={item.id}
                      item={item}
                      isOwner={item.publisherUserId === currentUserId}
                      isAdmin={isAdmin}
                      locale={locale}
                      t={t}
                      tMarketplace={tMarketplace}
                      onInstall={handleInstall}
                      onShare={openShareDialog}
                      onDelete={requestDelete}
                      onFeature={handleFeature}
                      onUnfeature={handleUnfeature}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-items" className="mt-4">
              {filteredMyItems.length === 0 ? (
                <PageEmptyState
                  icon={PackagePlus}
                  title={t("emptyMy")}
                  description={t("emptyMyDescription")}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMyItems.map((item) => (
                    <MarketplaceItemCard
                      key={item.id}
                      item={item}
                      isOwner={true}
                      isAdmin={isAdmin}
                      locale={locale}
                      t={t}
                      tMarketplace={tMarketplace}
                      onInstall={handleInstall}
                      onShare={openShareDialog}
                      onDelete={requestDelete}
                      onFeature={handleFeature}
                      onUnfeature={handleUnfeature}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="shared" className="mt-4">
              {filteredShared.length === 0 ? (
                <PageEmptyState
                  icon={Share2}
                  title={t("emptyShared")}
                  description={t("emptySharedDescription")}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredShared.map((item) => (
                    <MarketplaceItemCard
                      key={item.id}
                      item={item}
                      isOwner={item.publisherUserId === currentUserId}
                      isAdmin={isAdmin}
                      locale={locale}
                      t={t}
                      tMarketplace={tMarketplace}
                      onInstall={handleInstall}
                      onShare={openShareDialog}
                      onDelete={requestDelete}
                      onFeature={handleFeature}
                      onUnfeature={handleUnfeature}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
        onSuccessAction={reload}
      />
      <DestructiveConfirmationDialog
        open={pendingDelete !== null}
        title={t("deleteConfirm")}
        description={t("deleteDescription", {
          name: pendingDelete?.name ?? "",
        })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={deleting ? t("deleting") : t("delete")}
        busy={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete.id);
        }}
      />
    </WorkspacePage>
  );
}
