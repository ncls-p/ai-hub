import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  id,
  name,
  ...props
}: React.ComponentProps<"textarea">) {
  const textareaName = name ?? (typeof id === "string" ? id : undefined);

  return (
    <textarea
      id={id}
      name={textareaName}
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base transition-[background-color,border-color,box-shadow,color] duration-150 ease-out outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
