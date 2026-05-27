"use client";

import { Geist_Mono, Prompt } from "next/font/google";

import "@/app/globals.css";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const fontBody = Prompt({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-body",
	display: "swap",
});

const fontDisplay = Prompt({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	variable: "--font-display",
	display: "swap",
});

const fontMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html
			lang="en"
			className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}
		>
			<body className="min-h-svh bg-background font-sans text-foreground antialiased">
				<main
					data-page="auth"
					className="relative isolate flex min-h-svh items-center justify-center p-4"
				>
					<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
					<Card className="w-full max-w-lg">
						<CardHeader className="gap-2 text-center">
							<div className="section-kicker mx-auto">Unexpected error</div>
							<CardTitle className="text-2xl">Something went wrong</CardTitle>
							<CardDescription>
								Try again. If this keeps happening, share this error with your
								workspace administrator.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col items-center gap-4 pb-6">
							{error.digest ? (
								<p className="w-full rounded-lg bg-muted px-3 py-2 text-center font-mono text-xs text-muted-foreground">
									Digest: {error.digest}
								</p>
							) : null}
							<Button type="button" onClick={reset}>
								Try again
							</Button>
						</CardContent>
					</Card>
				</main>
			</body>
		</html>
	);
}
