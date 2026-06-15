"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { ArrowLeft, PackagePlus, Share2, Star, Tag } from "lucide-react";
import { toast } from "sonner";
import {
	MarketplaceItemDetailSections,
	type MarketplaceItemDetailData,
} from "@/components/marketplace/marketplace-item-detail";
import {
	formatMarketplaceDate,
	getVisibilityLabel,
} from "@/components/marketplace/marketplace-i18n-helpers";
import {
	ResourceShareDialog,
	type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
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
import { useWorkspace } from "@/hooks/use-workspace";
import {
	ItemIcon,
	getItemLabel,
} from "@/components/marketplace/marketplace-shared";

export default function MarketplaceItemPage({
	params,
}: {
	params: Promise<{ itemId: string }>;
}) {
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("marketplace");
	const tDetail = useTranslations("marketplace.detail");
	const { workspaceId } = useWorkspace();
	const [loading, setLoading] = useState(true);
	const [item, setItem] = useState<MarketplaceItemDetailData | null>(null);
	const [shareResource, setShareResource] = useState<ShareableResource | null>(
		null,
	);

	const loadItem = useCallback(
		async (itemId: string) => {
			const res = await fetch(`/api/marketplace/items/${itemId}`);
			if (!res.ok) throw new Error(tDetail("toast.loadFailed"));
			return (await res.json()) as MarketplaceItemDetailData;
		},
		[tDetail],
	);

	useEffect(() => {
		let cancelled = false;
		params.then(async ({ itemId }) => {
			try {
				const data = await loadItem(itemId);
				if (!cancelled) setItem(data);
			} catch (error) {
				if (!cancelled) {
					toast.error(
						error instanceof Error
							? error.message
							: tDetail("toast.loadFailed"),
					);
					router.push("/marketplace");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [params, router, loadItem, tDetail]);

	const handleInstall = async () => {
		if (!workspaceId || !item) return;
		const res = await fetch(`/api/marketplace/items/${item.id}/install`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId }),
		});
		if (res.ok) {
			const payload = await res.json();
			toast.success(tDetail("toast.installed"));
			if (payload.requiresCredentials) {
				toast.info(tDetail("toast.credentialsNeeded"), { duration: 8000 });
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
					tDetail("toast.installFailed"),
			);
		}
	};

	const handleUnshare = async (targetUserId: string) => {
		if (!item) return;
		const res = await fetch(
			`/api/marketplace/items/${item.id}/share?targetUserId=${targetUserId}`,
			{ method: "DELETE" },
		);
		if (res.ok) {
			toast.success(tDetail("toast.shareRemoved"));
			setItem(await loadItem(item.id));
		} else {
			toast.error(tDetail("toast.shareRemoveFailed"));
		}
	};

	if (loading) return <PageLoading />;
	if (!item) return null;

	const itemTypeLabel = getItemLabel(item.type, (key) =>
		t(key as "itemTypes.agent"),
	);
	const visibilityLabel = getVisibilityLabel(item.visibility, (key) =>
		t(key as "visibility.public"),
	);

	return (
		<WorkspacePage title={item.name}>
			<div className="mx-auto max-w-4xl space-y-6">
				<Button variant="ghost" size="sm" asChild>
					<Link href="/marketplace">
						<ArrowLeft className="h-4 w-4 mr-1" />
						{tDetail("back")}
					</Link>
				</Button>

				<Card>
					<CardHeader>
						<div className="flex items-start gap-3">
							<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
								<ItemIcon
									type={item.type}
									className="h-7 w-7 text-muted-foreground"
								/>
							</div>
							<div className="flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<CardTitle className="text-2xl">{item.name}</CardTitle>
									{item.isFeatured ? (
										<Badge
											variant="default"
											className="bg-yellow-500 text-black"
										>
											<Star className="h-3 w-3 mr-1 fill-current" />{" "}
											{t("list.featured")}
										</Badge>
									) : null}
								</div>
								<CardDescription className="mt-1 flex flex-wrap items-center gap-2">
									<Badge variant="secondary">{itemTypeLabel}</Badge>
									<Badge variant="outline">
										{item.status === "published"
											? tDetail("status.published")
											: tDetail("status.draft")}
									</Badge>
									<Badge variant="outline">{visibilityLabel}</Badge>
									{item.latestVersion ? (
										<Badge variant="outline">
											v{item.latestVersion.version}
										</Badge>
									) : null}
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						{item.description ? (
							<div>
								<h3 className="mb-2 text-sm font-medium text-muted-foreground">
									{tDetail("description")}
								</h3>
								<p className="text-base leading-relaxed">{item.description}</p>
							</div>
						) : null}

						{item.tagsJson && item.tagsJson.length > 0 ? (
							<div>
								<h3 className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
									<Tag className="h-3 w-3" />
									{tDetail("tags")}
								</h3>
								<div className="flex flex-wrap gap-2">
									{item.tagsJson.map((tag) => (
										<Badge key={tag} variant="outline">
											{tag}
										</Badge>
									))}
								</div>
							</div>
						) : null}

						<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
							<div className="rounded-lg bg-muted p-3 text-center">
								<p className="text-2xl font-bold">{item.totalDownloads}</p>
								<p className="text-xs text-muted-foreground">
									{tDetail("downloads")}
								</p>
							</div>
							<div className="rounded-lg bg-muted p-3 text-center">
								<p className="text-2xl font-bold">{item.shareCount ?? 0}</p>
								<p className="text-xs text-muted-foreground">
									{tDetail("shares")}
								</p>
							</div>
							<div className="rounded-lg bg-muted p-3 text-center">
								<p className="text-sm font-medium">
									{formatMarketplaceDate(item.publishedAt, locale, "long")}
								</p>
								<p className="text-xs text-muted-foreground">
									{tDetail("publishedOn")}
								</p>
							</div>
							<div className="rounded-lg bg-muted p-3 text-center">
								<p className="text-sm font-medium">
									{formatMarketplaceDate(item.createdAt, locale, "long")}
								</p>
								<p className="text-xs text-muted-foreground">
									{tDetail("createdOn")}
								</p>
							</div>
						</div>

						<div className="flex flex-wrap gap-3 border-t pt-4">
							{item.canInstall ? (
								<Button size="lg" onClick={handleInstall}>
									<PackagePlus className="h-4 w-4 mr-2" />
									{tDetail("install")}
								</Button>
							) : null}
							{item.isOwner ? (
								<Button
									size="lg"
									variant="outline"
									onClick={() =>
										setShareResource({
											kind: "marketplace_item",
											id: item.id,
											name: item.name,
											publisherUserId: item.publisherUserId,
										})
									}
								>
									<Share2 className="h-4 w-4 mr-2" />
									{tDetail("share")}
								</Button>
							) : null}
						</div>
					</CardContent>
				</Card>

				<MarketplaceItemDetailSections
					item={item}
					onUnshareAction={item.isOwner ? handleUnshare : undefined}
				/>
			</div>

			<ResourceShareDialog
				resource={shareResource}
				workspaceId={workspaceId}
				open={shareResource !== null}
				onCloseAction={() => setShareResource(null)}
				onSuccessAction={() => void loadItem(item.id).then(setItem)}
			/>
		</WorkspacePage>
	);
}
