"use client";

import { Link } from "@/i18n/navigation";
import { Loader2, PaperclipIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useRef, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [focused, setFocused] = useState(false);

	// Auto-resize textarea
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const newHeight = Math.min(el.scrollHeight, 160);
		el.style.height = `${newHeight}px`;
	}, [input]);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
			className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3"
		>
			<div className="relative mx-auto w-full min-w-0 max-w-4xl">
				{/* Subtle gradient glow behind composer */}
				<div
					className={cn(
						"absolute -bottom-8 left-1/2 -z-10 h-32 w-3/4 -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-500",
						"bg-gradient-to-r from-primary/5 via-primary/8 to-primary/5",
						focused ? "opacity-100" : "opacity-0",
					)}
				/>

				<div
					className={cn(
						"composer-box rounded-xl sm:rounded-2xl transition-all duration-300",
						focused && "ring-2 ring-primary/15",
					)}
				>
					<div className="flex items-end gap-1.5 p-1.5 sm:gap-2 sm:p-2">
						{/* Attachment button */}
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-8 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary active:scale-95 sm:size-9"
							aria-label="Attach file"
							disabled={sending || !canChat}
						>
							<PaperclipIcon className="size-4" aria-hidden="true" />
						</Button>

						<Textarea
							ref={textareaRef}
							aria-label="Message"
							name="message"
							autoComplete="off"
							value={input}
							onChange={(event) => onInputChange(event.target.value)}
							onFocus={() => setFocused(true)}
							onBlur={() => setFocused(false)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									event.currentTarget.form?.requestSubmit();
								}
							}}
							placeholder={
								canChat
									? "Message your assistant…"
									: "Finish setup before chatting…"
							}
							disabled={sending || !canChat}
							rows={1}
							className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm placeholder:text-muted-foreground/60"
						/>

						<Button
							type="submit"
							size="icon"
							disabled={sending || !input.trim() || !canChat}
							aria-label="Send message"
							className={cn(
								"size-9 shrink-0 rounded-lg shadow-sm transition-all duration-300 active:scale-90 sm:size-10 sm:rounded-xl",
								input.trim() && canChat && !sending
									? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5"
									: "opacity-60",
							)}
						>
							{sending ? (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							) : (
								<SendIcon className="size-4" aria-hidden="true" />
							)}
						</Button>
					</div>
				</div>

				{/* Footer hints */}
				<div className="mt-2 flex items-center justify-between px-1">
					{!canChat ? (
						<p className="text-center text-xs text-muted-foreground/70 animate-in-fade">
							This assistant needs a provider and model.{" "}
							<Link
								href="/agents"
								className="font-medium underline underline-offset-2 transition-colors hover:text-primary"
							>
								Configure assistant
							</Link>
						</p>
					) : (
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
							<SparklesIcon className="size-3" aria-hidden="true" />
							<span>Press Enter to send · Shift+Enter for new line</span>
						</div>
					)}
				</div>
			</div>
		</form>
	);
}
