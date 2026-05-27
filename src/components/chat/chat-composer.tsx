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
			className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3"
		>
			<div className="mx-auto flex w-full min-w-0 max-w-4xl items-end gap-1.5 rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-2xl shadow-foreground/10 transition-[background-color,border-color,box-shadow] focus-within:border-ring/70 focus-within:ring-4 focus-within:ring-ring/10 sm:gap-2 sm:rounded-2xl sm:p-2">
				<Textarea
					aria-label="Message"
					name="message"
					autoComplete="off"
					value={input}
					onChange={(event) => onInputChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					}}
					placeholder={
						canChat ? "Message your assistant…" : "Finish setup before chatting…"
					}
					disabled={sending || !canChat}
					rows={1}
					className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:max-h-40 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm"
				/>
				<Button
					type="submit"
					size="icon"
					disabled={sending || !input.trim() || !canChat}
					aria-label="Send message"
					className="size-9 shrink-0 rounded-lg shadow-sm sm:size-10 sm:rounded-xl"
				>
					{sending ? (
						<Loader2 className="animate-spin" aria-hidden="true" />
					) : (
						<SendIcon aria-hidden="true" />
					)}
				</Button>
			</div>
			{!canChat ? (
				<p className="mx-auto mt-2 max-w-4xl px-1 text-center text-xs text-muted-foreground">
					This assistant needs a provider and model.{" "}
					<Link href="/agents" className="underline underline-offset-2">
						Configure assistant
					</Link>
				</p>
			) : null}
		</form>
	);
}
