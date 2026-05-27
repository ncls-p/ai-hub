import type { Metadata } from "next";
import { Geist_Mono, Prompt } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const fontBody = Prompt({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-body",
});

const fontDisplay = Prompt({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	variable: "--font-display",
});

const fontMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
});

export const metadata: Metadata = {
	title: {
		default: "AI Hub",
		template: "%s · AI Hub",
	},
	description:
		"Build, configure, and run AI agents with multi-provider support and team collaboration.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			data-scroll-behavior="smooth"
			suppressHydrationWarning
			className={cn(
				"min-h-full bg-background text-foreground antialiased",
				fontMono.variable,
				fontBody.variable,
				fontDisplay.variable,
			)}
		>
			<body className="min-h-svh">
				<ThemeProvider>
					<TooltipProvider>
						{children}
						<Toaster />
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
