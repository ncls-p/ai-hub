"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Share2, Star, User, Users } from "lucide-react";
import { toast } from "sonner";
import type { PublishPreviewResult } from "@/modules/marketplace/use-cases";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
	getVisibilityHint,
	getVisibilityLabel,
} from "./marketplace-i18n-helpers";
import { PublishPreviewSummary } from "./publish-preview-summary";

type ShareStep = "choose" | "meta" | "user";

const STEP_INDEX: Record<ShareStep, number> = {
	choose: 1,
	meta: 2,
	user: 2,
};

export type ShareableResource =
	| {
			kind: "agent";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "skill";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "custom_tool";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "mcp_server";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "mcp_tool";
			id: string;
			name: string;
			description: string | null;
	  }
	| {
			kind: "marketplace_item";
			id: string;
			name: string;
			publisherUserId: string;
	  };

interface PlatformUser {
	id: string;
	name: string;
	email: string;
}

function previewQueryParams(
	resource: ShareableResource,
	workspaceId: string,
	includeSecrets: boolean,
) {
	const params = new URLSearchParams({ workspaceId });
	if (resource.kind === "marketplace_item") {
		params.set("itemId", resource.id);
	} else if (resource.kind === "agent") {
		params.set("agentId", resource.id);
	} else if (resource.kind === "skill") {
		params.set("skillId", resource.id);
	} else if (resource.kind === "custom_tool") {
		params.set("customToolId", resource.id);
	} else if (resource.kind === "mcp_server") {
		params.set("mcpServerId", resource.id);
	} else {
		params.set("mcpToolId", resource.id);
	}
	if (includeSecrets) params.set("includeSecrets", "true");
	return params;
}

function ShareOptionCard({
	icon: Icon,
	title,
	description,
	onClick,
	disabled,
	loading,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			onClick={onClick}
			className={cn(
				"flex w-full items-start gap-3 rounded-xl border border-border/80 p-4 text-left transition-colors",
				"hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				(disabled || loading) && "opacity-60 cursor-not-allowed",
			)}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
				{loading ? (
					<Spinner className="size-4" />
				) : (
					<Icon className="size-5 text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0">
				<p className="font-medium text-sm">{title}</p>
				<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
			</div>
		</button>
	);
}

export function ResourceShareDialog({
	resource,
	workspaceId,
	open,
	onClose,
	onSuccess,
}: {
	resource: ShareableResource | null;
	workspaceId: string | null;
	open: boolean;
	onClose: () => void;
	onSuccess?: () => void;
}) {
	const t = useTranslations("marketplace.share");
	const tVisibility = useTranslations("marketplace");
	const tCommon = useTranslations("common");
	const [step, setStep] = useState<ShareStep>("meta");
	const [preview, setPreview] = useState<PublishPreviewResult | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [version, setVersion] = useState("1.0.0");
	const [changelog, setChangelog] = useState("");
	const [tagsInput, setTagsInput] = useState("");
	const [visibility, setVisibility] = useState<
		"public" | "private" | "unlisted" | "organization"
	>("public");
	const [includeSecrets, setIncludeSecrets] = useState(false);
	const [users, setUsers] = useState<PlatformUser[]>([]);
	const [search, setSearch] = useState("");
	const [selectedUserId, setSelectedUserId] = useState("");
	const [busy, setBusy] = useState(false);

	const loadPreview = useCallback(
		async (withSecrets: boolean) => {
			if (!resource || !workspaceId) return;
			setPreviewLoading(true);
			try {
				const params = previewQueryParams(resource, workspaceId, withSecrets);
				const res = await fetch(`/api/marketplace/publish-preview?${params}`);
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					throw new Error(err.error || t("toast.loadFailed"));
				}
				const data = (await res.json()) as PublishPreviewResult;
				setPreview(data);
				setName(data.name);
				setDescription(data.description ?? "");
				setVersion(data.suggestedVersion);
				setTagsInput(data.tags.join(", "));
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("toast.loadFailed"),
				);
			} finally {
				setPreviewLoading(false);
			}
		},
		[resource, workspaceId, t],
	);

	useEffect(() => {
		if (open && resource && workspaceId) {
			queueMicrotask(() => {
				setStep("choose");
				setSearch("");
				setSelectedUserId("");
				setBusy(false);
				setIncludeSecrets(false);
				setVisibility("public");
				setChangelog("");
				void loadPreview(false);
			});
		}
	}, [open, resource, workspaceId, loadPreview]);

	const publisherUserId =
		resource?.kind === "marketplace_item" ? resource.publisherUserId : null;

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					u.id !== publisherUserId &&
					(u.name.toLowerCase().includes(search.toLowerCase()) ||
						u.email.toLowerCase().includes(search.toLowerCase())),
			),
		[users, search, publisherUserId],
	);

	const tags = useMemo(
		() =>
			tagsInput
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean),
		[tagsInput],
	);

	const createOrUpdateDraft = useCallback(async () => {
		if (!resource) throw new Error("missing resource");
		if (!workspaceId) throw new Error("missing workspace");

		if (resource.kind === "marketplace_item") {
			const updateRes = await fetch(`/api/marketplace/items/${resource.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, description, tags }),
			});
			if (!updateRes.ok) {
				const err = await updateRes.json().catch(() => ({}));
				throw new Error(err.error || t("toast.publishFailed"));
			}
			return resource.id;
		}

		const body: Record<string, unknown> = {
			workspaceId,
			version,
			name,
			description: description || undefined,
			changelog: changelog || undefined,
			visibility,
			tags,
			includeSecrets,
			draftOnly: true,
		};

		if (resource.kind === "agent") body.agentId = resource.id;
		if (resource.kind === "skill") body.skillId = resource.id;
		if (resource.kind === "custom_tool") body.customToolId = resource.id;
		if (resource.kind === "mcp_server") body.mcpServerId = resource.id;
		if (resource.kind === "mcp_tool") body.mcpToolId = resource.id;

		const res = await fetch("/api/marketplace/items", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || t("toast.publishFailed"));
		}

		const data = await res.json();
		if (!data.item?.id) throw new Error(t("toast.publishFailed"));
		return data.item.id as string;
	}, [
		resource,
		workspaceId,
		version,
		name,
		description,
		changelog,
		visibility,
		tags,
		includeSecrets,
		t,
	]);

	const publishToMarketplace = useCallback(async () => {
		if (!resource) throw new Error("missing resource");
		if (!workspaceId) throw new Error("missing workspace");

		if (resource.kind === "marketplace_item") {
			const updateRes = await fetch(`/api/marketplace/items/${resource.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, description, tags, visibility }),
			});
			if (!updateRes.ok) {
				const err = await updateRes.json().catch(() => ({}));
				throw new Error(err.error || t("toast.publishFailed"));
			}
			return resource.id;
		}

		const body: Record<string, unknown> = {
			workspaceId,
			version,
			name,
			description: description || undefined,
			changelog: changelog || undefined,
			visibility,
			tags,
			includeSecrets,
		};

		if (resource.kind === "agent") body.agentId = resource.id;
		if (resource.kind === "skill") body.skillId = resource.id;
		if (resource.kind === "custom_tool") body.customToolId = resource.id;
		if (resource.kind === "mcp_server") body.mcpServerId = resource.id;
		if (resource.kind === "mcp_tool") body.mcpToolId = resource.id;

		if (resource.kind !== "agent") body.draftOnly = true;

		const res = await fetch("/api/marketplace/items", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || t("toast.publishFailed"));
		}

		const data = await res.json();
		const itemId = data.item?.id as string | undefined;
		if (!itemId) throw new Error(t("toast.publishFailed"));

		if (resource.kind === "agent") return itemId;

		const publishRes = await fetch(`/api/marketplace/items/${itemId}/publish`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visibility, tags }),
		});
		if (!publishRes.ok) {
			const err = await publishRes.json().catch(() => ({}));
			throw new Error(err.error || t("toast.publishFailed"));
		}
		return itemId;
	}, [
		resource,
		workspaceId,
		version,
		name,
		description,
		changelog,
		visibility,
		tags,
		includeSecrets,
		t,
	]);

	const loadUsers = useCallback(async () => {
		if (users.length > 0) return;
		const res = await fetch("/api/admin/users");
		if (!res.ok) throw new Error(t("toast.usersFailed"));
		const data = await res.json();
		setUsers(Array.isArray(data) ? data : (data.users ?? []));
	}, [users.length, t]);

	const finish = useCallback(() => {
		onSuccess?.();
		onClose();
	}, [onClose, onSuccess]);

	const handlePublishToMarketplace = useCallback(async () => {
		if (!resource) return;
		setBusy(true);
		try {
			await publishToMarketplace();
			toast.success(t("toast.published", { name }));
			finish();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toast.publishFailed"),
			);
		} finally {
			setBusy(false);
		}
	}, [resource, publishToMarketplace, name, finish, t]);

	const handleShareWithUser = useCallback(async () => {
		if (!resource || !selectedUserId) return;
		setBusy(true);
		try {
			const itemId = await createOrUpdateDraft();
			const shareRes = await fetch(`/api/marketplace/items/${itemId}/share`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targetUserId: selectedUserId }),
			});
			if (!shareRes.ok) {
				const err = await shareRes.json().catch(() => ({}));
				throw new Error(err.error || t("toast.shareFailed"));
			}
			toast.success(t("toast.shared", { name }));
			finish();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("toast.shareFailed"),
			);
		} finally {
			setBusy(false);
		}
	}, [resource, selectedUserId, createOrUpdateDraft, name, finish, t]);

	if (!resource) return null;

	const resourceSubjectKey =
		resource.kind === "marketplace_item" ? "marketplace_item" : resource.kind;

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Share2 className="size-4" />
						{t("title", { name: resource.name })}
					</DialogTitle>
					<DialogDescription>
						{t(`steps.${step}`)}
						{resource.kind !== "marketplace_item" && step === "choose"
							? ` ${t(`resourceSubject.${resourceSubjectKey}`)}`
							: ""}
					</DialogDescription>
					<p className="text-xs text-muted-foreground">
						{t("stepIndicator", {
							current: STEP_INDEX[step],
							total: 2,
						})}
					</p>
				</DialogHeader>

				{previewLoading && step === "meta" ? (
					<div className="flex justify-center py-8">
						<Spinner className="size-6" />
					</div>
				) : null}

				{step === "meta" && !previewLoading ? (
					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="share-name">{t("fields.name")}</Label>
							<Input
								id="share-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="share-desc">{t("fields.description")}</Label>
							<Textarea
								id="share-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={3}
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="share-version">{t("fields.version")}</Label>
								<Input
									id="share-version"
									value={version}
									onChange={(e) => setVersion(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									{t("fields.versionHint")}
								</p>
							</div>
							<div className="space-y-1.5">
								<Label>{t("fields.visibility")}</Label>
								<Select
									value={visibility}
									onValueChange={(v) =>
										setVisibility(
											v as "public" | "private" | "unlisted" | "organization",
										)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(
											["public", "unlisted", "private", "organization"] as const
										).map((v) => (
											<SelectItem key={v} value={v}>
												{getVisibilityLabel(v, (key) =>
													tVisibility(key as "visibility.public"),
												)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{getVisibilityHint(visibility, (key) =>
									tVisibility(key as "visibility.publicHint"),
								) ? (
									<p className="text-xs text-muted-foreground">
										{getVisibilityHint(visibility, (key) =>
											tVisibility(key as "visibility.publicHint"),
										)}
									</p>
								) : null}
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="share-tags">{t("fields.tags")}</Label>
							<Input
								id="share-tags"
								value={tagsInput}
								onChange={(e) => setTagsInput(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="share-changelog">
								{t("fields.releaseNotes")}
							</Label>
							<Textarea
								id="share-changelog"
								value={changelog}
								onChange={(e) => setChangelog(e.target.value)}
								rows={2}
								placeholder={t("fields.releaseNotesPlaceholder")}
							/>
						</div>
						{preview?.canIncludeSecrets ? (
							<label className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
								<Checkbox
									checked={includeSecrets}
									onCheckedChange={(v) => setIncludeSecrets(v === true)}
								/>
								<span className="space-y-1">
									<span className="block font-medium">
										{t("secrets.include")}
									</span>
									<span className="block text-xs leading-relaxed text-muted-foreground">
										{t("secrets.warning")}
									</span>
								</span>
							</label>
						) : null}
						{preview?.manifestPreview ? (
							<div className="rounded-lg border border-border/60 bg-muted/30 p-3">
								<p className="mb-2 text-xs font-medium">
									{t("contentPreview")}
								</p>
								<PublishPreviewSummary preview={preview.manifestPreview} />
							</div>
						) : null}
					</div>
				) : null}

				{step === "choose" ? (
					<div className="grid gap-3">
						<ShareOptionCard
							icon={Globe}
							title={t("options.publish.title")}
							description={t("options.publish.description")}
							onClick={() => setStep("meta")}
							disabled={busy}
						/>
						<ShareOptionCard
							icon={Users}
							title={t("options.user.title")}
							description={t("options.user.description")}
							onClick={() => {
								void loadUsers().then(() => setStep("user"));
							}}
							disabled={busy}
						/>
					</div>
				) : null}

				{step === "user" ? (
					<div className="space-y-3">
						<Input
							placeholder={t("searchUser")}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1">
							{filteredUsers.length === 0 ? (
								<p className="px-3 py-4 text-center text-sm text-muted-foreground">
									{t("noUsers")}
								</p>
							) : (
								filteredUsers.map((user) => (
									<button
										key={user.id}
										type="button"
										className={cn(
											"flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
											selectedUserId === user.id
												? "bg-primary/10 font-medium"
												: "hover:bg-muted",
										)}
										onClick={() =>
											setSelectedUserId(
												selectedUserId === user.id ? "" : user.id,
											)
										}
									>
										<span className="truncate">
											{user.name}{" "}
											<span className="text-muted-foreground">
												({user.email})
											</span>
										</span>
										{selectedUserId === user.id ? (
											<Star className="h-3 w-3 shrink-0 fill-primary text-primary" />
										) : null}
									</button>
								))
							)}
						</div>
					</div>
				) : null}

				<DialogFooter className="gap-2 sm:gap-0">
					{step === "meta" ? (
						<>
							<Button
								variant="outline"
								onClick={() => setStep("choose")}
								disabled={busy}
							>
								{tCommon("back")}
							</Button>
							<Button
								disabled={!name.trim() || busy}
								onClick={() => void handlePublishToMarketplace()}
							>
								{busy ? <Spinner className="size-4 mr-1" /> : null}
								<Globe className="size-4 mr-1" />
								{t("publish")}
							</Button>
						</>
					) : null}
					{step === "choose" ? (
						<Button variant="outline" onClick={onClose} disabled={busy}>
							{tCommon("cancel")}
						</Button>
					) : null}
					{step === "user" ? (
						<>
							<Button
								variant="outline"
								onClick={() => setStep("choose")}
								disabled={busy}
							>
								{tCommon("back")}
							</Button>
							<Button
								disabled={!selectedUserId || busy}
								onClick={() => void handleShareWithUser()}
							>
								{busy ? <Spinner className="size-4 mr-1" /> : null}
								<User className="size-4 mr-1" />
								{t("action")}
							</Button>
						</>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
