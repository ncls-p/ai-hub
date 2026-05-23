"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
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
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
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
			className="relative isolate flex min-h-svh items-center justify-center bg-background p-4"
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
			<div className="flex w-full max-w-md flex-col gap-5">
				<div className="flex justify-center">
					<DeodisLogo priority className="h-8" />
				</div>
				<div className="surface-panel p-1">
					<Card className="border-0 bg-transparent shadow-none">
						<CardHeader className="gap-2 px-5 pt-5">
							<div className="section-kicker">Account</div>
							<CardTitle className="text-2xl">
								Create your AI Hub account
							</CardTitle>
							<CardDescription>
								It only takes a minute. Use your work email to prepare for team
								collaboration.
							</CardDescription>
						</CardHeader>
						<CardContent className="px-5 pb-5">
							<form onSubmit={handleSubmit}>
								<FieldGroup className="gap-4">
									{error ? (
										<Alert variant="destructive" aria-live="polite">
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
											/>
										</FieldContent>
									</Field>

									<Button
										type="submit"
										size="lg"
										className="w-full"
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
								</FieldGroup>
							</form>
						</CardContent>
					</Card>
				</div>
				<p className="text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link
						href="/auth/signin"
						className="font-medium text-primary hover:underline"
					>
						Sign in
					</Link>
				</p>
			</div>
		</main>
	);
}
