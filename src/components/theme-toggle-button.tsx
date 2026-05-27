"use client";

import { MoonStarIcon } from "lucide-react";
import { useTheme } from "@teispace/next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggleButton({
	className,
	iconOnly = false,
}: {
	className?: string;
	iconOnly?: boolean;
}) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			type="button"
			variant="outline"
			size={iconOnly ? "icon" : "sm"}
			className={cn(
				"rounded-full text-muted-foreground hover:text-foreground",
				className,
			)}
			aria-label="Toggle theme"
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			<MoonStarIcon
				data-icon={iconOnly ? undefined : "inline-start"}
				aria-hidden="true"
			/>
			{iconOnly ? <span className="sr-only">Theme</span> : "Theme"}
		</Button>
	);
}
