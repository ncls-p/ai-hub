import { BrainIcon, MessageSquareIcon, RefreshCwIcon, SaveIcon, SparklesIcon, SlidersIcon } from "lucide-react";
import type { SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
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
import { InfoCallout, SettingHint } from "./shared";

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
	const filteredModels = models.filter((m) => m.providerId === form.providerId);

	function resetGenParams() {
		setForm((prev) => ({
			...prev,
			temperature: defaultGenParams.temperature,
			topP: defaultGenParams.topP,
			maxOutputTokens: defaultGenParams.maxOutputTokens,
			maxToolCalls: defaultGenParams.maxToolCalls,
		}));
	}

	return (
		<div className="space-y-4">
			<InfoCallout title="About models" icon={BrainIcon}>
				Choose an AI provider and model for this assistant. The model
				determines the assistant&apos;s reasoning ability, knowledge cutoff,
				and response style. The system prompt guides how it behaves — be
				specific about its role, tone, and constraints.
			</InfoCallout>

			{/* Provider & Model */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SparklesIcon className="size-5" aria-hidden="true" />
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
								<FieldLabel htmlFor="agent-provider">Provider</FieldLabel>
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
								<FieldLabel htmlFor="agent-model">Model</FieldLabel>
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
										{filteredModels.map((model) => (
											<SelectItem key={model.id} value={model.id}>
												{model.displayName || model.modelId}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
					</FieldGroup>
				</CardContent>
			</Card>

			{/* System Prompt */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MessageSquareIcon className="size-5" aria-hidden="true" />
						System Prompt
					</CardTitle>
					<CardDescription>
						The system prompt defines the assistant&apos;s behavior, tone,
						and constraints.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Field>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<FieldLabel htmlFor="agent-prompt">
										System prompt
									</FieldLabel>
									<SettingHint text="This prompt runs before every conversation. Use it to set the assistant&apos;s role, personality, response format, and any rules it should follow. Leave empty for default behavior." />
								</div>
								<span className="text-xs text-muted-foreground">
									{form.systemPrompt.length} chars
								</span>
							</div>
							<FieldContent>
								<Textarea
									id="agent-prompt"
									className="min-h-40 font-mono text-sm"
									placeholder="You are a helpful coding assistant. You write clean, well-documented code and explain your reasoning…"
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

			{/* Generation Parameters */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SlidersIcon className="size-5" aria-hidden="true" />
						Generation Parameters
					</CardTitle>
					<CardDescription>
						Fine-tune how the model generates responses.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Field>
							<div className="flex items-center gap-2">
								<FieldLabel htmlFor="agent-temperature">
									Temperature
								</FieldLabel>
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
								<SettingHint text="Maximum length of the model&apos;s response in tokens. Higher values allow longer responses but cost more. 1024 is good for most tasks." />
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
					</FieldGroup>
				</CardContent>
				<CardFooter className="justify-between">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={resetGenParams}
						className="text-xs"
					>
						<RefreshCwIcon className="size-3" aria-hidden="true" />
						Reset to defaults
					</Button>
					<Button
						onClick={(e) => {
							const fakeEvent =
								e as unknown as SyntheticEvent<HTMLFormElement>;
							onSave(fakeEvent);
						}}
						disabled={saving}
					>
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Save changes
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
