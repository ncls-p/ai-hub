"use client";

import { MessageSquareIcon, SaveIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SyntheticEvent } from "react";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { ConfigSection } from "./config-section";
import { ModelAdvancedFields } from "./model-advanced-fields";
import type { Agent, AgentForm, Model, Provider } from "./types";
import { getProviderKindIcon } from "./utils";

export function EssentialTab({
	form,
	setFormAction: setForm,
	providers,
	models,
	saving,
	canAdminCurate,
	readOnly = false,
	onSaveAction: onSave,
}: {
	form: AgentForm;
	setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
	providers: Provider[];
	models: Model[];
	saving: boolean;
	canAdminCurate: boolean;
	readOnly?: boolean;
	onSaveAction: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
	const t = useTranslations("agents");
	const tModel = useTranslations("agents.model");
	const tCommon = useTranslations("common");
	const filteredModels = models.filter((m) => m.providerId === form.providerId);

	return (
		<form
			onSubmit={readOnly ? (event) => event.preventDefault() : onSave}
			className="flex flex-col gap-4"
		>
			<fieldset disabled={readOnly} className="contents">
				<ConfigSection
				title={t("name")}
				description={t("configurePage.identityHint")}
				icon={SettingsIcon}
				stagger="3"
			>
				<FieldGroup className="gap-4">
					<Field>
						<FieldLabel htmlFor="agent-name">{t("name")}</FieldLabel>
						<FieldContent>
							<Input
								id="agent-name"
								required
								value={form.name}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, name: e.target.value }))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-description">
							{t("descriptionLabel")}
						</FieldLabel>
						<FieldContent>
							<Textarea
								id="agent-description"
								rows={2}
								placeholder={t("descriptionPlaceholder")}
								value={form.description}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
							/>
						</FieldContent>
					</Field>
				</FieldGroup>
			</ConfigSection>

			<ConfigSection
				title={tModel("modelLabel")}
				description={t("configurePage.modelHint")}
				icon={MessageSquareIcon}
				stagger="4"
			>
				<FieldGroup className="gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="agent-provider">
								{tModel("provider")}
							</FieldLabel>
							<FieldContent>
								<Select
									value={form.providerId || "__none__"}
									onValueChange={(value) =>
										setForm((prev) => ({
											...prev,
											providerId: value === "__none__" ? "" : value,
											modelId: "",
										}))
									}
								>
									<SelectTrigger id="agent-provider" className="w-full">
										<SelectValue placeholder="—" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">—</SelectItem>
										{providers.map((provider) => (
											<SelectItem key={provider.id} value={provider.id}>
												<span className="flex items-center gap-2">
													{getProviderKindIcon(provider.kind)}
													{provider.name}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="agent-model">
								{tModel("modelLabel")}
							</FieldLabel>
							<FieldContent>
								<Select
									value={form.modelId || "__none__"}
									onValueChange={(value) =>
										setForm((prev) => ({
											...prev,
											modelId: value === "__none__" ? "" : value,
										}))
									}
									disabled={!form.providerId}
								>
									<SelectTrigger id="agent-model" className="w-full">
										<SelectValue placeholder="—" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">—</SelectItem>
										{filteredModels.map((model) => (
											<SelectItem key={model.id} value={model.id}>
												{model.displayName || model.modelId}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="agent-prompt">
							{tModel("systemPrompt")}
						</FieldLabel>
						<FieldContent>
							<Textarea
								id="agent-prompt"
								className="min-h-36 font-mono text-sm"
								placeholder={tModel("systemPromptPlaceholder")}
								value={form.systemPrompt}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										systemPrompt: e.target.value,
									}))
								}
							/>
						</FieldContent>
					</Field>
				</FieldGroup>
			</ConfigSection>

			<AdvancedSection
				label={tCommon("advanced")}
				hint={t("advancedHint")}
				storageKey="advanced:agent-settings"
				className="animate-in-up stagger-5"
			>
				<div className="space-y-6">
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="agent-slug">Slug</FieldLabel>
							<FieldContent>
								<Input
									id="agent-slug"
									required
									pattern="[a-z0-9-]+"
									value={form.slug}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											slug: e.target.value.toLowerCase(),
										}))
									}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="agent-sharing">
								{t("configurePage.sharing")}
							</FieldLabel>
							<FieldContent>
								<Select
									value={form.sharingMode}
									onValueChange={(value) =>
										setForm((prev) => ({
											...prev,
											sharingMode: value as Agent["sharingMode"],
										}))
									}
								>
									<SelectTrigger id="agent-sharing" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="personal">
											{t("configurePage.sharingPersonal")}
										</SelectItem>
										<SelectItem value="marketplace">
											{t("configurePage.sharingWorkspace")}
										</SelectItem>
										<SelectItem value="specific_user">
											{t("configurePage.sharingUser")}
										</SelectItem>
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
						{form.sharingMode === "specific_user" ? (
							<Field>
								<FieldLabel htmlFor="agent-share-email">E-mail</FieldLabel>
								<FieldContent>
									<Input
										id="agent-share-email"
										type="email"
										value={form.shareTargetEmail}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												shareTargetEmail: e.target.value,
											}))
										}
									/>
								</FieldContent>
							</Field>
						) : null}
					</FieldGroup>

					{canAdminCurate ? (
						<FieldGroup className="gap-3 border-t border-border/50 pt-4">
							<label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
								<Checkbox
									checked={form.isGlobal}
									onCheckedChange={(checked) =>
										setForm((prev) => ({
											...prev,
											isGlobal: checked === true,
										}))
									}
								/>
								{t("configurePage.globalAssistant")}
							</label>
							<label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
								<Checkbox
									checked={form.isRecommended}
									onCheckedChange={(checked) =>
										setForm((prev) => ({
											...prev,
											isRecommended: checked === true,
										}))
									}
								/>
								{t("configurePage.recommended")}
							</label>
						</FieldGroup>
					) : null}

					<div className="border-t border-border/50 pt-4">
						<p className="mb-3 flex items-center gap-2 text-sm font-medium">
							<MessageSquareIcon
								className="size-4 text-muted-foreground"
								aria-hidden="true"
							/>
							{tModel("advancedHint")}
						</p>
						<ModelAdvancedFields form={form} setFormAction={setForm} />
					</div>
				</div>
				</AdvancedSection>
			</fieldset>

			{readOnly ? null : (
				<CardFooter className="justify-end px-0 pb-0">
					<Button type="submit" disabled={saving}>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{tCommon("save")}
					</Button>
				</CardFooter>
			)}
		</form>
	);
}
