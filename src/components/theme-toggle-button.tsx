"use client";

import { MoonStarIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggleButton() {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="hidden rounded-full text-muted-foreground hover:text-foreground lg:inline-flex"
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			<MoonStarIcon data-icon="inline-start" aria-hidden="true" />
			Theme
		</Button>
	);
}
