"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en">
			<body>
				<main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
					<section className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
						<p className="section-kicker">Unexpected error</p>
						<h1 className="text-2xl font-semibold">Something went wrong</h1>
						<p className="text-sm leading-6 text-muted-foreground">
							Try again. If this keeps happening, share this error with your
							workspace administrator.
						</p>
						{error.digest ? (
							<p className="rounded-xl bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
								Digest: {error.digest}
							</p>
						) : null}
						<Button type="button" onClick={reset} className="self-center">
							Try again
						</Button>
					</section>
				</main>
			</body>
		</html>
	);
}
