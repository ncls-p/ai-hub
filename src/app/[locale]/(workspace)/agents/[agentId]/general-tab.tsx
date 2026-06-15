import {
	GlobeIcon,
	ShieldCheckIcon,
	SettingsIcon,
	SaveIcon,
	StarIcon,
} from "lucide-react";
import type { SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
	canAdminCurate,
	onSave,
}: {
	form: AgentForm;
	setForm: (fn: (prev: AgentForm) => AgentForm) => void;
	saving: boolean;
	canAdminCurate: boolean;
	onSave: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
	return (
		<div className="space-y-4">
			<InfoCallout title="About this section">
				Set your assistant&apos;s identity and who can use it. The name and
				description appear in chat and the assistant listing. Sharing controls
				determine visibility.
			</InfoCallout>

			<form onSubmit={onSave}>
				<Card className="animate-in-up stagger-3">
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
									<FieldLabel htmlFor="agent-slug">Slug</FieldLabel>
									<SettingHint text="Unique URL-safe identifier for this assistant. Use lowercase letters, numbers, and hyphens." />
								</div>
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

			<Card className="animate-in-up stagger-4">
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
									<SettingHint text="Personal means only you can use it. Team makes it visible to everyone. Specific user shares with one person by email." />
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
												Share with team
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

			{canAdminCurate ? (
				<Card className="animate-in-up stagger-5">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<GlobeIcon className="size-5" aria-hidden="true" />
							Marketplace & Curation
						</CardTitle>
						<CardDescription>
							Admin-only discovery controls for curated assistants.
						</CardDescription>
					</CardHeader>
					<form onSubmit={onSave}>
						<CardContent>
							<FieldGroup>
								<Field>
									<div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
										<Checkbox
											id="agent-global"
											checked={form.isGlobal}
											onCheckedChange={(checked) =>
												setForm((prev) => ({
													...prev,
													isGlobal: checked === true,
												}))
											}
										/>
										<div>
											<FieldLabel htmlFor="agent-global">
												Global assistant
											</FieldLabel>
											<p className="text-xs text-muted-foreground">
												Make this assistant visible beyond its creator scope.
											</p>
										</div>
									</div>
								</Field>
								<Field>
									<div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
										<Checkbox
											id="agent-recommended"
											checked={form.isRecommended}
											onCheckedChange={(checked) =>
												setForm((prev) => ({
													...prev,
													isRecommended: checked === true,
												}))
											}
										/>
										<div>
											<FieldLabel htmlFor="agent-recommended" className="gap-2">
												<StarIcon className="size-4" aria-hidden="true" />
												Recommended
											</FieldLabel>
											<p className="text-xs text-muted-foreground">
												Highlight this assistant as recommended.
											</p>
										</div>
									</div>
								</Field>
								<Field>
									<FieldLabel htmlFor="agent-curation-label">
										Curation label
									</FieldLabel>
									<FieldContent>
										<Select
											value={form.curationLabel}
											onValueChange={(value) =>
												setForm((prev) => ({ ...prev, curationLabel: value }))
											}
										>
											<SelectTrigger
												id="agent-curation-label"
												className="w-full"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">No label</SelectItem>
												<SelectItem value="recommended">Recommended</SelectItem>
												<SelectItem value="organization_created">
													Created by team
												</SelectItem>
											</SelectContent>
										</Select>
									</FieldContent>
								</Field>
							</FieldGroup>
						</CardContent>
						<CardFooter className="justify-end">
							<Button type="submit" disabled={saving}>
								{saving ? (
									<Spinner data-icon="inline-start" />
								) : (
									<SaveIcon data-icon="inline-start" aria-hidden="true" />
								)}
								Save curation
							</Button>
						</CardFooter>
					</form>
				</Card>
			) : null}
		</div>
	);
}
