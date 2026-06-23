import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const tapScale = "active:not-disabled:not-aria-[haspopup]:scale-[0.96]";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/15 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				outline:
					"border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
				secondary:
					"border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary",
				ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
				link: "h-auto rounded-none border-0 px-0 text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
				xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				icon: "size-10",
				"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8 rounded-md",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	static: isStatic = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		static?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(
				buttonVariants({ variant, size }),
				!isStatic && variant !== "link" && tapScale,
				className,
			)}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
