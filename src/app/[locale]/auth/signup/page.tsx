"use client";

import { type SyntheticEvent, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { UserPlusIcon } from "lucide-react";

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

export default function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [registrationClosed, setRegistrationClosed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			void fetch("/api/admin/settings")
				.then((res) => res.json())
				.then((data) => {
					if (!cancelled) setRegistrationClosed(data.canPublicSignUp === false);
				})
				.catch(() => {
					if (!cancelled) setRegistrationClosed(false);
				});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		if (registrationClosed) return;
		setError("");
		setLoading(true);

		try {
			const res = await fetch("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message || "Sign up failed");
			}

			router.push("/chat");
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign up failed");
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
			<div className="orb orb--primary orb--bottom-left" />
			<div className="orb orb--muted orb--top-right" />
			<div className="orb orb--accent orb--bottom-right" />

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
								{registrationClosed
									? "Registration is closed"
									: "Create your AI Hub account"}
							</CardTitle>
							<CardDescription>
								{registrationClosed
									? "Ask an admin to create an account for you."
									: "Create an account to start your workspace."}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{registrationClosed ? (
								<Button
									asChild
									className="w-full shimmer transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 active:translate-y-0"
									size="lg"
								>
									<Link href="/auth/signin">Go to sign in</Link>
								</Button>
							) : (
								<form onSubmit={handleSubmit} className="space-y-4">
									{error ? (
										<Alert
											variant="destructive"
											aria-live="polite"
											className="animate-in-up"
										>
											<AlertTitle>
												We couldn&apos;t create your account
											</AlertTitle>
											<AlertDescription>{error}</AlertDescription>
										</Alert>
									) : null}

									<Field>
										<FieldLabel htmlFor="name">Full name</FieldLabel>
										<FieldContent>
											<Input
												id="name"
												type="text"
												autoComplete="name"
												required
												value={name}
												onChange={(event) => setName(event.target.value)}
												placeholder="Example: Avery Chen"
												className="transition-shadow duration-200 focus:ring-4 focus:ring-ring/10"
											/>
										</FieldContent>
									</Field>

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
												autoComplete="new-password"
												required
												minLength={8}
												value={password}
												onChange={(event) => setPassword(event.target.value)}
												placeholder="Pick a password (at least 8 characters)"
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
											<UserPlusIcon
												data-icon="inline-start"
												aria-hidden="true"
											/>
										)}
										Create account
									</Button>
								</form>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Sign in link */}
				<p className="text-center text-sm text-muted-foreground animate-in-fade stagger-4">
					Already have an account?{" "}
					<Link
						href="/auth/signin"
						className="font-medium text-primary hover:underline underline-offset-4 transition-all"
					>
						Sign in
					</Link>
				</p>
			</div>
		</main>
	);
}
