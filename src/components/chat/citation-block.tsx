"use client";

import { BookOpenIcon, FileTextIcon, SparklesIcon } from "lucide-react";

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
				"group/citations overflow-hidden rounded-xl border border-border bg-muted/30 transition-colors hover:border-primary/25",
				className,
			)}
		>
			<div className="border-b border-border/50 px-3.5 py-2.5">
				<div className="flex items-center gap-2">
					<div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
						<BookOpenIcon className="size-3" aria-hidden="true" />
					</div>
					<span className="text-xs font-semibold text-foreground">Sources</span>
					<Badge
						variant="secondary"
						className="h-5 rounded-full px-2 text-[11px] font-medium"
					>
						{citations.length}
					</Badge>
				</div>
			</div>

			{/* Citation cards */}
			<ul className="flex flex-col gap-0.5 p-2">
				{citations.map((citation, index) => {
					const rawRelevance = Number.isFinite(citation.score)
						? Math.round(citation.score * 100)
						: 0;
					const relevancePct = Math.min(100, Math.max(0, rawRelevance));
					const relevanceColor =
						relevancePct > 70
							? "bg-success"
							: relevancePct > 40
								? "bg-primary"
								: "bg-muted-foreground";

					return (
						<li
							key={citation.chunkId}
							className="group/card rounded-lg border border-transparent bg-background/50 p-3 transition-all duration-200 hover:border-border/50 hover:bg-background/80 hover:shadow-sm"
							style={{ animationDelay: `${index * 0.05}s` }}
						>
							{/* Title row */}
							<div className="mb-1.5 flex items-start justify-between gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5">
										<FileTextIcon
											className="size-3 text-muted-foreground/60"
											aria-hidden="true"
										/>
										<span className="truncate text-[13px] font-semibold text-foreground">
											{citation.documentTitle}
										</span>
									</div>
									{citation.knowledgeBaseName ? (
										<Badge
											variant="outline"
											className="mt-1 rounded-md border-primary/20 bg-primary/5 px-1.5 py-0 text-[10px] font-medium text-primary"
										>
											{citation.knowledgeBaseName}
										</Badge>
									) : null}
								</div>

								{/* Relevance indicator */}
								<div className="shrink-0 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
									<div className="flex items-center gap-0.5">
										<SparklesIcon className="size-2.5" aria-hidden="true" />
										<span>{relevancePct}%</span>
									</div>
									<div className="h-1 w-8 overflow-hidden rounded-full bg-muted">
										<div
											className={cn("h-full rounded-full", relevanceColor)}
											style={{ width: `${relevancePct}%` }}
										/>
									</div>
								</div>
							</div>

							{/* Content preview */}
							<p className="line-clamp-2 text-xs leading-5 text-muted-foreground/80 group-hover/card:text-muted-foreground transition-colors">
								{citation.content}
							</p>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
