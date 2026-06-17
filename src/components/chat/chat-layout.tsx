"use client";

import { Link } from "@/i18n/navigation";
import { useState, useSyncExternalStore, type ComponentProps } from "react";
import {
  MessageSquarePlusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings2Icon,
} from "lucide-react";

import { useWorkspaceShell } from "@/components/app-shell";
import { AppHeader } from "@/components/app-header";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import type {
	ChatAgent,
	ChatConversation,
	ChatConversationFolder,
} from "@/components/chat/chat-types";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HISTORY_OPEN_STORAGE_KEY = "chat-unified-sidebar-open";
const HISTORY_OPEN_STORAGE_EVENT = "chat-unified-sidebar-open-change";
const HISTORY_WIDTH_STORAGE_KEY = "chat-unified-sidebar-width";
const HISTORY_WIDTH_STORAGE_EVENT = "chat-unified-sidebar-width-change";
const DEFAULT_HISTORY_OPEN = true;
const DEFAULT_HISTORY_WIDTH = 320;
const MIN_HISTORY_WIDTH = 260;
const MAX_HISTORY_WIDTH = 480;

function clampHistoryWidth(value: number) {
  return Math.min(
    MAX_HISTORY_WIDTH,
    Math.max(MIN_HISTORY_WIDTH, Math.round(value)),
  );
}

function subscribeHistoryOpen(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(HISTORY_OPEN_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HISTORY_OPEN_STORAGE_EVENT, callback);
  };
}

function getStoredHistoryOpen(): boolean {
  const stored = window.localStorage.getItem(HISTORY_OPEN_STORAGE_KEY);
  if (stored === null) return DEFAULT_HISTORY_OPEN;
  return stored === "true";
}

function setStoredHistoryOpen({ open }: { open: boolean }) {
  window.localStorage.setItem(HISTORY_OPEN_STORAGE_KEY, String(open));
  window.dispatchEvent(new Event(HISTORY_OPEN_STORAGE_EVENT));
}

function subscribeHistoryWidth(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(HISTORY_WIDTH_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HISTORY_WIDTH_STORAGE_EVENT, callback);
  };
}

function getStoredHistoryWidth(): number {
  const stored = window.localStorage.getItem(HISTORY_WIDTH_STORAGE_KEY);
  const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_HISTORY_WIDTH;
  return Number.isFinite(parsed)
    ? clampHistoryWidth(parsed)
    : DEFAULT_HISTORY_WIDTH;
}

function setStoredHistoryWidth(width: number) {
  window.localStorage.setItem(
    HISTORY_WIDTH_STORAGE_KEY,
    String(clampHistoryWidth(width)),
  );
  window.dispatchEvent(new Event(HISTORY_WIDTH_STORAGE_EVENT));
}

type ChatSidebarCollapsedChangeHandler = NonNullable<
  ComponentProps<typeof ChatSidebar>["onCollapsedChange"]
>;

interface ChatLayoutProps {
  agents: ChatAgent[];
  conversations: ChatConversation[];
  conversationFolders: ChatConversationFolder[];
  selectedAgent: ChatAgent | null;
  selectedAgentId: string | null;
  activeConversationId: string | null;
  canChat: boolean;
  loadingSidebar?: boolean;
  onSelectAgent: (agentId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onCreateConversationFolder?: (name: string) => void;
  onRenameConversationFolder?: (folderId: string, name: string) => void;
  onDeleteConversationFolder?: (folderId: string) => void;
  onToggleConversationPin?: (conversationId: string, pinned: boolean) => void;
  onReorderConversations?: (input: {
    conversationIds: string[];
    folderId: string | null;
    pinned?: boolean;
  }) => void;
  hasMoreConversations?: boolean;
  loadingMoreConversations?: boolean;
  onLoadMoreConversations?: () => void;
  onSetupComplete?: () => void;
  children: React.ReactNode;
}

export function ChatLayout({
  agents,
  conversations,
  conversationFolders,
  selectedAgentId,
  activeConversationId,
  canChat,
  loadingSidebar,
  onSelectAgent,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onCreateConversationFolder,
  onRenameConversationFolder,
  onDeleteConversationFolder,
  onToggleConversationPin,
  onReorderConversations,
  hasMoreConversations,
  loadingMoreConversations,
  onLoadMoreConversations,
  onSetupComplete,
  children,
}: ChatLayoutProps) {
  const shell = useWorkspaceShell();
  const [setupOpen, setSetupOpen] = useState(false);
  const sidebarOpen = useSyncExternalStore(
    subscribeHistoryOpen,
    getStoredHistoryOpen,
    () => DEFAULT_HISTORY_OPEN,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const sidebarWidth = useSyncExternalStore(
    subscribeHistoryWidth,
    getStoredHistoryWidth,
    () => DEFAULT_HISTORY_WIDTH,
  );

  function updateSidebarOpen({ open }: { open: boolean }) {
    setStoredHistoryOpen({ open });
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    setResizingSidebar(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setStoredHistoryWidth(startWidth + moveEvent.clientX - startX);
    }

    function onPointerUp() {
      setResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function adjustSidebarWidth(delta: number) {
    setStoredHistoryWidth(sidebarWidth + delta);
  }

  const sidebarProps = {
    agents,
    conversations,
    conversationFolders,
    activeConversationId,
    loading: loadingSidebar,
    onSelectConversation,
    onNewConversation,
    onRenameConversation,
    onDeleteConversation,
    onCreateConversationFolder,
    onRenameConversationFolder,
    onDeleteConversationFolder,
    onToggleConversationPin,
    onReorderConversations,
    hasMoreConversations,
    loadingMoreConversations,
    onLoadMoreConversations,
    collapsed: false,
    onCollapsedChange: undefined,
    shell,
    showThemeToggle: true,
  };
  const handleDesktopSidebarCollapsedChange = ((collapsed) => {
    updateSidebarOpen({ open: !collapsed });
  }) satisfies ChatSidebarCollapsedChangeHandler;
  const desktopSidebarProps = {
    ...sidebarProps,
    onCollapsedChange: handleDesktopSidebarCollapsedChange,
  };
  const mobileSidebarProps = {
    ...sidebarProps,
    onSelectConversation: (conversationId: string) => {
      onSelectConversation(conversationId);
      setMobileSidebarOpen(false);
    },
  };

  const agentSelector = (
    <div className="flex items-center gap-2">
      <Select
        value={selectedAgentId ?? undefined}
        onValueChange={onSelectAgent}
      >
        <SelectTrigger
          size="sm"
          className="h-8 min-w-0 max-w-[min(100%,11rem)] flex-1 px-3 font-medium sm:max-w-60 sm:min-w-48"
          aria-label="Current assistant"
        >
          <SelectValue placeholder="Choose assistant" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {!canChat ? (
        <Badge
          variant="outline"
          className="hidden shrink-0 items-center gap-1 rounded-lg border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning sm:inline-flex"
        >
          <Settings2Icon className="size-3" aria-hidden="true" />
          needs setup
        </Badge>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Desktop sidebar with smooth transition */}
      <div
        className={cn(
          "hidden ease-[cubic-bezier(0.4,0,0.2,1)] md:block",
          !resizingSidebar && "transition-all duration-300",
        )}
        style={{
          width: sidebarOpen ? `${sidebarWidth}px` : 0,
          opacity: sidebarOpen ? 1 : 0,
        }}
      >
        {sidebarOpen && (
          <aside className="relative h-full w-full rounded-none border-r bg-sidebar">
            <ChatSidebar {...desktopSidebarProps} className="w-full" />
            <div
              role="separator"
              aria-label="Resize conversations"
              aria-orientation="vertical"
              aria-valuemin={MIN_HISTORY_WIDTH}
              aria-valuemax={MAX_HISTORY_WIDTH}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              className="group absolute inset-y-0 right-0 z-20 w-2 translate-x-1 cursor-col-resize outline-none"
              onPointerDown={startSidebarResize}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") adjustSidebarWidth(-12);
                if (event.key === "ArrowRight") adjustSidebarWidth(12);
              }}
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60" />
            </div>
          </aside>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader
          className="px-2 sm:px-4"
          leading={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden size-8 rounded-lg md:inline-flex"
                aria-label={
                  sidebarOpen ? "Close conversations" : "Open conversations"
                }
                onClick={() => updateSidebarOpen({ open: !sidebarOpen })}
              >
                {sidebarOpen ? (
                  <PanelLeftCloseIcon className="size-4" aria-hidden="true" />
                ) : (
                  <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Sheet
                open={mobileSidebarOpen}
                onOpenChange={setMobileSidebarOpen}
              >
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg md:hidden"
                    aria-label="Open conversations"
                  >
                    <PanelLeftOpenIcon className="size-4" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[min(100vw-2rem,22rem)] p-0"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Conversations</SheetTitle>
                  </SheetHeader>
                  <ChatSidebar {...mobileSidebarProps} />
                </SheetContent>
              </Sheet>
            </>
          }
          center={agentSelector}
          actions={
            <div className="flex items-center gap-1">
              {!sidebarOpen ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hidden h-8 gap-1.5 rounded-lg px-3 text-xs font-medium sm:inline-flex"
                  aria-label="New conversation"
                  onClick={onNewConversation}
                >
                  <MessageSquarePlusIcon
                    className="size-3.5"
                    aria-hidden="true"
                  />
                  New chat
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 rounded-lg sm:hidden"
                aria-label="New conversation"
                onClick={onNewConversation}
              >
                <MessageSquarePlusIcon className="size-4" aria-hidden="true" />
              </Button>
              {!canChat ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium"
                  onClick={() => setSetupOpen(true)}
                >
                  <Settings2Icon className="size-3.5" aria-hidden="true" />
                  Finish setup
                </Button>
              ) : null}
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                aria-label="Configure assistant"
              >
                <Link
                  href={
                    selectedAgentId ? `/agents/${selectedAgentId}` : "/agents"
                  }
                >
                  <Settings2Icon className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          }
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Finish assistant setup</DialogTitle>
            <DialogDescription>
              Connect a model so you can start chatting.
            </DialogDescription>
          </DialogHeader>
          <SetupWizard
            mode="dialog"
            initialAgentId={selectedAgentId}
            onCancel={() => setSetupOpen(false)}
            onComplete={() => {
              setSetupOpen(false);
              onSetupComplete?.();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
