"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	Bot,
	ChevronDown,
	FileText,
	KeyRound,
	Plug,
	Shield,
	Wrench,
} from "lucide-react";
import type {
	MarketplaceManifest,
	PortableToolBinding,
} from "@/modules/marketplace/manifest-types";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getToolSourceLabel } from "./marketplace-i18n-helpers";

export interface MarketplaceItemDetailData {
	id: string;
	name: string;
	description: string | null;
	type: string;
	status: string;
	visibility: string;
	tagsJson: string[] | null;
	publisherUserId: string;
	shareCount?: number;
	publishedAt: string | null;
	createdAt: string;
	totalDownloads: number;
	isFeatured: boolean;
	latestVersion: {
		version: string;
		changelog: string | null;
		manifestJson: MarketplaceManifest;
		createdAt: string;
	} | null;
	publisher: { id: string; name: string; email: string } | null;
	shares: Array<{
		userId: string;
		name: string;
		email: string;
		sharedAt: string;
	}>;
	isOwner: boolean;
	canInstall?: boolean;
}

const BUILTIN_BY_ID = new Map(
	BUILTIN_TOOL_SUMMARIES.map((tool) => [tool.id, tool]),
);

function formatToolBindingLabel(binding: PortableToolBinding) {
	if (binding.label) return binding.label;
	if (binding.source === "builtin") {
		const tool = BUILTIN_BY_ID.get(binding.ref);
		return tool?.displayName ?? tool?.name ?? binding.ref;
	}
	return binding.ref;
}

function JsonBlock({ value }: { value: unknown }) {
	return (
		<pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs">
			{JSON.stringify(value, null, 2)}
		</pre>
	);
}

function AgentManifestSection({ manifest }: { manifest: MarketplaceManifest }) {
	const t = useTranslations("marketplace.manifest");
	const tCommon = useTranslations("common");
	const tToolSources = useTranslations("marketplace");

	if (manifest.type !== "agent") return null;

	const hasTechnicalDetails = Boolean(manifest.agent.guardrails);

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2">
				<InfoRow
					label={t("provider")}
					value={manifest.agent.providerName ?? manifest.agent.providerId ?? "—"}
				/>
				<InfoRow
					label={t("model")}
					value={manifest.agent.modelName ?? manifest.agent.modelId ?? "—"}
				/>
				<InfoRow
					label={t("maxTokens")}
					value={manifest.agent.maxOutputTokens ?? "—"}
				/>
				<InfoRow
					label={t("maxToolCalls")}
					value={manifest.agent.maxToolCalls ?? "—"}
				/>
				<InfoRow
					label={t("temperature")}
					value={manifest.agent.temperature ?? "—"}
				/>
				<InfoRow
					label={t("toolChoice")}
					value={manifest.agent.toolChoice ?? "—"}
				/>
			</div>
			{manifest.agent.systemPrompt ? (
				<CollapsibleSection title={t("instructions")} icon={Bot}>
					<p className="whitespace-pre-wrap text-sm leading-relaxed">
						{manifest.agent.systemPrompt}
					</p>
				</CollapsibleSection>
			) : null}
			{(manifest.toolBindings?.length ?? 0) > 0 ? (
				<CollapsibleSection title={t("linkedTools")} icon={Wrench} defaultOpen>
					<ul className="space-y-2 text-sm">
						{manifest.toolBindings!.map((b) => (
							<li
								key={`${b.source}:${b.ref}`}
								className="flex flex-wrap items-center gap-2"
							>
								<Badge variant="outline" className="text-[10px]">
									{getToolSourceLabel(b.source, (key) =>
										tToolSources(key as "toolSources.builtin"),
									)}
								</Badge>
								<span className="font-medium">{formatToolBindingLabel(b)}</span>
								{b.requireApproval ? (
									<Badge variant="secondary" className="text-[10px]">
										{t("approval")}
									</Badge>
								) : null}
							</li>
						))}
					</ul>
				</CollapsibleSection>
			) : null}
			{(manifest.skillBindings?.length ?? 0) > 0 ? (
				<CollapsibleSection title={t("skills")} icon={FileText} defaultOpen>
					<ul className="space-y-1 text-sm">
						{manifest.skillBindings!.map((s) => (
							<li key={s.ref}>
								{s.ref}
								{s.bundled ? (
									<span className="text-muted-foreground">
										{" "}
										(
										{t("fileCount", {
											count:
												s.bundled.fileCount ?? s.bundled.markdownFiles.length,
										})}
										)
									</span>
								) : null}
							</li>
						))}
					</ul>
				</CollapsibleSection>
			) : null}
			{(manifest.knowledgeBindings?.length ?? 0) > 0 ? (
				<CollapsibleSection title={t("knowledgeRefs")} icon={FileText}>
					<ul className="space-y-1 text-sm">
						{manifest.knowledgeBindings!.map((kb) => (
							<li key={kb.name}>
								<span className="font-medium">{kb.name}</span>
								{kb.description ? (
									<p className="text-xs text-muted-foreground">{kb.description}</p>
								) : null}
							</li>
						))}
					</ul>
				</CollapsibleSection>
			) : null}
			{hasTechnicalDetails ? (
				<CollapsibleSection title={tCommon("showAdvanced")} icon={Shield}>
					<div className="space-y-2">
						<p className="text-xs font-medium text-muted-foreground">
							{t("guardrails")}
						</p>
						<JsonBlock value={manifest.agent.guardrails} />
					</div>
				</CollapsibleSection>
			) : null}
		</div>
	);
}

function SkillManifestSection({ manifest }: { manifest: MarketplaceManifest }) {
	const t = useTranslations("marketplace.manifest");

	if (manifest.type !== "skill") return null;
	const [selectedFile, setSelectedFile] = useState(
		manifest.skill.markdownFiles[0]?.path ?? "",
	);
	const file = manifest.skill.markdownFiles.find((f) => f.path === selectedFile);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
				<span>
					{t("fileCount", {
						count:
							manifest.skill.fileCount ?? manifest.skill.markdownFiles.length,
					})}
				</span>
				{manifest.skill.totalBytes ? (
					<span>
						·{" "}
						{t("totalSize", {
							size: Math.round(manifest.skill.totalBytes / 1024),
						})}
					</span>
				) : null}
				{manifest.skill.sourcePackage ? (
					<span>· {manifest.skill.sourcePackage}</span>
				) : null}
			</div>
			{manifest.skill.installCommand ? (
				<InfoRow
					label={t("installCommand")}
					value={manifest.skill.installCommand}
				/>
			) : null}
			<div className="flex flex-wrap gap-2">
				{manifest.skill.markdownFiles.map((f) => (
					<Button
						key={f.path}
						size="sm"
						variant={selectedFile === f.path ? "default" : "outline"}
						onClick={() => setSelectedFile(f.path)}
					>
						{f.path}
					</Button>
				))}
			</div>
			{file ? (
				<pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
					{file.content}
				</pre>
			) : null}
		</div>
	);
}

function CustomToolManifestSection({
	manifest,
}: {
	manifest: MarketplaceManifest;
}) {
	const t = useTranslations("marketplace.manifest");
	const tCommon = useTranslations("common");

	if (manifest.type !== "custom_tool") return null;

	const hasTechnicalDetails = Boolean(
		manifest.tool.inputSchema || manifest.tool.outputSchema,
	);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				{manifest.tool.status ? (
					<Badge variant="secondary">
						{t("status")}: {manifest.tool.status}
					</Badge>
				) : null}
				{manifest.tool.requiresCredentials ? (
					<Badge variant="outline" className="gap-1">
						<KeyRound className="size-3" />
						{t("credentialsRequired")}
					</Badge>
				) : null}
				{manifest.tool.secretsIncluded ? (
					<Badge variant="default">{t("credentialsIncluded")}</Badge>
				) : null}
			</div>
			{manifest.tool.n8nWorkflowUrl ? (
				<InfoRow label={t("workflow")} value={manifest.tool.n8nWorkflowUrl} />
			) : null}
			{manifest.tool.credentialSchema?.length ? (
				<ul className="space-y-1 text-sm">
					{manifest.tool.credentialSchema.map((f) => (
						<li key={f.key}>
							{f.label}
							{f.required ? " *" : ""}
						</li>
					))}
				</ul>
			) : null}
			{hasTechnicalDetails ? (
				<CollapsibleSection title={tCommon("showAdvanced")}>
					<div className="space-y-4">
						{manifest.tool.inputSchema ? (
							<div>
								<p className="mb-2 text-xs font-medium text-muted-foreground">
									{t("inputSchema")}
								</p>
								<JsonBlock value={manifest.tool.inputSchema} />
							</div>
						) : null}
						{manifest.tool.outputSchema ? (
							<div>
								<p className="mb-2 text-xs font-medium text-muted-foreground">
									{t("outputSchema")}
								</p>
								<JsonBlock value={manifest.tool.outputSchema} />
							</div>
						) : null}
					</div>
				</CollapsibleSection>
			) : null}
		</div>
	);
}

function McpManifestSection({ manifest }: { manifest: MarketplaceManifest }) {
	const t = useTranslations("marketplace.manifest");

	if (manifest.type !== "mcp_preset") return null;
	const { preset } = manifest;
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				<Badge variant="secondary">{preset.transport}</Badge>
				<Badge variant="outline">
					{t("scope")}:{" "}
					{preset.scope === "server" ? t("scopeServer") : t("scopeTool")}
				</Badge>
				{preset.enabled ? (
					<Badge variant="outline" className="text-success">
						{t("enabled")}
					</Badge>
				) : (
					<Badge variant="outline">{t("disabled")}</Badge>
				)}
				{preset.requiresCredentials ? (
					<Badge variant="outline" className="gap-1">
						<KeyRound className="size-3" />
						{t("credentialsRequired")}
					</Badge>
				) : null}
			</div>
			<InfoRow label={t("endpoint")} value={preset.url ?? preset.command ?? "—"} />
			{preset.args?.length ? (
				<InfoRow label={t("args")} value={preset.args.join(" ")} />
			) : null}
			<CollapsibleSection
				title={t("toolsCount", { count: preset.tools.length })}
				icon={Plug}
				defaultOpen
			>
				<ul className="space-y-2">
					{preset.tools.map((tool) => (
						<li
							key={tool.name}
							className="rounded-lg border border-border/60 p-3 text-sm"
						>
							<div className="flex items-center gap-2">
								<span className="font-medium">{tool.name}</span>
								{tool.enabled ? null : (
									<Badge variant="outline" className="text-[10px]">
										{t("disabled")}
									</Badge>
								)}
							</div>
							{tool.description ? (
								<p className="mt-1 text-xs text-muted-foreground">
									{tool.description}
								</p>
							) : null}
						</li>
					))}
				</ul>
			</CollapsibleSection>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			<p className="text-sm break-all">{value}</p>
		</div>
	);
}

function CollapsibleSection({
	title,
	icon: Icon,
	children,
	defaultOpen = false,
}: {
	title: string;
	icon?: React.ComponentType<{ className?: string }>;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
				>
					<span className="flex items-center gap-2">
						{Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
						{title}
					</span>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
					/>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-3">{children}</CollapsibleContent>
		</Collapsible>
	);
}

export function MarketplaceItemDetailSections({
	item,
	onUnshare,
}: {
	item: MarketplaceItemDetailData;
	onUnshare?: (userId: string) => void;
}) {
	const t = useTranslations("marketplace.detail");
	const manifest = item.latestVersion?.manifestJson;

	return (
		<div className="space-y-6">
			{item.latestVersion ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{t("version", { version: item.latestVersion.version })}
						</CardTitle>
						{item.latestVersion.changelog ? (
							<CardDescription>{item.latestVersion.changelog}</CardDescription>
						) : null}
					</CardHeader>
					<CardContent>
						{manifest ? (
							<>
								<AgentManifestSection manifest={manifest} />
								<SkillManifestSection manifest={manifest} />
								<CustomToolManifestSection manifest={manifest} />
								<McpManifestSection manifest={manifest} />
							</>
						) : (
							<p className="text-sm text-muted-foreground">{t("noManifest")}</p>
						)}
					</CardContent>
				</Card>
			) : null}

			{item.publisher ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("publisher")}</CardTitle>
					</CardHeader>
					<CardContent className="text-sm">
						<p className="font-medium">{item.publisher.name}</p>
						<p className="text-muted-foreground">{item.publisher.email}</p>
					</CardContent>
				</Card>
			) : null}

			{item.isOwner && item.shares.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("sharedWith")}</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="space-y-2">
							{item.shares.map((share) => (
								<li
									key={share.userId}
									className="flex items-center justify-between gap-2 text-sm"
								>
									<div>
										<p className="font-medium">{share.name}</p>
										<p className="text-xs text-muted-foreground">{share.email}</p>
									</div>
									{onUnshare ? (
										<Button
											size="sm"
											variant="ghost"
											onClick={() => onUnshare(share.userId)}
										>
											{t("removeShare")}
										</Button>
									) : null}
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
