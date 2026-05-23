import {
	MailPlusIcon,
	ShieldCheckIcon,
	UserRoundIcon,
	UsersIcon,
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
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

export default function MembersPage() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Members</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Workspace collaboration
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Invite teammates, assign roles, and keep access scoped to the AI
						work they need to do.
					</p>
				</div>
				<Button type="button">
					<MailPlusIcon data-icon="inline-start" aria-hidden="true" />
					Invite member
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card size="sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<UsersIcon className="size-4 text-primary" aria-hidden="true" />
							Members
						</CardTitle>
						<CardDescription>Collaborators in this workspace.</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold">0</p>
					</CardContent>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldCheckIcon
								className="size-4 text-primary"
								aria-hidden="true"
							/>
							Roles
						</CardTitle>
						<CardDescription>
							Owner, admin, editor, and viewer scopes.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						<Badge variant="outline">Owner</Badge>
						<Badge variant="outline">Editor</Badge>
					</CardContent>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardTitle>Audit ready</CardTitle>
						<CardDescription>
							Workspace actions are structured for accountable team workflows.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardContent>
					<Empty className="min-h-72 border border-border/70 bg-background/55">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<UserRoundIcon aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>No members yet</EmptyTitle>
							<EmptyDescription>
								Invite team members to collaborate on agents, providers, and
								workspace configuration.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button type="button" size="sm">
								<MailPlusIcon data-icon="inline-start" aria-hidden="true" />
								Invite member
							</Button>
						</EmptyContent>
					</Empty>
				</CardContent>
			</Card>
		</div>
	);
}
