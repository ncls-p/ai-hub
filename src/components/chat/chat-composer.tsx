"use client";

import { Link } from "@/i18n/navigation";
import {
	Loader2Icon,
	PaperclipIcon,
	SendIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface QueuedChatMessage {
	id: string;
	content: string;
}

interface ChatComposerProps {
	input: string;
	canChat: boolean;
	sending: boolean;
	queuedMessages?: QueuedChatMessage[];
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onStop?: () => void;
	onQueuedMessageChange?: (id: string, content: string) => void;
	onQueuedMessageCancel?: (id: string) => void;
	onUploadCodeWorkspace?: (file: File) => Promise<void>;
}

export function ChatComposer({
	input,
	canChat,
	sending,
	queuedMessages = [],
	onSubmit,
	onInputChange,
	onStop,
	onQueuedMessageChange,
	onQueuedMessageCancel,
	onUploadCodeWorkspace,
}: ChatComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploadingWorkspace, setUploadingWorkspace] = useState(false);

	// Auto-resize textarea
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const newHeight = Math.min(el.scrollHeight, 160);
		el.style.height = `${newHeight}px`;
	}, [input]);

	async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !onUploadCodeWorkspace) return;
		setUploadingWorkspace(true);
		try {
			await onUploadCodeWorkspace(file);
		} finally {
			setUploadingWorkspace(false);
		}
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
			className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3"
		>
			{queuedMessages.length > 0 ? (
				<div className="mx-auto mb-2 flex w-full max-w-4xl flex-col gap-2">
					{queuedMessages.map((message, index) => (
						<div key={message.id} className="rounded-xl border bg-card p-2">
							<div className="mb-1.5 flex items-center justify-between gap-2 px-1">
								<span className="text-[11px] font-medium text-muted-foreground">
									Queued message {index + 1}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6 rounded-md text-muted-foreground hover:text-foreground"
									aria-label="Cancel queued message"
									onClick={() => onQueuedMessageCancel?.(message.id)}
								>
									<XIcon className="size-3.5" aria-hidden="true" />
								</Button>
							</div>
							<Textarea
								aria-label={`Queued message ${index + 1}`}
								value={message.content}
								onChange={(event) =>
									onQueuedMessageChange?.(message.id, event.target.value)
								}
								rows={1}
								className="max-h-28 min-h-9 resize-none text-sm shadow-none"
							/>
						</div>
					))}
				</div>
			) : null}
			<div className="relative mx-auto w-full min-w-0 max-w-4xl">
				<div className={cn("composer-box rounded-xl sm:rounded-2xl")}>
					<div className="flex items-end gap-1.5 p-1.5 sm:gap-2 sm:p-2">
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,application/zip,application/x-zip-compressed"
							className="hidden"
							onChange={(event) => void handleFileChange(event)}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9"
							aria-label="Upload ZIP code workspace"
							disabled={uploadingWorkspace || sending || !canChat}
							onClick={() => fileInputRef.current?.click()}
						>
							{uploadingWorkspace ? (
								<Loader2Icon
									className="size-4 animate-spin"
									aria-hidden="true"
								/>
							) : (
								<PaperclipIcon className="size-4" aria-hidden="true" />
							)}
						</Button>

						<Textarea
							ref={textareaRef}
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
								canChat
									? sending
										? "Queue your next message…"
										: "Message your assistant…"
									: "Finish setup before chatting…"
							}
							disabled={!canChat}
							rows={1}
							className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm placeholder:text-muted-foreground"
						/>

						<Button
							type="submit"
							size="icon"
							disabled={!input.trim() || !canChat}
							aria-label={sending ? "Queue message" : "Send message"}
							className={cn(
								"size-9 shrink-0 rounded-lg transition-colors sm:size-10 sm:rounded-xl",
								input.trim() && canChat
									? "bg-primary text-primary-foreground hover:bg-primary/90"
									: "opacity-60",
							)}
						>
							<SendIcon className="size-4" aria-hidden="true" />
						</Button>

						{sending ? (
							<Button
								type="button"
								size="icon"
								aria-label="Stop generation"
								className="size-9 shrink-0 rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 sm:size-10 sm:rounded-xl"
								onClick={onStop}
							>
								<SquareIcon
									className="size-3.5 fill-current"
									aria-hidden="true"
								/>
							</Button>
						) : null}
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
						<p className="text-[11px] text-muted-foreground">
							{sending
								? "Enter queues the next message · Shift+Enter adds a line"
								: "Enter sends · Shift+Enter adds a line"}
						</p>
					)}
				</div>
			</div>
		</form>
	);
}
