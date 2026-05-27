"use client";

import Link from "next/link";
import { Loader2, SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
	input: string;
	canChat: boolean;
	sending: boolean;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
}

export function ChatComposer({
	input,
	canChat,
	sending,
	onSubmit,
	onInputChange,
}: ChatComposerProps) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
			className="shrink-0 border-t border-border/40 bg-background/80 p-3 shadow-[0_-16px_50px_-38px_color-mix(in_oklch,var(--foreground)_36%,transparent)] backdrop-blur-xl sm:p-4"
		>
			<div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-2xl shadow-foreground/10 transition-all focus-within:border-ring/70 focus-within:ring-4 focus-within:ring-ring/10">
				<Textarea
					aria-label="Message"
					value={input}
					onChange={(event) => onInputChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					}}
					placeholder={
						canChat ? "Message your assistant" : "Finish setup before chatting"
					}
					disabled={sending || !canChat}
					rows={1}
					className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0"
				/>
				<Button
					type="submit"
					size="icon"
					disabled={sending || !input.trim() || !canChat}
					aria-label="Send message"
					className="size-10 rounded-xl shadow-sm"
				>
					{sending ? (
						<Loader2 className="animate-spin" aria-hidden="true" />
					) : (
						<SendIcon aria-hidden="true" />
					)}
				</Button>
			</div>
			{!canChat ? (
				<p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
					This assistant needs a provider and model.{" "}
					<Link href="/agents" className="underline underline-offset-2">
						Configure assistant
					</Link>
				</p>
			) : null}
		</form>
	);
}
