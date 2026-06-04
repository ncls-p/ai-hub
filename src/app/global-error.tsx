"use client";

import "./globals.css";

export default function GlobalError({
	error,
	unstable_retry,
	reset,
}: {
	error: Error & { digest?: string };
	unstable_retry?: () => void;
	reset?: () => void;
}) {
	const retry = unstable_retry ?? reset;

	return (
		<html lang="en" suppressHydrationWarning>
			<body className="min-h-svh bg-background text-foreground antialiased">
				<title>Unexpected error · AI Hub</title>
				<main
					data-page="auth"
					className="flex min-h-svh items-center justify-center bg-background p-4"
				>
					<section className="surface-panel animate-in-up w-full max-w-md p-6 text-center">
						<h1 className="text-2xl font-semibold tracking-tight">
							Something went wrong
						</h1>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Try again. If this keeps happening, share this error with your
							workspace administrator.
						</p>
						{error.digest ? (
							<p className="mt-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
								Digest: {error.digest}
							</p>
						) : null}
						<button
							type="button"
							onClick={() => retry?.()}
							disabled={!retry}
							className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50"
						>
							Try again
						</button>
					</section>
				</main>
			</body>
		</html>
	);
}
