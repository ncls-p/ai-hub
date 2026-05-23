import Link from "next/link";
import {
	BotIcon,
	BoxesIcon,
	ChevronDownIcon,
	PaperclipIcon,
	SendIcon,
	SparklesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const suggestions = [
	{
		title: "Create an agent",
		prompt: "Help me design a support agent with tools and guardrails.",
	},
	{
		title: "Pick a provider",
		prompt: "Compare providers for a fast coding assistant.",
	},
	{
		title: "Plan RAG",
		prompt: "Design a knowledge base workflow for team documents.",
	},
	{
		title: "Write a system prompt",
		prompt: "Draft a precise system prompt for an internal ops agent.",
	},
];

export default function ChatPage() {
	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<header className="hidden h-14 shrink-0 items-center justify-between px-4 lg:flex">
				<Button
					variant="ghost"
					size="sm"
					className="rounded-xl text-muted-foreground"
				>
					AI Hub
					<ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
				</Button>
				<Button asChild variant="outline" size="sm" className="rounded-full">
					<Link href="/agents">
						<BotIcon data-icon="inline-start" aria-hidden="true" />
						Agents
					</Link>
				</Button>
			</header>

			<section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-8 text-center">
				<div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_18px_50px_-24px_color-mix(in_oklch,var(--primary)_70%,transparent)]">
					<SparklesIcon className="size-5" aria-hidden="true" />
				</div>
				<h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
					What are we building today?
				</h1>
				<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
					AI Hub is centered around chat. Ask, design agents, compare providers,
					and shape your workspace from one simple conversation surface.
				</p>

				<div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
					{suggestions.map((item) => (
						<button
							key={item.title}
							type="button"
							disabled
							className="rounded-2xl border border-border/70 bg-card/65 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-85 enabled:hover:border-primary/35 enabled:hover:bg-card"
						>
							<span className="block text-sm font-semibold text-foreground">
								{item.title}
							</span>
							<span className="mt-1 block text-sm leading-5 text-muted-foreground">
								{item.prompt}
							</span>
						</button>
					))}
				</div>
			</section>

			<div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 sm:px-4 sm:pb-6">
				<div className="rounded-[1.65rem] border border-border/70 bg-card/90 p-2 shadow-[0_22px_70px_-45px_color-mix(in_oklch,var(--foreground)_45%,transparent)] backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							disabled
							aria-label="Attach file"
						>
							<PaperclipIcon aria-hidden="true" />
						</Button>
						<Input
							aria-label="Message"
							placeholder="Message AI Hub"
							disabled
							className="h-12 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 md:text-sm"
						/>
						<Button
							type="button"
							size="icon"
							disabled
							aria-label="Send message"
						>
							<SendIcon aria-hidden="true" />
						</Button>
					</div>
					<div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1.5">
							<BoxesIcon className="size-3" aria-hidden="true" />
							Select or create an agent to enable live chat.
						</span>
						<Link
							href="/providers"
							className="hidden hover:text-foreground sm:inline"
						>
							Configure providers
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
