"use client";

import { BookOpenIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ChatCitation } from "@/components/chat/chat-types";
import { cn } from "@/lib/utils";

interface CitationBlockProps {
	citations: ChatCitation[];
	className?: string;
}

export function CitationBlock({ citations, className }: CitationBlockProps) {
	if (citations.length === 0) return null;

	return (
		<div
			className={cn(
				"rounded-xl border border-border/70 bg-muted/30 px-3 py-2",
				className,
			)}
		>
			<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<BookOpenIcon className="size-3.5" aria-hidden="true" />
				Sources ({citations.length})
			</div>
			<ul className="flex flex-col gap-2">
				{citations.map((citation) => (
					<li
						key={citation.chunkId}
						className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2 text-xs"
					>
						<div className="mb-1 flex flex-wrap items-center gap-2">
							<span className="font-medium text-foreground">
								{citation.documentTitle}
							</span>
							{citation.knowledgeBaseName ? (
								<Badge variant="outline" className="text-[10px]">
									{citation.knowledgeBaseName}
								</Badge>
							) : null}
						</div>
						<p className="line-clamp-3 leading-5 text-muted-foreground">
							{citation.content}
						</p>
					</li>
				))}
			</ul>
		</div>
	);
}
