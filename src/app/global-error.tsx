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
					className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background p-4"
				>
					<div className="orb orb--primary orb--top-left" />
					<div className="orb orb--muted orb--bottom-right" />
					<div className="orb orb--accent orb--top-right" />
					<div className="pointer-events-none absolute inset-0 grain-overlay" />
					<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

					<section className="glass-card animate-in-scale relative z-10 w-full max-w-md p-6 text-center">
						<div className="section-kicker mx-auto">Unexpected error</div>
						<h1 className="mt-4 text-2xl font-semibold tracking-tight">
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
							className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/15 transition-[background-color,box-shadow,opacity,transform] hover:bg-primary/90 hover:shadow-primary/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
						>
							Try again
						</button>
					</section>
				</main>
			</body>
		</html>
	);
}
