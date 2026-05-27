"use client";

import Link from "next/link";
import { Loader2, MessageSquareIcon, SendIcon } from "lucide-react";

import { ChatSidebarEmptyLinks } from "@/components/chat/chat-sidebar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
	input: string;
	canChat: boolean;
	sending: boolean;
	hasMessages: boolean;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
}

export function ChatComposer({
	input,
	canChat,
	sending,
	hasMessages,
	onSubmit,
	onInputChange,
}: ChatComposerProps) {
	return (
		<>
			{!hasMessages ? (
				<div className="mx-auto mb-3 w-full max-w-3xl px-4">
					<Card className="border-dashed bg-card/55">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<MessageSquareIcon aria-hidden="true" />
								Start a new conversation
							</CardTitle>
							<CardDescription>
								Messages are streamed live and stored encrypted in the workspace
								database.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<div className="flex flex-wrap gap-2">
								{[
									"Draft a system prompt",
									"Compare model options",
									"Write a support reply",
								].map((prompt) => (
									<Button
										key={prompt}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onInputChange(prompt)}
									>
										{prompt}
									</Button>
								))}
							</div>
							<ChatSidebarEmptyLinks />
						</CardContent>
					</Card>
				</div>
			) : null}

			<form
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit();
				}}
				className="shrink-0 border-t border-border/70 p-3 sm:p-4"
			>
				<div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-border/70 bg-card/90 p-2 shadow-lg shadow-foreground/5">
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
							canChat
								? "Message your agent"
								: "Configure this agent before chatting"
						}
						disabled={sending || !canChat}
						rows={1}
						className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
					/>
					<Button
						type="submit"
						size="icon"
						disabled={sending || !input.trim() || !canChat}
						aria-label="Send message"
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
						This agent needs a provider and model.{" "}
						<Link href="/agents" className="underline underline-offset-2">
							Configure agent
						</Link>
					</p>
				) : null}
			</form>
		</>
	);
}
