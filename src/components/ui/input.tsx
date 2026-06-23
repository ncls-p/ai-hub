import * as React from "react";

import { cn } from "@/lib/utils";

function Input({
	className,
	type,
	id,
	name,
	...props
}: React.ComponentProps<"input">) {
	const inputName = name ?? (typeof id === "string" ? id : undefined);

	return (
		<input
			id={id}
			name={inputName}
			type={type}
			data-slot="input"
			className={cn(
				"h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base transition-[background-color,border-color,box-shadow,color] duration-150 ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
