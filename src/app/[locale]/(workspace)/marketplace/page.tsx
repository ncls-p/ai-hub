"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BookMarked,
	BookOpen,
	Bot,
	Download,
	ExternalLink,
	Globe,
	Lock,
	Package,
	PackagePlus,
	Plug,
	Puzzle,
	Search,
	Settings,
	Share2,
	Star,
	Store,
	Trash2,
	User,
	Wrench,
	Workflow,
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/use-workspace";

// ─── Types ─────────────────────────────────────────────────────────────

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
	verifiedPublisher: boolean;
	publishedAt: string | null;
	createdAt: string;
	tagsJson: string[] | null;
	publisherUserId: string;
	shareCount?: number;
}

interface User {
	id: string;
	name: string;
	email: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const itemIconMap: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	agent: Bot,
	skill: Package,
	custom_tool: Wrench,
	prompt_template: BookOpen,
	tool_pack: Puzzle,
	mcp_preset: Plug,
	workflow_template: Workflow,
	knowledge_template: BookMarked,
	provider_preset: Settings,
};

function ItemIcon({ type, className }: { type: string; className?: string }) {
	const Icon = itemIconMap[type] ?? Package;
	return <Icon className={className} />;
}

function getItemLabel(type: string) {
	switch (type) {
		case "agent":
			return "Agent";
		case "skill":
			return "Skill";
		case "custom_tool":
			return "Tool";
		case "prompt_template":
			return "Prompt";
		case "tool_pack":
			return "Tool Pack";
		case "mcp_preset":
			return "MCP Preset";
		case "workflow_template":
			return "Workflow";
		case "knowledge_template":
			return "Knowledge";
		case "provider_preset":
			return "Provider";
		default:
			return type;
	}
}

function formatDate(dateStr: string | null) {
	if (!dateStr) return "—";
	return new Date(dateStr).toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

// ─── Components ────────────────────────────────────────────────────────

function MarketplaceItemCard({
	item,
	isOwner,
	onInstall,
	onShare,
	onDelete,
	onFeature,
	onUnfeature,
	isAdmin,
}: {
	item: MarketplaceItem;
	isOwner: boolean;
	isAdmin: boolean;
	onInstall: (id: string) => void;
	onShare: (item: MarketplaceItem) => void;
	onDelete: (id: string) => void;
	onFeature: (id: string) => void;
	onUnfeature: (id: string) => void;
}) {
	return (
		<Card className="relative group">
			{item.isFeatured && (
				<div className="absolute -top-2 -right-2 z-10">
					<Badge variant="default" className="bg-yellow-500 text-black">
						<Star className="h-3 w-3 mr-1 fill-current" /> Featured
					</Badge>
				</div>
			)}
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
							<ItemIcon
								type={item.type}
								className="h-5 w-5 text-muted-foreground"
							/>
						</div>
						<div>
							<CardTitle className="text-base">{item.name}</CardTitle>
							<CardDescription className="flex items-center gap-2">
								<Badge variant="secondary" className="text-xs">
									{getItemLabel(item.type)}
								</Badge>
								{item.isFeatured ? (
									<Badge variant="outline" className="text-xs">
										<Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
									</Badge>
								) : null}
							</CardDescription>
						</div>
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
							<Download className="h-3 w-3" /> {item.totalDownloads}
						</span>
						<span>{formatDate(item.publishedAt)}</span>
					</div>
					<div className="flex items-center gap-1">
						{isOwner && (
							<>
								<Button
									size="icon"
									variant="ghost"
									className="h-6 w-6"
									onClick={() => onShare(item)}
								>
									<Share2 className="h-3 w-3" />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									className="h-6 w-6 text-destructive"
									onClick={() => onDelete(item.id)}
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							</>
						)}
						{isAdmin && (
							<Button
								size="icon"
								variant="ghost"
								className="h-6 w-6"
								onClick={() =>
									item.isFeatured ? onUnfeature(item.id) : onFeature(item.id)
								}
							>
								<Star
									className={`h-3 w-3 ${item.isFeatured ? "fill-yellow-400 text-yellow-400" : ""}`}
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
						<PackagePlus className="h-3 w-3 mr-1" />
						Installer
					</Button>
					<Button size="sm" variant="outline" asChild>
						<a href={`/marketplace/items/${item.id}`}>
							<ExternalLink className="h-3 w-3 mr-1" />
							Détails
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function ShareDialog({
	item,
	users,
	open,
	onClose,
	onShare,
	onPublish,
}: {
	item: MarketplaceItem | null;
	users: User[];
	open: boolean;
	onClose: () => void;
	onShare: (targetUserId: string) => void;
	onPublish: () => void;
}) {
	const [search, setSearch] = useState("");
	const [selectedUserId, setSelectedUserId] = useState("");

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					u.id !== item?.publisherUserId &&
					(u.name.toLowerCase().includes(search.toLowerCase()) ||
						u.email.toLowerCase().includes(search.toLowerCase())),
			),
		[users, search, item],
	);

	if (!item) return null;

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Partager &quot;{item.name}&quot;</DialogTitle>
					<DialogDescription>
						Choisissez comment partager cet item.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					{/* Private */}
					<div className="flex items-center gap-3 p-3 border rounded-lg">
						<Lock className="h-5 w-5 text-muted-foreground" />
						<div>
							<p className="font-medium text-sm">Privé</p>
							<p className="text-xs text-muted-foreground">
								Seulement vous pouvez y accéder
							</p>
						</div>
					</div>

					{/* Share with user */}
					<div className="space-y-2">
						<label className="text-sm font-medium flex items-center gap-2">
							<User className="h-4 w-4" /> Partager avec un utilisateur
						</label>
						<Input
							placeholder="Rechercher un utilisateur..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<div className="max-h-40 overflow-y-auto space-y-1">
							{filteredUsers.map((user) => (
								<button
									key={user.id}
									className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
										selectedUserId === user.id
											? "bg-primary/10 font-medium"
											: "hover:bg-muted"
									}`}
									onClick={() =>
										setSelectedUserId(selectedUserId === user.id ? "" : user.id)
									}
								>
									<span>
										{user.name} ({user.email})
									</span>
									{selectedUserId === user.id && (
										<Star className="h-3 w-3 fill-primary text-primary" />
									)}
								</button>
							))}
							{filteredUsers.length === 0 && (
								<p className="text-sm text-muted-foreground px-3">
									Aucun utilisateur trouvé
								</p>
							)}
						</div>
					</div>

					{/* Publish to marketplace */}
					<button
						className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-muted transition-colors"
						onClick={onPublish}
					>
						<Globe className="h-5 w-5 text-muted-foreground" />
						<div className="text-left">
							<p className="font-medium text-sm">Publier sur la marketplace</p>
							<p className="text-xs text-muted-foreground">
								Visible par tous les utilisateurs
							</p>
						</div>
					</button>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Annuler
					</Button>
					<Button
						disabled={!selectedUserId}
						onClick={() => {
							onShare(selectedUserId);
							setSelectedUserId("");
							setSearch("");
						}}
					>
						Partager avec l&apos;utilisateur
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main Page ─────────────────────────────────────────────────────────

export default function MarketplacePage() {
	const router = useRouter();
	const { workspaceId } = useWorkspace();
	const { currentUserId, isAdmin = false } = useWorkspaceShell();
	const [loading, setLoading] = useState(true);
	const [publishedItems, setPublishedItems] = useState<MarketplaceItem[]>([]);
	const [draftItems, setDraftItems] = useState<MarketplaceItem[]>([]);
	const [sharedItems, setSharedItems] = useState<MarketplaceItem[]>([]);
	const [users, setUsers] = useState<User[]>([]);

	// Filters
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [sortBy, setSortBy] = useState<string>("featured");
	const [featuredOnly, setFeaturedOnly] = useState(false);

	// Share dialog
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const [shareItem, setShareItem] = useState<MarketplaceItem | null>(null);

	const fetchMarketplaceData = useCallback(async (): Promise<{
		published: MarketplaceItem[];
		drafts: MarketplaceItem[];
		shared: MarketplaceItem[];
		users: User[];
	}> => {
		const [publishedRes, draftsRes, sharedRes, usersRes] = await Promise.all([
			fetch(
				`/api/marketplace/items?sortBy=${sortBy}&featuredOnly=${featuredOnly}`,
			),
			fetch("/api/marketplace/items?includeDrafts=true"),
			fetch("/api/marketplace/items?_path=shared-with-me"),
			fetch("/api/admin/users"),
		]);

		if (!publishedRes.ok) throw new Error("Failed to load marketplace");

		const published = (await publishedRes.json()) as MarketplaceItem[];
		const allDrafts = (await draftsRes.json()) as MarketplaceItem[];
		const sharedData = await sharedRes.json();
		const shared = Array.isArray(sharedData)
			? sharedData.map((s: { item: MarketplaceItem }) => s.item)
			: [];
		const usersData = await usersRes.json();
		const allUsers = Array.isArray(usersData)
			? usersData
			: (usersData.users ?? []);

		return {
			published,
			drafts: allDrafts.filter((item) => item.status === "draft"),
			shared,
			users: allUsers || [],
		};
	}, [sortBy, featuredOnly]);

	useEffect(() => {
		let cancelled = false;
		fetchMarketplaceData()
			.then((data) => {
				if (!cancelled) {
					setPublishedItems(data.published);
					setDraftItems(data.drafts);
					setSharedItems(data.shared);
					setUsers(data.users);
				}
			})
			.catch((error) => {
				if (!cancelled)
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to load marketplace",
					);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [fetchMarketplaceData]);

	// Apply client-side filters
	const filteredItems = useMemo(() => {
		let items = publishedItems;

		if (search) {
			const q = search.toLowerCase();
			items = items.filter(
				(item) =>
					item.name.toLowerCase().includes(q) ||
					(item.description && item.description.toLowerCase().includes(q)) ||
					(item.tagsJson &&
						item.tagsJson.some((t) => t.toLowerCase().includes(q))),
			);
		}

		if (typeFilter !== "all") {
			items = items.filter((item) => item.type === typeFilter);
		}

		return items;
	}, [publishedItems, search, typeFilter]);

	const handleInstall = useCallback(
		async (itemId: string) => {
			if (!workspaceId) return;
			const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId }),
			});
			if (res.ok) {
				toast.success("Installé avec succès");
				const payload = await res.json();
				if (payload.agent?.id) {
					router.push(`/agents/${payload.agent.id}`);
				}
			} else {
				toast.error(
					(await res.json().catch(() => ({}))).error || "Installation échouée",
				);
			}
		},
		[workspaceId, router],
	);

	const reload = useCallback(() => {
		fetchMarketplaceData()
			.then((data) => {
				setPublishedItems(data.published);
				setDraftItems(data.drafts);
				setSharedItems(data.shared);
				setUsers(data.users);
			})
			.catch((error) => {
				toast.error(error instanceof Error ? error.message : "Reload failed");
			});
	}, [fetchMarketplaceData]);

	const handleDelete = useCallback(
		async (itemId: string) => {
			if (!confirm("Supprimer cet item ?")) return;
			const res = await fetch(`/api/marketplace/items/${itemId}`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success("Item supprimé");
				reload();
			} else {
				toast.error("Suppression échouée");
			}
		},
		[reload],
	);

	const handleFeature = useCallback(
		async (itemId: string) => {
			const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (res.ok) {
				toast.success("Item mis en avant");
				reload();
			} else {
				toast.error("Échec");
			}
		},
		[reload],
	);

	const handleUnfeature = useCallback(
		async (itemId: string) => {
			const res = await fetch(`/api/marketplace/items/${itemId}/feature`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success("Item retiré des favoris");
				reload();
			} else {
				toast.error("Échec");
			}
		},
		[reload],
	);

	const handleShare = useCallback(
		async (targetUserId: string) => {
			if (!shareItem) return;
			const res = await fetch(`/api/marketplace/items/${shareItem.id}/share`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetUserId }),
			});
			if (res.ok) {
				toast.success("Item partagé");
				setShareDialogOpen(false);
				setShareItem(null);
			} else {
				toast.error("Partage échoué");
			}
		},
		[shareItem],
	);

	const handlePublish = useCallback(() => {
		if (!shareItem) return;
		fetch(`/api/marketplace/items/${shareItem.id}/publish`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visibility: "public" }),
		})
			.then((r) => {
				if (r.ok) {
					toast.success("Item publié sur la marketplace");
					setShareDialogOpen(false);
					setShareItem(null);
					reload();
				} else {
					r.json()
						.catch(() => ({}))
						.then((j) => {
							toast.error(j?.error || "Publication échouée");
						});
				}
			})
			.catch((error) => {
				toast.error(
					error instanceof Error ? error.message : "Publication échouée",
				);
			});
	}, [shareItem, reload]);

	if (loading) return <PageLoading />;

	return (
		<WorkspacePage title="Marketplace">
			{/* Search & Filters */}
			<div className="flex flex-col sm:flex-row gap-3 mb-6">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher dans la marketplace..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={typeFilter} onValueChange={setTypeFilter}>
					<SelectTrigger className="w-full sm:w-40">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Tous les types</SelectItem>
						<SelectItem value="agent">Agents</SelectItem>
						<SelectItem value="skill">Skills</SelectItem>
						<SelectItem value="custom_tool">Tools</SelectItem>
						<SelectItem value="prompt_template">Prompts</SelectItem>
						<SelectItem value="tool_pack">Tool Packs</SelectItem>
						<SelectItem value="mcp_preset">MCP</SelectItem>
						<SelectItem value="workflow_template">Workflows</SelectItem>
						<SelectItem value="knowledge_template">Knowledge</SelectItem>
						<SelectItem value="provider_preset">Providers</SelectItem>
					</SelectContent>
				</Select>
				<Select value={sortBy} onValueChange={setSortBy}>
					<SelectTrigger className="w-full sm:w-40">
						<SelectValue placeholder="Trier par" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="featured">Mis en avant</SelectItem>
						<SelectItem value="newest">Plus récent</SelectItem>
						<SelectItem value="downloads">Téléchargements</SelectItem>
						<SelectItem value="rating">Notes</SelectItem>
					</SelectContent>
				</Select>
				<Button
					variant={featuredOnly ? "default" : "outline"}
					onClick={() => setFeaturedOnly(!featuredOnly)}
				>
					<Star className="h-4 w-4 mr-1" />
					Featured
				</Button>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="all">
				<TabsList>
					<TabsTrigger value="all">Tous ({filteredItems.length})</TabsTrigger>
					<TabsTrigger value="my-items">
						Mes items ({draftItems.length})
					</TabsTrigger>
					<TabsTrigger value="shared">
						Partagés ({sharedItems.length})
					</TabsTrigger>
				</TabsList>

				{/* All Items */}
				<TabsContent value="all" className="mt-4">
					{filteredItems.length === 0 ? (
						<PageEmptyState
							icon={Store}
							title="Aucun item trouvé"
							description="Ajustez vos filtres ou publiez votre premier item"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredItems.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={item.publisherUserId === currentUserId}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={(i) => {
										setShareItem(i);
										setShareDialogOpen(true);
									}}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* My Items */}
				<TabsContent value="my-items" className="mt-4">
					{draftItems.length === 0 ? (
						<PageEmptyState
							icon={PackagePlus}
							title="Aucun brouillon"
							description="Créez un brouillon depuis la page d'un agent"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{draftItems.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={true}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={(i) => {
										setShareItem(i);
										setShareDialogOpen(true);
									}}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>

				{/* Shared with me */}
				<TabsContent value="shared" className="mt-4">
					{sharedItems.length === 0 ? (
						<PageEmptyState
							icon={Share2}
							title="Aucun item partagé"
							description="Quand quelqu&apos;un vous partage un item, il apparaîtra ici"
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{sharedItems.map((item) => (
								<MarketplaceItemCard
									key={item.id}
									item={item}
									isOwner={item.publisherUserId === currentUserId}
									isAdmin={isAdmin}
									onInstall={handleInstall}
									onShare={(i) => {
										setShareItem(i);
										setShareDialogOpen(true);
									}}
									onDelete={handleDelete}
									onFeature={handleFeature}
									onUnfeature={handleUnfeature}
								/>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* Share Dialog */}
			<ShareDialog
				item={shareItem}
				users={users}
				open={shareDialogOpen}
				onClose={() => {
					setShareDialogOpen(false);
					setShareItem(null);
				}}
				onShare={handleShare}
				onPublish={handlePublish}
			/>
		</WorkspacePage>
	);
}
