"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	CheckIcon,
	DownloadIcon,
	Loader2,
	PackagePlusIcon,
	SendIcon,
	StoreIcon,
	XIcon,
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";

interface MarketplaceItem {
	id: string;
	name: string;
	description: string | null;
	status: string;
	pricingModel: string;
	installCount: number;
	verifiedPublisher: boolean;
}
interface Agent {
	id: string;
	name: string;
}

function ItemGrid({
	items,
	emptyLabel,
	action,
}: {
	items: MarketplaceItem[];
	emptyLabel: string;
	action?: (item: MarketplaceItem) => React.ReactNode;
}) {
	if (items.length === 0) {
		return (
			<PageEmptyState icon={StoreIcon} title={emptyLabel} />
		);
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{items.map((item) => (
				<Card key={item.id}>
					<CardHeader>
						<div className="flex items-start justify-between gap-3">
							<div>
								<CardTitle>{item.name}</CardTitle>
								<CardDescription>
									{item.description || "No description"}
								</CardDescription>
							</div>
							{item.verifiedPublisher ? <Badge>Verified</Badge> : null}
						</div>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">{item.status}</Badge>
							<Badge variant="outline">{item.pricingModel}</Badge>
							<Badge variant="secondary">{item.installCount} installs</Badge>
						</div>
						{action ? action(item) : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export default function MarketplacePage() {
	const router = useRouter();
	const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
	const [publishedItems, setPublishedItems] = useState<MarketplaceItem[]>([]);
	const [draftItems, setDraftItems] = useState<MarketplaceItem[]>([]);
	const [reviewItems, setReviewItems] = useState<MarketplaceItem[]>([]);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [draft, setDraft] = useState({
		agentId: "",
		version: "1.0.0",
		name: "",
	});
	const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

	const load = useCallback(async () => {
		const [publishedRes, draftsRes, reviewRes, agentRes] = await Promise.all([
			fetch("/api/marketplace/items"),
			fetch("/api/marketplace/items?includeDrafts=true"),
			fetch("/api/marketplace/items?status=pending_review"),
			workspaceId
				? fetch(`/api/workspace/agents?workspaceId=${workspaceId}`)
				: Promise.resolve(null),
		]);
		if (!publishedRes.ok || !draftsRes.ok || !reviewRes.ok) {
			throw new Error("Failed to load marketplace");
		}
		const published = (await publishedRes.json()) as MarketplaceItem[];
		const allItems = (await draftsRes.json()) as MarketplaceItem[];
		setPublishedItems(published);
		setDraftItems(
			allItems.filter((item) =>
				["draft", "pending_review", "rejected"].includes(item.status),
			),
		);
		setReviewItems(await reviewRes.json());
		if (agentRes && agentRes.ok) {
			const agentData = await agentRes.json();
			setAgents(Array.isArray(agentData) ? agentData : agentData.agents);
		}
	}, [workspaceId]);

	useEffect(() => {
		let cancelled = false;
		async function run() {
			try {
				await load();
			} catch (error) {
				if (!cancelled)
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to load marketplace",
					);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [load]);

	async function install(itemId: string) {
		if (!workspaceId) return;
		const res = await fetch(`/api/marketplace/items/${itemId}/install`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId }),
		});
		if (res.ok) {
			const payload = (await res.json()) as { agent?: { id?: string } };
			toast.success("Installed as a local workspace agent");
			if (payload.agent?.id) {
				router.push(`/agents/${payload.agent.id}`);
			}
		} else {
			toast.error(
				(await res.json().catch(() => null))?.error || "Install failed",
			);
		}
	}

	async function createDraft() {
		if (!workspaceId || !draft.agentId) return;
		const res = await fetch("/api/marketplace/items", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				workspaceId,
				agentId: draft.agentId,
				version: draft.version,
				name: draft.name || undefined,
			}),
		});
		if (!res.ok)
			return toast.error(
				(await res.json().catch(() => null))?.error || "Draft failed",
			);
		setDraft({ agentId: "", version: "1.0.0", name: "" });
		toast.success("Marketplace draft created");
		await load();
	}

	async function submitItem(itemId: string) {
		const res = await fetch(`/api/marketplace/items/${itemId}/submit`, {
			method: "POST",
		});
		if (res.ok) {
			toast.success("Submitted for review");
			await load();
		} else {
			toast.error(
				(await res.json().catch(() => null))?.error || "Submit failed",
			);
		}
	}

	async function reviewItem(
		itemId: string,
		status: "approved" | "rejected" | "changes_requested",
	) {
		const res = await fetch(`/api/marketplace/items/${itemId}/review`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				status,
				notes: reviewNotes[itemId] || undefined,
			}),
		});
		if (res.ok) {
			toast.success(`Review recorded: ${status}`);
			await load();
		} else {
			toast.error(
				(await res.json().catch(() => null))?.error || "Review failed",
			);
		}
	}

	if (workspaceLoading || !workspaceId) {
		return <PageLoading label="Loading workspace" />;
	}

	return (
		<WorkspacePage
			kicker="Discover"
			title="Catalog"
			description="Publish, review, and install agent packages without mutating local copies after install."
			width="wide"
		>
			<Tabs defaultValue="install">
				<TabsList>
					<TabsTrigger value="install">Install</TabsTrigger>
					<TabsTrigger value="submit">Submit</TabsTrigger>
					<TabsTrigger value="review">Review</TabsTrigger>
				</TabsList>

				<TabsContent value="install" className="mt-4">
					{workspaceLoading || loading ? (
						<div className="flex justify-center py-12">
							<Loader2 className="animate-spin" />
						</div>
					) : (
						<ItemGrid
							items={publishedItems}
							emptyLabel="No published marketplace items."
							action={(item) => (
								<Button size="sm" onClick={() => void install(item.id)}>
									<DownloadIcon data-icon="inline-start" />
									Install
								</Button>
							)}
						/>
					)}
				</TabsContent>

				<TabsContent value="submit" className="mt-4 flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<PackagePlusIcon className="size-5" />
								Publish agent draft
							</CardTitle>
							<CardDescription>
								Create a reviewable marketplace manifest from an existing agent
								version.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
							<div className="grid gap-2">
								<Label>Agent</Label>
								<Select
									value={draft.agentId || "__none__"}
									onValueChange={(value) =>
										setDraft({
											...draft,
											agentId: value === "__none__" ? "" : value,
										})
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select agent" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">Select agent</SelectItem>
										{agents.map((agent) => (
											<SelectItem key={agent.id} value={agent.id}>
												{agent.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>Version</Label>
								<Input
									value={draft.version}
									onChange={(e) =>
										setDraft({ ...draft, version: e.target.value })
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Name override</Label>
								<Input
									value={draft.name}
									onChange={(e) =>
										setDraft({ ...draft, name: e.target.value })
									}
								/>
							</div>
							<Button onClick={() => void createDraft()} disabled={!draft.agentId}>
								<StoreIcon data-icon="inline-start" />
								Draft
							</Button>
						</CardContent>
					</Card>
					{loading ? (
						<Loader2 className="animate-spin" />
					) : (
						<ItemGrid
							items={draftItems}
							emptyLabel="No drafts yet."
							action={(item) => (
								<div className="flex gap-2">
									{item.status === "draft" ? (
										<Button
											size="sm"
											variant="outline"
											onClick={() => void submitItem(item.id)}
										>
											<SendIcon data-icon="inline-start" />
											Submit
										</Button>
									) : null}
								</div>
							)}
						/>
					)}
				</TabsContent>

				<TabsContent value="review" className="mt-4">
					{loading ? (
						<Loader2 className="animate-spin" />
					) : reviewItems.length === 0 ? (
						<PageEmptyState
							icon={StoreIcon}
							title="No items pending review"
						/>
					) : (
						<div className="grid gap-4">
							{reviewItems.map((item) => (
								<Card key={item.id}>
									<CardHeader>
										<CardTitle>{item.name}</CardTitle>
										<CardDescription>
											{item.description || "No description"}
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-col gap-3">
										<Textarea
											placeholder="Review notes (optional)"
											value={reviewNotes[item.id] ?? ""}
											onChange={(e) =>
												setReviewNotes((current) => ({
													...current,
													[item.id]: e.target.value,
												}))
											}
										/>
										<div className="flex flex-wrap gap-2">
											<Button
												size="sm"
												onClick={() => void reviewItem(item.id, "approved")}
											>
												<CheckIcon data-icon="inline-start" />
												Approve
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													void reviewItem(item.id, "changes_requested")
												}
											>
												Request changes
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => void reviewItem(item.id, "rejected")}
											>
												<XIcon data-icon="inline-start" />
												Reject
											</Button>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</WorkspacePage>
	);
}
