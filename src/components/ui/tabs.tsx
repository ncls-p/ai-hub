"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-3 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg border bg-muted p-1 text-muted-foreground group-data-horizontal/tabs:min-h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=line]:border-0 data-[variant=line]:bg-transparent data-[variant=line]:p-0",
  {
    variants: {
      variant: {
        default: "",
        line: "gap-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const hasSlidingPill = variant === "default";

  const movePill = React.useCallback((options: { animate: boolean }) => {
    const { animate } = options;
    const list = listRef.current;
    if (!list) return;

    const pill = list.querySelector<HTMLElement>(".t-tabs-pill");
    const activeTab = list.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"], [data-slot="tabs-trigger"][aria-selected="true"], [data-slot="tabs-trigger"][data-active]',
    );

    if (!pill || !activeTab) return;

    const writePosition = () => {
      pill.style.transform = `translate(${activeTab.offsetLeft}px, ${activeTab.offsetTop}px)`;
      pill.style.width = `${activeTab.offsetWidth}px`;
      pill.style.height = `${activeTab.offsetHeight}px`;
    };

    if (!animate) {
      const previousTransition = pill.style.transition;
      pill.style.transition = "none";
      writePosition();
      void pill.offsetWidth;
      pill.style.transition = previousTransition;
      return;
    }

    writePosition();
  }, []);

  React.useLayoutEffect(() => {
    if (!hasSlidingPill) return;

    const list = listRef.current;
    if (!list) return;

    const firstPaint = window.requestAnimationFrame(() =>
      movePill({ animate: false }),
    );
    const onResize = () => movePill({ animate: false });
    const onInteraction = () => {
      window.requestAnimationFrame(() => movePill({ animate: true }));
    };
    const observer = new MutationObserver(() => movePill({ animate: true }));

    observer.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "data-active", "data-state"],
    });
    list.addEventListener("click", onInteraction);
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(firstPaint);
      observer.disconnect();
      list.removeEventListener("click", onInteraction);
      window.removeEventListener("resize", onResize);
    };
  }, [hasSlidingPill, movePill]);

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        tabsListVariants({ variant }),
        hasSlidingPill && "t-tabs",
        className,
      )}
      {...props}
    >
      {hasSlidingPill ? (
        <span className="t-tabs-pill" aria-hidden="true" />
      ) : null}
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "t-tab relative inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[background-color,border-color,box-shadow,color] duration-150 ease-out group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:border-border data-active:bg-background data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity after:duration-150 group-data-horizontal/tabs:after:inset-x-4 group-data-horizontal/tabs:after:bottom-[-0.45rem] group-data-horizontal/tabs:after:h-px group-data-vertical/tabs:after:inset-y-2 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-px group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-h-0 flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
