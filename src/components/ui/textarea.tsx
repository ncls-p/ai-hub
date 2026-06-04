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
				"flex field-sizing-content min-h-24 w-full rounded-lg border border-input bg-background/65 px-3.5 py-3 text-base shadow-[inset_0_1px_0_0_color-mix(in_oklch,white_38%,transparent)] transition-[background-color,border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground/85 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/40 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
