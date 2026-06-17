import { MessageSquareIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SyntheticEvent } from "react";

import { ModelLogo } from "@/components/providers/model-logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

import type { AgentForm, Model, Provider } from "./types";
import { defaultGenParams } from "./types";
import { getProviderKindIcon } from "./utils";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { SettingHint } from "./shared";

export function ModelTab({
	form,
	setForm,
	providers,
	models,
	saving,
	onSave,
}: {
	form: AgentForm;
	setForm: (fn: (prev: AgentForm) => AgentForm) => void;
	providers: Provider[];
	models: Model[];
	saving: boolean;
	onSave: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
	const t = useTranslations("agents.model");
	const tCommon = useTranslations("common");
	const filteredModels = models.filter((m) => m.providerId === form.providerId);

	function resetGenParams() {
		setForm((prev) => ({
			...prev,
			temperature: defaultGenParams.temperature,
			topP: defaultGenParams.topP,
			maxOutputTokens: defaultGenParams.maxOutputTokens,
			maxToolCalls: defaultGenParams.maxToolCalls,
			toolChoice: "auto",
			generationSettings: {
				topK: "",
				presencePenalty: "",
				frequencyPenalty: "",
				seed: "",
				maxRetries: "",
				stopSequences: "",
			},
			responseFormat: "text",
		}));
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Provider & Model */}
			<Card className="animate-in-up stagger-3">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MessageSquareIcon className="size-5" aria-hidden="true" />
						Provider & Model
					</CardTitle>
					<CardDescription>
						Select the AI provider and specific model for this assistant.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Field>
							<div className="flex items-center gap-2">
								<FieldLabel htmlFor="agent-provider">
									{t("provider")}
								</FieldLabel>
								<SettingHint text="The AI provider hosts the model. You need to configure provider credentials in Settings > Providers first." />
							</div>
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
										<SelectValue placeholder="No provider" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">No provider</SelectItem>
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
							<div className="flex items-center gap-2">
								<FieldLabel htmlFor="agent-model">{t("modelLabel")}</FieldLabel>
								<SettingHint text="Different models vary in capability, speed, and cost. Larger models are generally more capable but slower and more expensive." />
							</div>
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
										<SelectValue placeholder="No model" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">No model</SelectItem>
										{filteredModels.map((model) => {
											const modelLabel = model.displayName || model.modelId;
											return (
												<SelectItem key={model.id} value={model.id}>
													<span className="flex items-center gap-2">
														<ModelLogo
															logoUrl={model.logoUrl}
															label={modelLabel}
															size="sm"
														/>
														{modelLabel}
													</span>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
					</FieldGroup>
				</CardContent>
			</Card>

			{/* System Prompt */}
			<Card className="animate-in-up stagger-4">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MessageSquareIcon className="size-5" aria-hidden="true" />
						{t("systemPrompt")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Field>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<FieldLabel htmlFor="agent-prompt">
										{t("systemPrompt")}
									</FieldLabel>
									<SettingHint text="This prompt runs before every conversation. Use it to set the assistant's role, personality, response format, and any rules it should follow. Leave empty for default behavior." />
								</div>
								<span className="text-xs text-muted-foreground">
									{form.systemPrompt.length} chars
								</span>
							</div>
							<FieldContent>
								<Textarea
									id="agent-prompt"
									className="min-h-40 font-mono text-sm"
									placeholder={t("systemPromptPlaceholder")}
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
				</CardContent>
			</Card>

			<AdvancedSection
				label={tCommon("advanced")}
				hint={t("advancedHint")}
				storageKey="advanced:agent-model"
			>
				<FieldGroup>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-temperature">Temperature</FieldLabel>
							<SettingHint text="Controls randomness: 0 = deterministic, 0.7 = balanced, 1.0 = creative. Lower values for factual tasks, higher for creative work." />
						</div>
						<FieldContent>
							<Input
								id="agent-temperature"
								type="number"
								min={0}
								max={2}
								step={0.1}
								value={form.temperature}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										temperature: e.target.value,
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-top-p">Top P</FieldLabel>
							<SettingHint text="Nucleus sampling: 1.0 considers all tokens, 0.1 considers only the most likely. Lower values make output more focused." />
						</div>
						<FieldContent>
							<Input
								id="agent-top-p"
								type="number"
								min={0}
								max={1}
								step={0.1}
								value={form.topP}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, topP: e.target.value }))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-max-output">
								Max output tokens
							</FieldLabel>
							<SettingHint text="Maximum length of the model's response in tokens. Higher values allow longer responses but cost more. 30000 is the default for newly created agents." />
						</div>
						<FieldContent>
							<Input
								id="agent-max-output"
								type="number"
								min={1}
								value={form.maxOutputTokens}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										maxOutputTokens: e.target.value,
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-max-tool-calls">
								Max tool uses
							</FieldLabel>
							<SettingHint text="How many times the assistant can call tools in a single response. More allows complex multi-step tasks but increases latency." />
						</div>
						<FieldContent>
							<Input
								id="agent-max-tool-calls"
								type="number"
								min={0}
								max={20}
								value={form.maxToolCalls}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										maxToolCalls: e.target.value,
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-tool-choice">Tool choice</FieldLabel>
							<SettingHint text="Auto lets the model decide. Required encourages tool use when tools are available. None disables tool calls for responses." />
						</div>
						<FieldContent>
							<Select
								value={form.toolChoice}
								onValueChange={(value) =>
									setForm((prev) => ({
										...prev,
										toolChoice: value as AgentForm["toolChoice"],
									}))
								}
							>
								<SelectTrigger id="agent-tool-choice" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto</SelectItem>
									<SelectItem value="required">Required</SelectItem>
									<SelectItem value="none">None</SelectItem>
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-response-format">
								Response format
							</FieldLabel>
							<SettingHint text="Text is the default. JSON object stores a structured-output preference for providers and flows that support it." />
						</div>
						<FieldContent>
							<Select
								value={form.responseFormat}
								onValueChange={(value) =>
									setForm((prev) => ({
										...prev,
										responseFormat: value as AgentForm["responseFormat"],
									}))
								}
							>
								<SelectTrigger id="agent-response-format" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="text">Text</SelectItem>
									<SelectItem value="json_object">JSON object</SelectItem>
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-memory-enabled">Memory</FieldLabel>
						<FieldContent>
							<Select
								value={form.memoryPolicy.enabled ? "enabled" : "disabled"}
								onValueChange={(value) =>
									setForm((prev) => ({
										...prev,
										memoryPolicy: {
											...prev.memoryPolicy,
											enabled: value === "enabled",
										},
									}))
								}
							>
								<SelectTrigger id="agent-memory-enabled" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="disabled">Disabled</SelectItem>
									<SelectItem value="enabled">Enabled</SelectItem>
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-memory-max-messages">
							Memory max messages
						</FieldLabel>
						<FieldContent>
							<Input
								id="agent-memory-max-messages"
								type="number"
								min={1}
								value={form.memoryPolicy.maxMessages}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										memoryPolicy: {
											...prev.memoryPolicy,
											maxMessages: Number(e.target.value) || 1,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="agent-top-k">Top K</FieldLabel>
							<SettingHint text="Advanced sampling: only consider the top K token options. Leave empty for provider default." />
						</div>
						<FieldContent>
							<Input
								id="agent-top-k"
								type="number"
								min={1}
								placeholder="Provider default"
								value={form.generationSettings.topK}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											topK: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-presence-penalty">
							Presence penalty
						</FieldLabel>
						<FieldContent>
							<Input
								id="agent-presence-penalty"
								type="number"
								min={-1}
								max={1}
								step={0.1}
								placeholder="Provider default"
								value={form.generationSettings.presencePenalty}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											presencePenalty: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-frequency-penalty">
							Frequency penalty
						</FieldLabel>
						<FieldContent>
							<Input
								id="agent-frequency-penalty"
								type="number"
								min={-1}
								max={1}
								step={0.1}
								placeholder="Provider default"
								value={form.generationSettings.frequencyPenalty}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											frequencyPenalty: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-seed">Seed</FieldLabel>
						<FieldContent>
							<Input
								id="agent-seed"
								type="number"
								placeholder="Provider default"
								value={form.generationSettings.seed}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											seed: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-max-retries">Max retries</FieldLabel>
						<FieldContent>
							<Input
								id="agent-max-retries"
								type="number"
								min={0}
								placeholder="2"
								value={form.generationSettings.maxRetries}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											maxRetries: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-stop-sequences">
							Stop sequences
						</FieldLabel>
						<FieldContent>
							<Textarea
								id="agent-stop-sequences"
								placeholder="One stop sequence per line"
								value={form.generationSettings.stopSequences}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										generationSettings: {
											...prev.generationSettings,
											stopSequences: e.target.value,
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-guardrails-enabled">
							Guardrails
						</FieldLabel>
						<FieldContent>
							<Select
								value={form.guardrails.enabled ? "enabled" : "disabled"}
								onValueChange={(value) =>
									setForm((prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											enabled: value === "enabled",
										},
									}))
								}
							>
								<SelectTrigger id="agent-guardrails-enabled" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="disabled">Disabled</SelectItem>
									<SelectItem value="enabled">Enabled</SelectItem>
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-guardrail-topics">
							Blocked topics
						</FieldLabel>
						<FieldContent>
							<Textarea
								id="agent-guardrail-topics"
								placeholder="One topic per line"
								value={form.guardrails.blockedTopics.join("\n")}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											blockedTopics: e.target.value
												.split(/\n|,/)
												.map((topic) => topic.trim())
												.filter(Boolean),
										},
									}))
								}
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-approval-all-tools">
							Approval policy
						</FieldLabel>
						<FieldContent>
							<Select
								value={
									form.approvalPolicy.requireApprovalForAllTools
										? "all"
										: "per-tool"
								}
								onValueChange={(value) =>
									setForm((prev) => ({
										...prev,
										approvalPolicy: {
											requireApprovalForAllTools: value === "all",
										},
									}))
								}
							>
								<SelectTrigger id="agent-approval-all-tools" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="per-tool">Per-tool settings</SelectItem>
									<SelectItem value="all">
										Require approval for all tools
									</SelectItem>
								</SelectContent>
							</Select>
						</FieldContent>
					</Field>
				</FieldGroup>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={resetGenParams}
						className="text-xs"
					>
						<RefreshCwIcon className="size-3" aria-hidden="true" />
						{t("resetDefaults")}
					</Button>
					<Button
						onClick={(e) => {
							const fakeEvent = e as unknown as SyntheticEvent<HTMLFormElement>;
							onSave(fakeEvent);
						}}
						disabled={saving}
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{tCommon("save")}
					</Button>
				</div>
			</AdvancedSection>
		</div>
	);
}
