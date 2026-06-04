"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

import { AUTH_TYPE_LABELS, KIND_LABELS } from "./constants";
import type { ProviderAuthType, ProviderKind, SafeProvider } from "./types";
import { defaultAuthType } from "./utils";

type AddProviderDialogProps = {
	open: boolean;
	busy: boolean;
	addKind: ProviderKind;
	addAuthType: ProviderAuthType;
	addName: string;
	addBaseUrl: string;
	addApiKey: string;
	addCustomHeaders: string;
	addQueryParams: string;
	addAdvanced: boolean;
	onOpenChange: (open: boolean) => void;
	onKindChange: (kind: ProviderKind) => void;
	onAuthTypeChange: (authType: ProviderAuthType) => void;
	onNameChange: (value: string) => void;
	onBaseUrlChange: (value: string) => void;
	onApiKeyChange: (value: string) => void;
	onCustomHeadersChange: (value: string) => void;
	onQueryParamsChange: (value: string) => void;
	onAdvancedChange: (value: boolean) => void;
	onCreateProvider: () => void;
};

export function AddProviderDialog(props: AddProviderDialogProps) {
	const t = useTranslations("providers");
	const tCommon = useTranslations("common");
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("add")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<AddProviderBasicFields {...props} />
					<AdvancedSection
						label={tCommon("advanced")}
						hint={t("advancedHint")}
						storageKey="advanced:provider-add"
						defaultOpen={props.addAdvanced}
					>
						<AddProviderAdvancedFields {...props} />
					</AdvancedSection>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => props.onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={props.busy || !props.addName.trim()}
						onClick={props.onCreateProvider}
					>
						{props.busy ? (
							<Loader2Icon className="animate-spin" aria-hidden="true" />
						) : (
							<PlusIcon className="size-4" aria-hidden="true" />
						)}
						Connect provider
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AddProviderBasicFields(props: AddProviderDialogProps) {
	return (
		<>
			<div className="grid gap-2">
				<Label htmlFor="add-provider-name">Name</Label>
				<Input
					id="add-provider-name"
					autoComplete="off"
					value={props.addName}
					onChange={(e) => props.onNameChange(e.target.value)}
					placeholder="Production OpenAI"
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="add-provider-url">Service URL</Label>
				<Input
					id="add-provider-url"
					type="url"
					autoComplete="off"
					value={props.addBaseUrl}
					onChange={(e) => props.onBaseUrlChange(e.target.value)}
					placeholder="https://api.openai.com/v1"
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="add-provider-key">API key</Label>
				<Input
					id="add-provider-key"
					type="password"
					autoComplete="off"
					value={props.addApiKey}
					onChange={(e) => props.onApiKeyChange(e.target.value)}
					placeholder="sk-…"
				/>
			</div>
		</>
	);
}

function AddProviderAdvancedFields(props: AddProviderDialogProps) {
	return (
		<div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="add-provider-kind">Provider type</Label>
					<Select
						value={props.addKind}
						onValueChange={(value) => {
							const kind = value as ProviderKind;
							props.onKindChange(kind);
							props.onAuthTypeChange(defaultAuthType(kind));
						}}
					>
						<SelectTrigger id="add-provider-kind">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(KIND_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="add-provider-auth">Authentication</Label>
					<Select
						value={props.addAuthType}
						onValueChange={(value) =>
							props.onAuthTypeChange(value as ProviderAuthType)
						}
					>
						<SelectTrigger id="add-provider-auth">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(AUTH_TYPE_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="add-headers">Custom headers</Label>
					<Textarea
						id="add-headers"
						autoComplete="off"
						value={props.addCustomHeaders}
						onChange={(e) => props.onCustomHeadersChange(e.target.value)}
						placeholder="X-Team=ai-platform"
						className="min-h-20 font-mono text-xs"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="add-query">Query params</Label>
					<Textarea
						id="add-query"
						autoComplete="off"
						value={props.addQueryParams}
						onChange={(e) => props.onQueryParamsChange(e.target.value)}
						placeholder="api-version=2024-10-21"
						className="min-h-20 font-mono text-xs"
					/>
				</div>
			</div>
		</div>
	);
}

type EditProviderDialogProps = {
	editingProvider: SafeProvider | null;
	busy: boolean;
	editName: string;
	editBaseUrl: string;
	editApiKey: string;
	onClose: () => void;
	onNameChange: (value: string) => void;
	onBaseUrlChange: (value: string) => void;
	onApiKeyChange: (value: string) => void;
	onSave: () => void;
};

export function EditProviderDialog({
	editingProvider,
	busy,
	editName,
	editBaseUrl,
	editApiKey,
	onClose,
	onNameChange,
	onBaseUrlChange,
	onApiKeyChange,
	onSave,
}: EditProviderDialogProps) {
	return (
		<Dialog open={Boolean(editingProvider)} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit connection</DialogTitle>
					<DialogDescription>
						Update the details for &ldquo;{editingProvider?.name}&rdquo;.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="grid gap-2">
						<Label>Name</Label>
						<Input
							value={editName}
							onChange={(e) => onNameChange(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Service URL</Label>
						<Input
							value={editBaseUrl}
							onChange={(e) => onBaseUrlChange(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label>
							New API key{" "}
							<span className="text-muted-foreground">(optional)</span>
						</Label>
						<Input
							type="password"
							value={editApiKey}
							onChange={(e) => onApiKeyChange(e.target.value)}
							placeholder="Leave blank to keep current key"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={busy} onClick={onSave}>
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function DeleteProviderDialog({
	deleteProviderId,
	busy,
	onClose,
	onDelete,
}: {
	deleteProviderId: string | null;
	busy: boolean;
	onClose: () => void;
	onDelete: (id: string) => void;
}) {
	return (
		<AlertDialog open={Boolean(deleteProviderId)} onOpenChange={onClose}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Archive this connection?</AlertDialogTitle>
					<AlertDialogDescription>
						The provider will be archived. Existing agent versions may keep
						references to its models.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={busy}
						onClick={() => deleteProviderId && onDelete(deleteProviderId)}
					>
						Archive
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function DeleteModelDialog({
	deleteModelId,
	busy,
	onClose,
	onDelete,
}: {
	deleteModelId: string | null;
	busy: boolean;
	onClose: () => void;
	onDelete: (id: string) => void;
}) {
	return (
		<AlertDialog open={Boolean(deleteModelId)} onOpenChange={onClose}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove this model?</AlertDialogTitle>
					<AlertDialogDescription>
						The model will be removed from this provider. Assistants already
						bound to it may need reconfiguration.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={busy}
						onClick={() => deleteModelId && onDelete(deleteModelId)}
					>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
