"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function SignOutButton({
  iconOnly = false,
  className,
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Sign out failed");

      window.sessionStorage.removeItem("active_workspace_id");
      router.push("/auth/signin");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "group justify-start rounded-xl transition-[background-color,color,scale] duration-150 ease-out hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      onClick={signOut}
      disabled={pending}
      aria-label="Sign out"
    >
      {pending ? (
        <Spinner data-icon={iconOnly ? undefined : "inline-start"} />
      ) : (
        <LogOutIcon
          data-icon={iconOnly ? undefined : "inline-start"}
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      )}
      {iconOnly ? <span className="sr-only">Sign out</span> : "Sign out"}
    </Button>
  );
}
