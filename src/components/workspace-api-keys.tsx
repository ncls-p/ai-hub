"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
	CopyIcon,
	KeyRoundIcon,
	Loader2,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

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
import { useWorkspace } from "@/hooks/use-workspace";

type ApiKeyRow = {
	id: string;
	name: string;
	keyPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
};

export function WorkspaceApiKeys() {
	const t = useTranslations("admin.apiKeys");
	const locale = useLocale();
	const { workspaceId } = useWorkspace();
	const [keys, setKeys] = useState<ApiKeyRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [revealedKey, setRevealedKey] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/api-keys?workspaceId=${workspaceId}`,
		);
		if (!res.ok) throw new Error(t("loadFailed"));
		const data = (await res.json()) as { keys: ApiKeyRow[] };
		setKeys(data.keys);
	}, [t, workspaceId]);

	useEffect(() => {
		if (!workspaceId) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- async key bootstrap
		void load()
			.catch((error) =>
				toast.error(error instanceof Error ? error.message : t("loadFailed")),
			)
			.finally(() => setLoading(false));
	}, [load, t, workspaceId]);

	async function createKey() {
		if (!workspaceId || !name.trim()) return;
		setCreating(true);
		try {
			const res = await fetch("/api/workspace/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, name: name.trim() }),
			});
			if (!res.ok)
				throw new Error((await res.json()).error || t("createFailed"));
			const data = (await res.json()) as { rawKey: string };
			setRevealedKey(data.rawKey);
			setName("");
			await load();
			toast.success(t("created"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("createFailed"));
		} finally {
			setCreating(false);
		}
	}

	async function revokeKey(keyId: string) {
		if (!workspaceId) return;
		const res = await fetch(
			`/api/workspace/api-keys/${keyId}?workspaceId=${workspaceId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) {
			toast.error(t("revokeFailed"));
			return;
		}
		await load();
		toast.success(t("revoked"));
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<KeyRoundIcon className="size-4" aria-hidden="true" />
					{t("cardTitle")}
				</CardTitle>
				<CardDescription>
					{t.rich("cardDescription", {
						code: (chunks) => <code className="text-xs">{chunks}</code>,
					})}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div
					className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
					suppressHydrationWarning
				>
					<div className="grid flex-1 gap-2">
						<Label htmlFor="api-key-name">{t("nameLabel")}</Label>
						<Input
							id="api-key-name"
							name="api-key-name"
							autoComplete="off"
							data-1p-ignore
							data-bwignore
							data-form-type="other"
							data-lpignore="true"
							data-protonpass-ignore
							placeholder="CI pipeline…"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<Button
						disabled={creating || !name.trim()}
						onClick={() => void createKey()}
					>
						{creating ? (
							<Loader2 className="animate-spin" aria-hidden="true" />
						) : (
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{t("createButton")}
					</Button>
				</div>

				{revealedKey ? (
					<div className="rounded-xl border border-warning/35 bg-warning/10 p-3 text-sm">
						<p className="font-medium">{t("copyTitle")}</p>
						<div className="mt-2 flex items-center gap-2">
							<code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
								{revealedKey}
							</code>
							<Button
								size="sm"
								variant="outline"
								aria-label={t("copyKey")}
								onClick={() => {
									void navigator.clipboard.writeText(revealedKey);
									toast.success(t("copied"));
								}}
							>
								<CopyIcon aria-hidden="true" />
							</Button>
						</div>
					</div>
				) : null}

				{loading ? (
					<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
				) : keys.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("empty")}</p>
				) : (
					<ul className="divide-y divide-border/70 rounded-xl border">
						{keys.map((key) => (
							<li
								key={key.id}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div>
									<p className="font-medium">{key.name}</p>
									<p className="text-xs text-muted-foreground">
										{key.keyPrefix}… ·{" "}
										{key.lastUsedAt
											? t("lastUsed", {
													date: new Intl.DateTimeFormat(locale, {
														dateStyle: "medium",
														timeStyle: "short",
													}).format(new Date(key.lastUsedAt)),
												})
											: t("neverUsed")}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="outline">{t("active")}</Badge>
									<Button
										size="icon-sm"
										variant="ghost"
										onClick={() => void revokeKey(key.id)}
										aria-label={t("revokeLabel", { name: key.name })}
									>
										<Trash2Icon aria-hidden="true" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
