import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
} from "@xyflow/react";
import { createPortal } from "react-dom";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { WorkflowAgenticPanel } from "./workflow-agentic-panel";
import { nodeTypes } from "./workflow-builder.node-types";
import type { useWorkflowBuilderController } from "./workflow-builder.workflow-builder";
import { useWorkflowConfigurationRenderer } from "./workflow-builder.workflow-builder.view.configuration-renderer";
import { useWorkflowPaletteRenderer } from "./workflow-builder.workflow-builder.view.palette-renderer";
import { useWorkflowRunsRenderer } from "./workflow-builder.workflow-builder.view.runs-renderer";
import { WorkflowBuilderSection1 } from "./workflow-builder.workflow-builder.view.section-1";
import { WorkflowBuilderSection2 } from "./workflow-builder.workflow-builder.view.section-2";
import { WorkflowBuilderRunSheet } from "./workflow-builder.run-sheet";
import { type WorkflowCanvasNodeType } from "./workflow-canvas-node";

export type WorkflowBuilderViewModel = Extract<
  ReturnType<typeof useWorkflowBuilderController>,
  { kind: "ready" }
>;
export function WorkflowBuilderView({
  model,
}: {
  model: WorkflowBuilderViewModel;
}) {
  const {
    agenticAbortRef,
    agenticActivities,
    agenticAgentName,
    agenticHistoryLoading,
    agenticInput,
    agenticMessages,
    agenticPendingRequests,
    agenticRunRequests,
    agenticRunning,
    agenticTodoList,
    decideAgenticRunRequest,
    decidingAgenticRunRequestId,
    edges,
    editorMode,
    inspectorOpen,
    isDesktop,
    isFullscreen,
    nodes,
    onConnect,
    onEdgesChange,
    onNodesChange,
    paletteOpen,
    runAgenticBuilder,
    selectedNodeId,
    setAgenticInput,
    setFlow,
    setInspectorOpen,
    setPaletteOpen,
    setSelectedNodeId,
    submitAgenticRequest,
    submittingAgenticRequestId,
    t,
  } = model;

  const renderPalette = useWorkflowPaletteRenderer(model);
  const renderConfiguration = useWorkflowConfigurationRenderer(model);
  const renderRuns = useWorkflowRunsRenderer(model);

  function renderInspector(suffix: string) {
    return (
      <Tabs defaultValue="configuration" className="h-full min-h-0 gap-0">
        <TabsList variant="line" className="mx-4 mt-3 w-[calc(100%-2rem)]">
          <TabsTrigger value="configuration">{t("configuration")}</TabsTrigger>
          <TabsTrigger value="runs">{t("runs")}</TabsTrigger>
        </TabsList>
        <TabsContent value="configuration" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {renderConfiguration(suffix)}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="runs" className="min-h-0 flex-1">
          <ScrollArea className="h-full">{renderRuns()}</ScrollArea>
        </TabsContent>
      </Tabs>
    );
  }

  const canvas = (
    <main
      className={cn(
        "relative h-full bg-muted/10",
        editorMode === "visual" ? "min-h-[28rem] sm:min-h-[34rem]" : "min-h-0",
      )}
    >
      <ReactFlow<WorkflowCanvasNodeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedNodeId(node.id);
          if (
            editorMode === "agentic" ||
            !window.matchMedia("(min-width: 1024px)").matches
          ) {
            setInspectorOpen(true);
          }
        }}
        onNodesDelete={(deleted) => {
          if (deleted.some((node) => node.id === selectedNodeId))
            setSelectedNodeId(null);
        }}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable
        nodesConnectable
        edgesReconnectable
        elementsSelectable
        deleteKeyCode={["Backspace", "Delete"]}
        snapToGrid
        snapGrid={[16, 16]}
        panOnScroll
        selectionOnDrag
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          className="!border !border-border/70 !bg-card max-sm:!hidden"
          nodeColor="var(--foreground)"
          maskColor="color-mix(in oklab, var(--background) 75%, transparent)"
        />
      </ReactFlow>
      <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur sm:block">
        {editorMode === "agentic"
          ? t("agentic.canvasEditHint")
          : t("canvasHint")}
      </div>
    </main>
  );

  const builder = (
    <div
      data-workflow-builder
      className={cn(
        "flex h-[calc(100dvh-10rem)] min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-[var(--surface-shadow)]",
        isFullscreen &&
          "fixed inset-0 z-50 h-dvh min-h-0 rounded-none border-0",
      )}
    >
      <WorkflowBuilderSection2 model={model} />

      {editorMode === "agentic" ? (
        isDesktop ? (
          <div className="min-h-0 flex-1">
            <ResizablePanelGroup key={editorMode} orientation="horizontal">
              <ResizablePanel
                id="workflow-agentic-chat"
                defaultSize="36%"
                minSize="28%"
                maxSize="48%"
              >
                <WorkflowAgenticPanel
                  messages={agenticMessages}
                  activities={agenticActivities}
                  pendingRequests={agenticPendingRequests}
                  runRequests={agenticRunRequests}
                  todoList={agenticTodoList}
                  input={agenticInput}
                  running={agenticRunning}
                  historyLoading={agenticHistoryLoading}
                  submittingRequestId={submittingAgenticRequestId}
                  decidingRunRequestId={decidingAgenticRunRequestId}
                  agentName={agenticAgentName}
                  onInputChange={setAgenticInput}
                  onSubmit={(prompt) => void runAgenticBuilder(prompt)}
                  onSubmitRequest={(request, values) =>
                    void submitAgenticRequest(request, values)
                  }
                  onDecideRunRequest={(request, decision) =>
                    void decideAgenticRunRequest(request, decision)
                  }
                  onStop={() => agenticAbortRef.current?.abort()}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workflow-agentic-canvas"
                defaultSize="64%"
                minSize="40%"
              >
                {canvas}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="h-[34%] min-h-36 border-b border-border/70">
              {canvas}
            </div>
            <div className="min-h-0 flex-1">
              <WorkflowAgenticPanel
                messages={agenticMessages}
                activities={agenticActivities}
                pendingRequests={agenticPendingRequests}
                runRequests={agenticRunRequests}
                todoList={agenticTodoList}
                input={agenticInput}
                running={agenticRunning}
                historyLoading={agenticHistoryLoading}
                submittingRequestId={submittingAgenticRequestId}
                decidingRunRequestId={decidingAgenticRunRequestId}
                agentName={agenticAgentName}
                onInputChange={setAgenticInput}
                onSubmit={(prompt) => void runAgenticBuilder(prompt)}
                onSubmitRequest={(request, values) =>
                  void submitAgenticRequest(request, values)
                }
                onDecideRunRequest={(request, decision) =>
                  void decideAgenticRunRequest(request, decision)
                }
                onStop={() => agenticAbortRef.current?.abort()}
              />
            </div>
          </div>
        )
      ) : isDesktop ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup key={editorMode} orientation="horizontal">
            <ResizablePanel
              id="workflow-palette"
              defaultSize="18%"
              minSize="14%"
              maxSize="30%"
            >
              {renderPalette("desktop")}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="workflow-canvas"
              defaultSize="57%"
              minSize="35%"
            >
              {canvas}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="workflow-inspector"
              defaultSize="25%"
              minSize="20%"
              maxSize="38%"
            >
              <aside className="h-full min-h-0 bg-background">
                {renderInspector("desktop")}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{canvas}</div>
      )}

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="w-[min(92vw,24rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("palette")}</SheetTitle>
            <SheetDescription>{t("paletteHint")}</SheetDescription>
          </SheetHeader>
          {renderPalette("mobile")}
        </SheetContent>
      </Sheet>

      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side="right"
          className="w-[min(94vw,30rem)] p-0 sm:max-w-xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("configuration")}</SheetTitle>
            <SheetDescription>{t("configurationHint")}</SheetDescription>
          </SheetHeader>
          {renderInspector("mobile")}
        </SheetContent>
      </Sheet>

      <WorkflowBuilderRunSheet model={model} />

      <WorkflowBuilderSection1 model={model} />
    </div>
  );
  return isFullscreen ? createPortal(builder, document.body) : builder;
}
