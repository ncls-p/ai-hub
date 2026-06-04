"use client";

import { type SyntheticEvent, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { LogInIcon } from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			const res = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message || "Sign in failed");
			}

			router.push("/chat");
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign in failed");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main
			data-page="auth"
			className="relative isolate flex min-h-svh items-center justify-center bg-background p-4 overflow-hidden"
		>
			{/* Ambient orbs */}
			<div className="orb orb--primary orb--top-left" />
			<div className="orb orb--muted orb--bottom-right" />
			<div className="orb orb--accent orb--top-right" />

			{/* Grain overlay */}
			<div className="pointer-events-none absolute inset-0 grain-overlay" />

			{/* Top accent line */}
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

			<div className="relative z-10 flex w-full max-w-md flex-col gap-5 animate-in-up">
				{/* Logo */}
				<div className="flex justify-center animate-in-fade stagger-1">
					<DeodisLogo priority className="h-8" />
				</div>

				{/* Glass card */}
				<div className="glass-card animate-in-scale stagger-2">
					<Card className="border-0 shadow-none bg-transparent">
						<CardHeader className="gap-3">
							<div className="section-kicker animate-in-fade stagger-3">
								Account
							</div>
							<CardTitle className="text-2xl tracking-tight">
								Sign in to AI Hub
							</CardTitle>
							<CardDescription>
								Welcome back. Open your workspace to manage providers, agents,
								and conversations.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit} className="space-y-4">
								{error ? (
									<Alert
										variant="destructive"
										aria-live="polite"
										className="animate-in-up"
									>
										<AlertTitle>We couldn&apos;t sign you in</AlertTitle>
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								) : null}

								<Field>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<FieldContent>
										<Input
											id="email"
											type="email"
											autoComplete="email"
											required
											value={email}
											onChange={(event) => setEmail(event.target.value)}
											placeholder="you@company.com"
											className="transition-shadow duration-200 focus:ring-4 focus:ring-ring/10"
										/>
									</FieldContent>
								</Field>

								<Field>
									<FieldLabel htmlFor="password">Password</FieldLabel>
									<FieldContent>
										<Input
											id="password"
											type="password"
											autoComplete="current-password"
											required
											value={password}
											onChange={(event) => setPassword(event.target.value)}
											placeholder="Enter your password…"
											className="transition-shadow duration-200 focus:ring-4 focus:ring-ring/10"
										/>
									</FieldContent>
								</Field>

								<Button
									type="submit"
									size="lg"
									className="w-full shimmer transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 active:translate-y-0"
									disabled={loading}
								>
									{loading ? (
										<Spinner data-icon="inline-start" />
									) : (
										<LogInIcon data-icon="inline-start" aria-hidden="true" />
									)}
									Sign in
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>

				{/* Sign up link */}
				<p className="text-center text-sm text-muted-foreground animate-in-fade stagger-4">
					Don&apos;t have an account?{" "}
					<Link
						href="/auth/signup"
						className="font-medium text-primary hover:underline underline-offset-4 transition-all"
					>
						Sign up
					</Link>
				</p>
			</div>
		</main>
	);
}
