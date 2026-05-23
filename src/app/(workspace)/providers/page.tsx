import {
	KeyRoundIcon,
	PlusIcon,
	PlugZapIcon,
	ShieldCheckIcon,
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

const providerTypes = ["OpenAI-compatible", "Dragonfly", "Vercel AI Gateway"];

export default function ProvidersPage() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-2">
					<div className="section-kicker">Providers</div>
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Model access, encrypted
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Register AI gateways once, then route agents through the right
						provider without exposing credentials to teammates.
					</p>
				</div>
				<Button type="button">
					<PlusIcon data-icon="inline-start" aria-hidden="true" />
					Add provider
				</Button>
			</div>

			<div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
				<Card>
					<CardHeader className="border-b border-border/70 pb-4">
						<div className="flex items-start justify-between gap-3">
							<div className="flex flex-col gap-1">
								<CardTitle>Provider registry</CardTitle>
								<CardDescription>
									Secure keys, base URLs, and default model mappings.
								</CardDescription>
							</div>
							<Badge variant="secondary">0 configured</Badge>
						</div>
					</CardHeader>
					<CardContent className="pt-5">
						<Empty className="min-h-80 border border-border/70 bg-background/55">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<PlugZapIcon aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>No providers configured</EmptyTitle>
								<EmptyDescription>
									Add an OpenAI-compatible, Dragonfly, or Vercel AI Gateway
									provider to power your agents.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button type="button" size="sm">
									<PlusIcon data-icon="inline-start" aria-hidden="true" />
									Add provider
								</Button>
							</EmptyContent>
						</Empty>
					</CardContent>
				</Card>

				<div className="flex flex-col gap-4">
					<Card size="sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ShieldCheckIcon
									className="size-4 text-primary"
									aria-hidden="true"
								/>
								Secret handling
							</CardTitle>
							<CardDescription>
								Provider credentials are designed to be encrypted and scoped to
								workspace access.
							</CardDescription>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<KeyRoundIcon
									className="size-4 text-primary"
									aria-hidden="true"
								/>
								Supported types
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							{providerTypes.map((type) => (
								<Badge key={type} variant="outline">
									{type}
								</Badge>
							))}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
