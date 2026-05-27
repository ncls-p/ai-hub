import Link from "next/link";

import { DeodisLogo } from "@/components/deodis-logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
	return (
		<main
			data-page="auth"
			className="relative isolate flex min-h-svh items-center justify-center bg-background p-4"
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
			<div className="flex w-full max-w-md flex-col gap-5">
				<div className="flex justify-center">
					<DeodisLogo href="/chat" priority className="h-8" />
				</div>
				<Card>
					<CardHeader className="gap-2 text-center">
						<div className="section-kicker mx-auto">404</div>
						<CardTitle className="text-2xl">Page not found</CardTitle>
						<CardDescription>
							The page you requested does not exist or has moved.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex justify-center pb-6">
						<Button asChild>
							<Link href="/chat">Return to workspace</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
