import { ShieldCheckIcon, SettingsIcon, SaveIcon } from "lucide-react";
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

import type { Agent, AgentForm } from "./types";
import { InfoCallout, SettingHint } from "./shared";

export function GeneralTab({
	form,
	setForm,
	saving,
	onSave,
}: {
	form: AgentForm;
	setForm: (fn: (prev: AgentForm) => AgentForm) => void;
	saving: boolean;
	onSave: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
	return (
		<div className="space-y-4">
			<InfoCallout title="About this section">
				Set your assistant&apos;s identity and who can use it. The name and
				description appear in chat and the assistant listing. Sharing controls
				determine visibility within your workspace.
			</InfoCallout>

			<form onSubmit={onSave}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<SettingsIcon className="size-5" aria-hidden="true" />
							Identity
						</CardTitle>
						<CardDescription>
							Name and description for this assistant.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="agent-name">Name</FieldLabel>
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
								<div className="flex items-center gap-2">
									<FieldLabel htmlFor="agent-description">
										Description
									</FieldLabel>
									<SettingHint text="A short description helps users understand what this assistant does. Shown in the assistant listing and chat header." />
								</div>
								<FieldContent>
									<Textarea
										id="agent-description"
										placeholder="A helpful assistant for…"
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
					</CardContent>
				</Card>
			</form>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheckIcon className="size-5" aria-hidden="true" />
						Access & Sharing
					</CardTitle>
					<CardDescription>
						Control who can discover and use this assistant.
					</CardDescription>
				</CardHeader>
				<form onSubmit={onSave}>
					<CardContent>
						<FieldGroup>
							<Field>
								<div className="flex items-center gap-2">
									<FieldLabel htmlFor="agent-sharing">Sharing mode</FieldLabel>
									<SettingHint text="Personal means only you can use it. Workspace makes it visible to everyone. Specific user shares with one person by email." />
								</div>
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
											<SelectItem value="personal">Personal</SelectItem>
											<SelectItem value="marketplace">
												Share with workspace
											</SelectItem>
											<SelectItem value="specific_user">
												Specific user
											</SelectItem>
										</SelectContent>
									</Select>
								</FieldContent>
							</Field>
							{form.sharingMode === "specific_user" && (
								<Field>
									<FieldLabel htmlFor="agent-share-email">
										Shared user email
									</FieldLabel>
									<FieldContent>
										<Input
											id="agent-share-email"
											type="email"
											placeholder="colleague@example.com"
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
							)}
						</FieldGroup>
					</CardContent>
					<CardFooter className="justify-between">
						<p className="text-xs text-muted-foreground">
							Changes apply immediately after saving.
						</p>
						<Button type="submit" disabled={saving}>
							{saving ? (
								<Spinner data-icon="inline-start" />
							) : (
								<SaveIcon data-icon="inline-start" aria-hidden="true" />
							)}
							Save changes
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
