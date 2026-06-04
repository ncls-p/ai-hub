import { Link } from "@/i18n/navigation";
import { BookOpenIcon, PlusIcon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";

import type { KnowledgeBase } from "./types";
import { InfoCallout, Toolbar } from "./shared";

export function KnowledgeTab({
	knowledgeBases,
	selectedKnowledgeIds,
	setSelectedKnowledgeIds,
	knowledgeSearch,
	setKnowledgeSearch,
	saving,
	onSave,
}: {
	knowledgeBases: KnowledgeBase[];
	selectedKnowledgeIds: string[];
	setSelectedKnowledgeIds: (fn: (prev: string[]) => string[]) => void;
	knowledgeSearch: string;
	setKnowledgeSearch: (v: string) => void;
	saving: boolean;
	onSave: () => void;
}) {
	const filteredKnowledgeBases = knowledgeBases.filter((kb) => {
		if (!knowledgeSearch.trim()) return true;
		return kb.name.toLowerCase().includes(knowledgeSearch.toLowerCase());
	});

	return (
		<div className="space-y-4">
			<InfoCallout title="About knowledge bases" icon={BookOpenIcon}>
				Knowledge bases give your assistant access to reference material. When
				enabled, the assistant searches bound knowledge bases during
				conversations and cites relevant passages. Create knowledge bases in the
				Knowledge section and bind them here.
			</InfoCallout>

			<Toolbar
				searchValue={knowledgeSearch}
				onSearchChange={setKnowledgeSearch}
				filterValue="all"
				onFilterChange={() => {}}
				filterOptions={[{ value: "all", label: "All bases" }]}
				addButton={
					knowledgeBases.length > 0 && (
						<Button variant="outline" size="sm" asChild>
							<Link href="/knowledge">
								<PlusIcon className="size-4" aria-hidden="true" />
								New knowledge base
							</Link>
						</Button>
					)
				}
			/>

			<Card className="hover-lift animate-in-up stagger-3">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BookOpenIcon className="size-5" aria-hidden="true" />
						Knowledge Bases
					</CardTitle>
					<CardDescription>
						Select knowledge bases to search during chat.
						{selectedKnowledgeIds.length > 0 && (
							<span className="ml-1">
								({selectedKnowledgeIds.length} bound)
							</span>
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{filteredKnowledgeBases.length === 0 ? (
						<div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
							<BookOpenIcon
								className="mx-auto size-8 text-muted-foreground/50"
								aria-hidden="true"
							/>
							<p className="mt-2 text-sm font-medium">
								{knowledgeBases.length === 0
									? "No knowledge bases yet"
									: "No knowledge bases match your search"}
							</p>
							{knowledgeBases.length === 0 && (
								<>
									<p className="mt-1 text-sm text-muted-foreground">
										Create a knowledge base to give your assistant reference
										material it can cite in conversations.
									</p>
									<Button variant="outline" size="sm" asChild className="mt-3">
										<Link href="/knowledge">Create knowledge base</Link>
									</Button>
								</>
							)}
						</div>
					) : (
						filteredKnowledgeBases.map((kb, idx) => (
							<label
								key={kb.id}
								className={cn(
									"ui-list-row flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all hover:border-primary/25 hover:bg-card/65 hover:shadow-sm",
									selectedKnowledgeIds.includes(kb.id)
										? "border-primary/30 bg-primary/5"
										: "border-border/60",
									`animate-in-up stagger-${Math.min(idx + 4, 6)}`,
								)}
							>
								<div className="flex items-center gap-3">
									<div
										className={cn(
											"flex size-8 items-center justify-center rounded-lg",
											selectedKnowledgeIds.includes(kb.id)
												? "bg-primary/10 text-primary"
												: "bg-muted text-muted-foreground",
										)}
									>
										<BookOpenIcon className="size-4" aria-hidden="true" />
									</div>
									<span className="font-medium">{kb.name}</span>
								</div>
								<Switch
									checked={selectedKnowledgeIds.includes(kb.id)}
									onCheckedChange={(checked) =>
										setSelectedKnowledgeIds((current) =>
											checked
												? [...current, kb.id]
												: current.filter((id) => id !== kb.id),
										)
									}
								/>
							</label>
						))
					)}
				</CardContent>
				<CardFooter className="justify-end">
					<Button onClick={onSave} disabled={saving} className="shimmer">
						{saving ? (
							<Spinner data-icon="inline-start" />
						) : (
							<SaveIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Save knowledge
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
