import { Loader2, MessageSquareIcon, PlusIcon } from "lucide-react";

import { ModelLogo } from "@/components/providers/model-logo";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import type {
	ChatAgent,
	ChatConversation,
	CodeWorkspaceArtifact,
} from "@/components/chat/chat-types";
import {
	CHAT_INTERFACE_MODE,
	CODING_INTERFACE_MODE,
	type InterfaceMode,
} from "./chat-page-helpers";

type ChatTranslator = (key: string, values?: Record<string, string>) => string;

export function ChatPageLoading() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4">
			<div className="flex size-12 items-center justify-center rounded-full border bg-card">
				<Loader2
					className="size-5 animate-spin text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
			<div className="flex flex-col items-center gap-1 text-sm">
				<span className="font-medium text-foreground">Loading</span>
				<span className="text-xs text-muted-foreground">
					Fetching your assistants and conversations…
				</span>
			</div>
		</div>
	);
}

export function NoAssistantsState({
	canRunSetup,
	t,
}: {
	canRunSetup: boolean;
	t: ChatTranslator;
}) {
	return (
		<div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center px-4 animate-in-fade">
			<Empty className="min-h-80 w-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MessageSquareIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{t("noAssistants")}</EmptyTitle>
					<EmptyDescription>{t("noAssistantsDescription")}</EmptyDescription>
				</EmptyHeader>
				{canRunSetup ? (
					<div className="flex justify-center">
						<Button asChild>
							<Link href="/setup">
								<PlusIcon className="size-4" aria-hidden="true" />
								{t("finishSetup")}
							</Link>
						</Button>
					</div>
				) : null}
			</Empty>
		</div>
	);
}

export function CodeWorkspaceModeBar({
	artifact,
	interfaceMode,
	onModeChange,
}: {
	artifact: CodeWorkspaceArtifact;
	interfaceMode: InterfaceMode;
	onModeChange: (mode: InterfaceMode) => void;
}) {
	return (
		<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-3 py-2 sm:px-4">
			<div className="min-w-0">
				<p className="truncate text-sm font-medium text-foreground">
					{artifact.title}
				</p>
				<p className="text-xs text-muted-foreground">
					Code workspace · v{artifact.version}
				</p>
			</div>
			<div className="flex shrink-0 items-center rounded-lg border bg-muted/30 p-0.5">
				<Button
					type="button"
					variant={
						interfaceMode === CHAT_INTERFACE_MODE ? "secondary" : "ghost"
					}
					size="sm"
					className="h-7 px-3 text-xs"
					onClick={() => onModeChange(CHAT_INTERFACE_MODE)}
				>
					Chat
				</Button>
				<Button
					type="button"
					variant={
						interfaceMode === CODING_INTERFACE_MODE ? "secondary" : "ghost"
					}
					size="sm"
					className="h-7 px-3 text-xs"
					onClick={() => onModeChange(CODING_INTERFACE_MODE)}
				>
					Coding
				</Button>
			</div>
		</div>
	);
}

export function EmptyConversationState({
	canChat,
	selectedAgent,
	conversations,
	emptyPromptSuggestions,
	onSelectConversation,
	onSubmitSuggestion,
	t,
}: {
	canChat: boolean;
	selectedAgent: ChatAgent | null;
	conversations: ChatConversation[];
	emptyPromptSuggestions: string[];
	onSelectConversation: (conversationId: string) => void;
	onSubmitSuggestion: (suggestion: string) => void;
	t: ChatTranslator;
}) {
	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 sm:py-16 animate-in-fade">
			<div className="relative flex w-full flex-col items-center gap-5">
				<div className="flex max-w-xl flex-col items-center text-center">
					{selectedAgent ? (
						<ModelLogo
							logoUrl={selectedAgent.logoUrl}
							label={selectedAgent.name}
							size="lg"
							imageFit="cover"
							className="mb-4 rounded-full"
						/>
					) : null}
					<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
						{canChat
							? selectedAgent
								? t("emptyTitleNamed", { name: selectedAgent.name })
								: t("emptyTitle")
							: t("finishSetup")}
					</h2>
					<p className="mt-2 max-w-sm text-sm text-muted-foreground">
						{canChat
							? selectedAgent?.description || t("emptyDescription")
							: t("emptySetup")}
					</p>
				</div>

				{canChat && (conversations[0] || emptyPromptSuggestions.length > 0) ? (
					<div className="flex flex-wrap justify-center gap-2">
						{conversations[0] ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => onSelectConversation(conversations[0].id)}
							>
								{t("continueLast")}
							</Button>
						) : null}
						{emptyPromptSuggestions.map((suggestion) => (
							<Button
								key={suggestion}
								type="button"
								variant="outline"
								onClick={() => onSubmitSuggestion(suggestion)}
							>
								{suggestion}
							</Button>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
