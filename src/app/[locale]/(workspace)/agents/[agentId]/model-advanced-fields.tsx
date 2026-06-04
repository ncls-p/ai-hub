"use client";

import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

import type { AgentForm } from "./types";
import { defaultGenParams } from "./types";

export function ModelAdvancedFields({
	form,
	setForm,
	onReset,
}: {
	form: AgentForm;
	setForm: (fn: (prev: AgentForm) => AgentForm) => void;
	onReset?: () => void;
}) {
	const t = useTranslations("agents.model");

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
		onReset?.();
	}

	return (
		<div className="space-y-4">
			<FieldGroup className="grid gap-4 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="agent-temperature">Temperature</FieldLabel>
					<FieldContent>
						<Input
							id="agent-temperature"
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={form.temperature}
							onChange={(e) =>
								setForm((prev) => ({ ...prev, temperature: e.target.value }))
							}
						/>
					</FieldContent>
				</Field>
				<Field>
					<FieldLabel htmlFor="agent-top-p">Top P</FieldLabel>
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
					<FieldLabel htmlFor="agent-max-output">Max tokens</FieldLabel>
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
					<FieldLabel htmlFor="agent-max-tool-calls">Max tool calls</FieldLabel>
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
					<FieldLabel htmlFor="agent-tool-choice">Tool choice</FieldLabel>
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
					<FieldLabel htmlFor="agent-response-format">Response format</FieldLabel>
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
								<SelectItem value="json_object">JSON</SelectItem>
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
					<FieldLabel htmlFor="agent-top-k">Top K</FieldLabel>
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
					<FieldLabel htmlFor="agent-presence-penalty">Presence penalty</FieldLabel>
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
					<FieldLabel htmlFor="agent-guardrails-enabled">Guardrails</FieldLabel>
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
				<Field className="sm:col-span-2">
					<FieldLabel htmlFor="agent-guardrail-topics">Blocked topics</FieldLabel>
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
				<Field className="sm:col-span-2">
					<FieldLabel htmlFor="agent-stop-sequences">Stop sequences</FieldLabel>
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
			</FieldGroup>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="px-0 text-xs"
				onClick={resetGenParams}
			>
				<RefreshCwIcon className="size-3" aria-hidden="true" />
				{t("resetDefaults")}
			</Button>
		</div>
	);
}
