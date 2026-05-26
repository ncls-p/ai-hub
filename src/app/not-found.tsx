import Link from "next/link";

import { DeodisLogo } from "@/components/deodis-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
	return (
		<main className="flex min-h-svh items-center justify-center bg-background p-4">
			<Card className="w-full max-w-lg">
				<CardContent className="flex flex-col items-center gap-5 p-8 text-center">
					<DeodisLogo href="/chat" priority className="h-8" />
					<div className="flex flex-col gap-2">
						<p className="section-kicker">404</p>
						<h1 className="text-2xl font-semibold">Page not found</h1>
						<p className="text-sm leading-6 text-muted-foreground">
							The page you requested does not exist or has moved.
						</p>
					</div>
					<Button asChild>
						<Link href="/chat">Return to workspace</Link>
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}
