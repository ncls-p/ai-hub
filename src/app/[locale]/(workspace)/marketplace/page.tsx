"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import {
  Download,
  ExternalLink,
  PackagePlus,
  Search,
  Share2,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { WorkspacePage } from "@/components/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceShell } from "@/components/app-shell";
import { formatMarketplaceDate } from "@/components/marketplace/marketplace-i18n-helpers";
import {
  ItemIcon,
  getItemLabel,
} from "@/components/marketplace/marketplace-shared";
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";

interface MarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  visibility: string;
  installCount: number;
  totalDownloads: number;
  isFeatured: boolean;
  featuredOrder?: number | null;
  ratingAverage?: string | null;
  verifiedPublisher: boolean;
  publishedAt: string | null;
  createdAt: string;
  tagsJson: string[] | null;
  publisherUserId: string;
  shareCount?: number;
}

type MarketplaceFilters = {
  search: string;
  typeFilter: string;
  sortBy: string;
};

type MarketplaceItemComparator = (
  a: MarketplaceItem,
  b: MarketplaceItem,
) => number;

function matchesMarketplaceSearch(item: MarketplaceItem, query: string) {
  const searchableValues = [
    item.name,
    item.description,
    ...(item.tagsJson ?? []),
  ];
  return searchableValues.some((value) => value?.toLowerCase().includes(query));
}

const MARKETPLACE_SORTERS: Record<string, MarketplaceItemComparator> = {
  newest: (a, b) =>
    new Date(b.publishedAt ?? b.createdAt).getTime() -
    new Date(a.publishedAt ?? a.createdAt).getTime(),
  downloads: (a, b) => b.totalDownloads - a.totalDownloads,
  featured: (a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const orderDiff = (b.featuredOrder ?? 0) - (a.featuredOrder ?? 0);
    return orderDiff || b.totalDownloads - a.totalDownloads;
  },
};

function filterMarketplaceItems(
  items: MarketplaceItem[],
  { search, typeFilter }: MarketplaceFilters,
) {
  const query = search.trim().toLowerCase();

  return items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    return query ? matchesMarketplaceSearch(item, query) : true;
  });
}

function filterAndSortMarketplaceItems(
  items: MarketplaceItem[],
  filters: MarketplaceFilters,
): MarketplaceItem[] {
  const sorter =
    MARKETPLACE_SORTERS[filters.sortBy] ?? MARKETPLACE_SORTERS.featured;
  return [...filterMarketplaceItems(items, filters)].sort(sorter);
}

function MarketplaceItemCard({
  item,
  isOwner,
  onInstall,
  onShare,
  onDelete,
  onFeature,
  onUnfeature,
  isAdmin,
  locale,
  t,
  tMarketplace,
}: {
  item: MarketplaceItem;
  isOwner: boolean;
  isAdmin: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"marketplace.list">>;
  tMarketplace: ReturnType<typeof useTranslations<"marketplace">>;
  onInstall: (id: string) => void;
  onShare: (item: MarketplaceItem) => void;
  onDelete: (id: string) => void;
  onFeature: (id: string) => void;
  onUnfeature: (id: string) => void;
}) {
  const itemTypeLabel = getItemLabel(item.type, (key) =>
    tMarketplace(key as "itemTypes.agent"),
  );

  return (
    <Card
      className={
        item.isFeatured
          ? "ring-1 ring-yellow-500/30 bg-yellow-500/[0.03]"
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <div className="flex items-center justify-center size-9 shrink-0 rounded-lg bg-muted">
            <ItemIcon
              type={item.type}
              className="size-5 text-muted-foreground"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CardTitle className="text-base leading-snug">
                {item.name}
              </CardTitle>
              {item.isFeatured ? (
                <Badge
                  variant="default"
                  className="shrink-0 bg-yellow-500 text-black text-[10px] uppercase tracking-wide"
                >
                  <Star className="size-3 mr-0.5 fill-current" />
                  {t("featured")}
                </Badge>
              ) : null}
            </div>
            <CardDescription className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {itemTypeLabel}
              </Badge>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
        {item.tagsJson && item.tagsJson.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tagsJson.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Download className="size-3" /> {item.totalDownloads}
            </span>
            <span>{formatMarketplaceDate(item.publishedAt, locale)}</span>
          </div>
          <div className="flex items-center gap-1">
            {isOwner && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t("share")}
                  onClick={() => onShare(item)}
                >
                  <Share2 className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-destructive"
                  aria-label={t("delete")}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </>
            )}
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={
                  item.isFeatured ? t("toast.unfeatured") : t("toast.featured")
                }
                onClick={() =>
                  item.isFeatured ? onUnfeature(item.id) : onFeature(item.id)
                }
              >
                <Star
                  className={`size-3 ${item.isFeatured ? "fill-yellow-400 text-yellow-400" : ""}`}
                />
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onInstall(item.id)}
          >
            <PackagePlus className="size-3 mr-1" />
            {t("install")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/marketplace/items/${item.id}`}>
              <ExternalLink className="size-3 mr-1" />
              {t("viewDetails")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("marketplace.list");
  const tMarketplace = useTranslations("marketplace");
  const { workspaceId } = useWorkspace();
  const { currentUserId, isAdmin = false } = useWorkspaceShell();
  const [loading, setLoading] = useState(true);
  const [publishedItems, setPublishedItems] = useState<MarketplaceItem[]>([]);
  const [ownedItems, setOwnedItems] = useState<MarketplaceItem[]>([]);
  const [sharedItems, setSharedItems] = useState<MarketplaceItem[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("featured");

  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );

  const typeOptions = useMemo(
    () =>
      [
        { value: "all", labelKey: "types.all" },
        { value: "agent", labelKey: "types.agent" },
        { value: "skill", labelKey: "types.skill" },
        { value: "custom_tool", labelKey: "types.custom_tool" },
        { value: "mcp_preset", labelKey: "types.mcp_preset" },
      ] as const,
    [],
  );

  const fetchMarketplaceData = useCallback(async (): Promise<{
    published: MarketplaceItem[];
    owned: MarketplaceItem[];
    shared: MarketplaceItem[];
  }> => {
    const [publishedRes, mineRes, sharedRes] = await Promise.all([
      fetch("/api/marketplace/items"),
      fetch("/api/marketplace/items?_path=my-items"),
      fetch("/api/marketplace/items?_path=shared-with-me"),
    ]);

    if (!publishedRes.ok || !mineRes.ok || !sharedRes.ok) {
      throw new Error(t("toast.loadFailed"));
    }

    const published = (await publishedRes.json()) as MarketplaceItem[];
    const mine = (await mineRes.json()) as MarketplaceItem[];
    const sharedData = await sharedRes.json();
    const shared = Array.isArray(sharedData)
      ? sharedData.map((s: { item: MarketplaceItem }) => s.item)
      : [];
    return { published, owned: mine, shared };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceData()
      .then((data) => {
        if (!cancelled) {
          setPublishedItems(data.published);
          setOwnedItems(data.owned);
          setSharedItems(data.shared);
        }
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(
            error instanceof Error ? error.message : t("toast.loadFailed"),
          );
        return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMarketplaceData, t]);

  const filters = useMemo<MarketplaceFilters>(
    () => ({ search, typeFilter, sortBy }),
    [search, typeFilter, sortBy],
  );

  const myItems = useMemo(
    () => ownedItems.filter((item) => item.publisherUserId === currentUserId),
    [ownedItems, currentUserId],
  );

  const filteredPublished = useMemo(
    () => filterAndSortMarketplaceItems(publishedItems, filters),
    [publishedItems, filters],
  );

  const filteredMyItems = useMemo(
    () => filterAndSortMarketplaceItems(myItems, filters),
    [myItems, filters],
  );

  const filteredShared = useMemo(
    () => filterAndSortMarketplaceItems(sharedItems, filters),
    [sharedItems, filters],
  );

  const handleInstall = useCallback(
    async (itemId: string) => {
      if (!workspaceId) return;
      try {
        const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        if (res.ok) {
          const payload = await res.json();
          toast.success(t("toast.installed"));
          if (payload.requiresCredentials) {
            toast.info(t("toast.credentialsNeeded"), { duration: 8000 });
          }
          if (payload.agent?.id) {
            router.push(`/agents/${payload.agent.id}`);
          } else if (payload.skill?.id) {
            router.push("/tools?tab=skills");
          } else if (payload.custom_tool?.id) {
            router.push("/custom-tools");
          } else if (payload.mcp_preset?.id) {
            router.push("/tools?tab=mcp");
          }
        } else {
          toast.error(
            (await res.json().catch(() => ({}))).error ||
              t("toast.installFailed"),
          );
        }
      } catch {
        toast.error(t("toast.installFailed"));
        return;
      }
    },
    [workspaceId, router, t],
  );

  const reload = useCallback(() => {
    fetchMarketplaceData()
      .then((data) => {
        setPublishedItems(data.published);
        setOwnedItems(data.owned);
        setSharedItems(data.shared);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : t("toast.loadFailed"),
        );
        return;
      });
  }, [fetchMarketplaceData, t]);

  const handleDelete = useCallback(
    async (itemId: string) => {
      if (!confirm(t("deleteConfirm"))) return;
      const res = await fetch(`/api/marketplace/items/${itemId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(t("toast.deleted"));
        reload();
      } else {
        toast.error(t("toast.installFailed"));
      }
    },
    [reload, t],
  );

  const handleFeature = useCallback(
    async (itemId: string) => {
      const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(t("toast.featured"));
        reload();
      } else {
        toast.error(t("toast.loadFailed"));
      }
    },
    [reload, t],
  );

  const handleUnfeature = useCallback(
    async (itemId: string) => {
      const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(t("toast.unfeatured"));
        reload();
      } else {
        toast.error(t("toast.loadFailed"));
      }
    },
    [reload, t],
  );

  const openShareDialog = useCallback((item: MarketplaceItem) => {
    setShareResource({
      kind: "marketplace_item",
      id: item.id,
      name: item.name,
      publisherUserId: item.publisherUserId,
    });
  }, []);

  if (loading) return <PageLoading />;

  return (
    <WorkspacePage
      title={tMarketplace("title")}
      description={tMarketplace("description")}
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
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
              description={tMarketplace("description")}
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
                  onDelete={handleDelete}
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
              description={tMarketplace("description")}
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
                  onDelete={handleDelete}
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
              description={tMarketplace("description")}
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
                  onDelete={handleDelete}
                  onFeature={handleFeature}
                  onUnfeature={handleUnfeature}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
        onSuccessAction={reload}
      />
    </WorkspacePage>
  );
}
