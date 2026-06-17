import {
	ImagePlusIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ModelLogo } from "@/components/providers/model-logo";
import { ModelCapabilities } from "./provider-shared";
import type { DiscoveredModel, ProviderModel, SafeProvider } from "./types";

const MAX_LOGO_BYTES = 256 * 1024;

function readLogoFile(file: File) {
	return new Promise<string>((resolve, reject) => {
		if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
			reject(new Error("Use a bitmap image such as PNG, JPG, WebP, GIF, or AVIF."));
			return;
		}
		if (file.size > MAX_LOGO_BYTES) {
			reject(new Error("Logo must stay under 256 KB."));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("Unable to read logo file."));
		reader.readAsDataURL(file);
	});
}

type ModelsPanelProps = {
	selectedProvider: SafeProvider | null;
	providers: SafeProvider[];
	models: ProviderModel[];
	filteredModels: ProviderModel[];
	discoveredModels: DiscoveredModel[];
	modelSearch: string;
	manualModelId: string;
	manualModelName: string;
	loadingModels: boolean;
	loadingProviders: boolean;
	busy: boolean;
	onDiscoverModels: () => void;
	onUpdateModelLogo: (modelId: string, logoUrl: string | null) => void;
	onCreateModel: (model?: DiscoveredModel) => void;
	onDeleteModel: (modelId: string) => void;
	onModelSearchChange: (value: string) => void;
	onManualModelIdChange: (value: string) => void;
	onManualModelNameChange: (value: string) => void;
};

export function ModelsPanel(props: ModelsPanelProps) {
	if (props.selectedProvider) {
		return (
			<section className="rounded-xl border bg-card">
				<ModelsHeader {...props} />
				<ManualModelForm {...props} />
				<DiscoveredModelsList {...props} />
				<RegisteredModelsList {...props} />
			</section>
		);
	}

	if (props.providers.length > 0 && !props.loadingProviders) {
		return (
			<div className="rounded-xl border border-dashed bg-card p-8 text-center">
				<p className="text-sm text-muted-foreground">
					Select a provider to manage its models.
				</p>
			</div>
		);
	}

	return null;
}

function ModelsHeader({
	selectedProvider,
	busy,
	onDiscoverModels,
}: ModelsPanelProps) {
	return (
		<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 className="text-base font-semibold">Models</h3>
				<p className="text-sm text-muted-foreground">
					Registered models for{" "}
					<span className="font-medium text-foreground">
						{selectedProvider?.name}
					</span>
				</p>
			</div>
			<Button
				size="sm"
				variant="outline"
				disabled={busy}
				onClick={onDiscoverModels}
			>
				<RefreshCwIcon className="size-4" aria-hidden="true" />
				Discover
			</Button>
		</div>
	);
}

function ManualModelForm({
	manualModelId,
	manualModelName,
	busy,
	onCreateModel,
	onManualModelIdChange,
	onManualModelNameChange,
}: ModelsPanelProps) {
	return (
		<div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_1fr_auto]">
			<div className="grid gap-1.5">
				<Label htmlFor="model-id" className="text-xs">
					Model ID
				</Label>
				<Input
					id="model-id"
					autoComplete="off"
					value={manualModelId}
					onChange={(e) => onManualModelIdChange(e.target.value)}
					placeholder="gpt-4o-mini"
					className="font-mono text-sm"
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="model-display-name" className="text-xs">
					Display name
				</Label>
				<Input
					id="model-display-name"
					autoComplete="off"
					value={manualModelName}
					onChange={(e) => onManualModelNameChange(e.target.value)}
					placeholder="GPT-4o mini"
					className="text-sm"
				/>
			</div>
			<div className="flex items-end">
				<Button
					size="sm"
					disabled={busy || !manualModelId}
					onClick={() => onCreateModel()}
				>
					<PlusIcon className="size-4" aria-hidden="true" />
					Add
				</Button>
			</div>
		</div>
	);
}

function DiscoveredModelsList({
	discoveredModels,
	models,
	busy,
	onCreateModel,
}: ModelsPanelProps) {
	if (discoveredModels.length === 0) return null;

	return (
		<div className="border-b bg-muted/15 p-4">
			<p className="mb-2 text-xs font-medium text-muted-foreground">
				Discovered ({discoveredModels.length})
			</p>
			<div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-background">
				{discoveredModels.map((model) => {
					const alreadyRegistered = models.some(
						(m) => m.modelId === model.modelId,
					);
					return (
						<div
							key={model.modelId}
							className={cn(
								"flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0",
								alreadyRegistered ? "opacity-50" : "hover:bg-muted/30",
							)}
						>
							<DiscoveredModelInfo model={model} />
							<Button
								size="xs"
								variant="outline"
								disabled={busy || alreadyRegistered}
								onClick={() => onCreateModel(model)}
							>
								{alreadyRegistered ? "Added" : "Add"}
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function DiscoveredModelInfo({ model }: { model: DiscoveredModel }) {
	return (
		<div className="min-w-0">
			<p className="truncate text-sm font-medium">
				{model.displayName || model.modelId}
			</p>
			<p className="truncate font-mono text-xs text-muted-foreground">
				{model.modelId}
			</p>
			{model.description ? (
				<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
					{model.description}
				</p>
			) : null}
			<ModelCapabilities
				capabilities={model.capabilities}
				contextWindow={model.contextWindow}
				maxOutputTokens={model.maxOutputTokens}
				inputTokenCost={model.inputTokenCost}
				outputTokenCost={model.outputTokenCost}
				hostedBy={model.hostedBy}
			/>
		</div>
	);
}

function RegisteredModelsList({
	models,
	filteredModels,
	modelSearch,
	loadingModels,
	busy,
	onModelSearchChange,
	onUpdateModelLogo,
	onDeleteModel,
}: ModelsPanelProps) {
	return (
		<div className="p-4">
			{models.length > 3 ? (
				<div className="relative mb-3">
					<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Filter models…"
						value={modelSearch}
						onChange={(e) => onModelSearchChange(e.target.value)}
						className="h-8 pl-9 text-sm"
					/>
				</div>
			) : null}
			<RegisteredModelsBody
				models={models}
				filteredModels={filteredModels}
				modelSearch={modelSearch}
				loadingModels={loadingModels}
				busy={busy}
				onUpdateModelLogo={onUpdateModelLogo}
				onDeleteModel={onDeleteModel}
			/>
		</div>
	);
}

function RegisteredModelsBody({
	models,
	filteredModels,
	modelSearch,
	loadingModels,
	busy,
	onUpdateModelLogo,
	onDeleteModel,
}: Pick<
	ModelsPanelProps,
	| "models"
	| "filteredModels"
	| "modelSearch"
	| "loadingModels"
	| "busy"
	| "onUpdateModelLogo"
	| "onDeleteModel"
>) {
	if (loadingModels) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-11 w-full" />
				<Skeleton className="h-11 w-full" />
			</div>
		);
	}

	if (filteredModels.length === 0 && models.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No models registered yet.
			</div>
		);
	}

	if (filteredModels.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No model matches &ldquo;{modelSearch}&rdquo;.
			</div>
		);
	}

	return (
		<div className="divide-y rounded-lg border">
			{filteredModels.map((model) => (
				<RegisteredModelRow
					key={model.id}
					model={model}
					busy={busy}
					onUpdateModelLogo={onUpdateModelLogo}
					onDeleteModel={onDeleteModel}
				/>
			))}
		</div>
	);
}

function RegisteredModelRow({
	model,
	busy,
	onUpdateModelLogo,
	onDeleteModel,
}: {
	model: ProviderModel;
	busy: boolean;
	onUpdateModelLogo: (modelId: string, logoUrl: string | null) => void;
	onDeleteModel: (modelId: string) => void;
}) {
	const modelLabel = model.displayName || model.modelId;

	async function handleLogoChange(file: File | undefined) {
		if (!file) return;
		try {
			onUpdateModelLogo(model.id, await readLogoFile(file));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Invalid image file");
		}
	}

	return (
		<div className="group flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30">
			<div className="flex min-w-0 items-start gap-3">
				<ModelLogo logoUrl={model.logoUrl} label={modelLabel} size="lg" />
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">{modelLabel}</p>
					<p className="truncate font-mono text-xs text-muted-foreground">
						{model.modelId}
					</p>
					<ModelCapabilities
						capabilities={model.capabilitiesJson}
						contextWindow={model.contextWindow}
						maxOutputTokens={model.maxOutputTokens}
						inputTokenCost={model.inputTokenCost}
						outputTokenCost={model.outputTokenCost}
						enabled={model.enabled}
					/>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
				<input
					id={`model-logo-${model.id}`}
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/*"
					className="sr-only"
					disabled={busy}
					onChange={(event) => {
						void handleLogoChange(event.currentTarget.files?.[0]);
						event.currentTarget.value = "";
					}}
				/>
				<Button size="icon-xs" variant="ghost" asChild>
					<label
						htmlFor={`model-logo-${model.id}`}
						aria-label="Assign model logo"
						aria-disabled={busy}
						className={cn(
							"cursor-pointer",
							busy && "pointer-events-none opacity-45",
						)}
					>
						<ImagePlusIcon className="size-3.5" aria-hidden="true" />
					</label>
				</Button>
				{model.logoUrl ? (
					<Button
						size="icon-xs"
						variant="ghost"
						disabled={busy}
						aria-label="Remove model logo"
						onClick={() => onUpdateModelLogo(model.id, null)}
					>
						<XIcon className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}
				<Button
					size="icon-xs"
					variant="ghost"
					aria-label="Remove model"
					disabled={busy}
					onClick={() => onDeleteModel(model.id)}
				>
					<Trash2Icon className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
