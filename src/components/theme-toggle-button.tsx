"use client";

import { MoonStarIcon } from "lucide-react";
import { useTheme } from "@teispace/next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggleButton({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className={cn(
				"rounded-full text-muted-foreground hover:text-foreground",
				className,
			)}
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			<MoonStarIcon data-icon="inline-start" aria-hidden="true" />
			Theme
		</Button>
	);
}
