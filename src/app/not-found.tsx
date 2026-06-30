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

// Prevent static prerendering to avoid SSR hydration issues with theme provider
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function NotFound() {
  return (
    <main
      data-page="auth"
      className="flex min-h-svh items-center justify-center bg-background p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex justify-center">
          <DeodisLogo href="/chat" priority className="h-8" />
        </div>
        <Card>
          <CardHeader className="gap-2 text-center">
            <CardTitle className="text-2xl">Page not found</CardTitle>
            <CardDescription>
              The page you requested does not exist or has moved.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <Button asChild>
              <Link href="/chat">Return to chat</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
