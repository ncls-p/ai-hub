import {
	KeyRoundIcon,
	SettingsIcon,
	ShieldCheckIcon,
	SlidersHorizontalIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const settingsSections = [
	{
		title: "Workspace identity",
		description:
			"Name, default workspace metadata, and collaboration defaults.",
		icon: SettingsIcon,
		status: "Coming soon",
	},
	{
		title: "Access policies",
		description: "Role defaults, member invitations, and admin guardrails.",
		icon: ShieldCheckIcon,
		status: "Planned",
	},
	{
		title: "Provider secrets",
		description: "Encryption, rotation windows, and provider-level access.",
		icon: KeyRoundIcon,
		status: "Planned",
	},
];

export default function SettingsPage() {
	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Settings</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Workspace settings
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Configure the AI Hub workspace with the same structured, glassy
						Deodis interface used across AltScribe.
					</p>
				</div>
				<Button type="button" variant="outline">
					<SlidersHorizontalIcon data-icon="inline-start" aria-hidden="true" />
					Customize
				</Button>
			</div>

			<Card>
				<CardHeader className="border-b border-border/70 pb-4">
					<div className="flex items-start justify-between gap-3">
						<div className="flex flex-col gap-1">
							<CardTitle>Configuration</CardTitle>
							<CardDescription>
								Workspace controls are staged for the next implementation pass.
							</CardDescription>
						</div>
						<Badge variant="secondary">Preview</Badge>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-0 pt-5">
					{settingsSections.map((section, index) => (
						<div key={section.title}>
							<div className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
									<section.icon className="size-4" aria-hidden="true" />
								</span>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<div className="flex flex-wrap items-center gap-2">
										<h2 className="font-semibold">{section.title}</h2>
										<Badge variant="outline">{section.status}</Badge>
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										{section.description}
									</p>
								</div>
							</div>
							{index < settingsSections.length - 1 ? <Separator /> : null}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
