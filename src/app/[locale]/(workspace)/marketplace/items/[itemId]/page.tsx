"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	BookMarked,
	BookOpen,
	Bot,
	Package,
	PackagePlus,
	Plug,
	Puzzle,
	Settings,
	Share2,
	Star,
	Tag,
	Wrench,
	Workflow,
} from "lucide-react";
import { toast } from "sonner";
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
		month: "long",
		year: "numeric",
	});
}

export default function MarketplaceItemPage({
	params,
}: {
	params: Promise<{ itemId: string }>;
}) {
	const router = useRouter();
	const { workspaceId } = useWorkspace();
	const [loading, setLoading] = useState(true);
	const [item, setItem] = useState<MarketplaceItem | null>(null);

	useEffect(() => {
		let cancelled = false;
		params.then(async ({ itemId }) => {
			try {
				const res = await fetch(`/api/marketplace/items/${itemId}`);
				if (!res.ok) throw new Error("Item not found");
				const data = (await res.json()) as MarketplaceItem;
				if (!cancelled) {
					setItem(data);
				}
			} catch (error) {
				if (!cancelled) {
					toast.error(
						error instanceof Error ? error.message : "Failed to load item",
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
	}, [params, router]);

	const handleInstall = async () => {
		if (!workspaceId || !item) return;
		const res = await fetch(`/api/marketplace/items/${item.id}/install`, {
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
	};

	if (loading) return <PageLoading />;
	if (!item) return null;

	return (
		<WorkspacePage title={item.name}>
			<div className="max-w-3xl mx-auto space-y-6">
				{/* Back button */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.push("/marketplace")}
				>
					<ArrowLeft className="h-4 w-4 mr-1" />
					Retour à la marketplace
				</Button>

				{/* Main card */}
				<Card>
					<CardHeader>
						<div className="flex items-start gap-3">
							<div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted">
								<ItemIcon
									type={item.type}
									className="h-7 w-7 text-muted-foreground"
								/>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 flex-wrap">
									<CardTitle className="text-2xl">{item.name}</CardTitle>
									{item.isFeatured && (
										<Badge
											variant="default"
											className="bg-yellow-500 text-black"
										>
											<Star className="h-3 w-3 mr-1 fill-current" /> Featured
										</Badge>
									)}
								</div>
								<CardDescription className="flex items-center gap-2 mt-1">
									<Badge variant="secondary">{getItemLabel(item.type)}</Badge>
									{item.status === "published" && (
										<Badge variant="outline">Publié</Badge>
									)}
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Description */}
						{item.description && (
							<div>
								<h3 className="text-sm font-medium text-muted-foreground mb-2">
									Description
								</h3>
								<p className="text-base leading-relaxed">{item.description}</p>
							</div>
						)}

						{/* Tags */}
						{item.tagsJson && item.tagsJson.length > 0 && (
							<div>
								<h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
									<Tag className="h-3 w-3" />
									Tags
								</h3>
								<div className="flex flex-wrap gap-2">
									{item.tagsJson.map((tag) => (
										<Badge key={tag} variant="outline">
											{tag}
										</Badge>
									))}
								</div>
							</div>
						)}

						{/* Stats */}
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
							<div className="text-center p-3 bg-muted rounded-lg">
								<p className="text-2xl font-bold">{item.totalDownloads}</p>
								<p className="text-xs text-muted-foreground">Téléchargements</p>
							</div>
							<div className="text-center p-3 bg-muted rounded-lg">
								<p className="text-2xl font-bold">{item.shareCount ?? 0}</p>
								<p className="text-xs text-muted-foreground">Partages</p>
							</div>
							<div className="text-center p-3 bg-muted rounded-lg">
								<p className="text-sm font-medium">
									{formatDate(item.publishedAt)}
								</p>
								<p className="text-xs text-muted-foreground">Publié le</p>
							</div>
							<div className="text-center p-3 bg-muted rounded-lg">
								<p className="text-sm font-medium">
									{formatDate(item.createdAt)}
								</p>
								<p className="text-xs text-muted-foreground">Créé le</p>
							</div>
						</div>

						{/* Actions */}
						<div className="flex flex-wrap gap-3 pt-4 border-t">
							<Button size="lg" onClick={handleInstall}>
								<PackagePlus className="h-4 w-4 mr-2" />
								Installer
							</Button>
							<Button
								size="lg"
								variant="outline"
								onClick={() => {
									// Share dialog would go here
									toast.info("Partage en cours de développement");
								}}
							>
								<Share2 className="h-4 w-4 mr-2" />
								Partager
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</WorkspacePage>
	);
}
