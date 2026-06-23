import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ListRowProps = ComponentProps<"div"> & {
	selected?: boolean;
	children: ReactNode;
};

export function ListRow({
	selected = false,
	className,
	children,
	...props
}: ListRowProps) {
	return (
		<div
			data-slot="list-row"
			className={cn(
				"ui-list-row flex items-center gap-3 p-3",
				selected && "border-input bg-muted",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

type ListRowButtonProps = ComponentProps<"button"> & {
	selected?: boolean;
	children: ReactNode;
};

export function ListRowButton({
	selected = false,
	className,
	children,
	type = "button",
	...props
}: ListRowButtonProps) {
	return (
		<button
			type={type}
			data-slot="list-row-button"
			className={cn(
				"ui-list-row flex w-full items-center gap-3 p-3 text-left text-sm active:not-disabled:scale-[0.96]",
				selected && "border-input bg-muted",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
