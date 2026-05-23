"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	BotIcon,
	LayoutDashboardIcon,
	LogInIcon,
	MenuIcon,
	MessageSquareIcon,
	PlugZapIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";

import { DeodisLogo } from "@/components/deodis-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface AppShellHeaderProps {
	displayName?: string;
}

const navItems = [
	{
		href: "/",
		label: "Overview",
		icon: LayoutDashboardIcon,
	},
	{
		href: "/chat",
		label: "Chat",
		icon: MessageSquareIcon,
	},
	{
		href: "/agents",
		label: "Agents",
		icon: BotIcon,
	},
	{
		href: "/providers",
		label: "Providers",
		icon: PlugZapIcon,
	},
	{
		href: "/members",
		label: "Members",
		icon: UsersIcon,
	},
	{
		href: "/settings",
		label: "Settings",
		icon: SettingsIcon,
	},
] as const;

function NavLink({
	href,
	label,
	icon: Icon,
	onNavigate,
}: {
	href: string;
	label: string;
	icon: typeof LayoutDashboardIcon;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
	const isActive =
		pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

	return (
		<Link
			href={href}
			onClick={onNavigate}
			className={cn(
				"inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
				isActive
					? "border-primary/30 bg-primary/10 text-foreground"
					: "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground",
			)}
		>
			<Icon aria-hidden="true" />
			{label}
		</Link>
	);
}

export function AppShellHeader({ displayName }: AppShellHeaderProps) {
	return (
		<header className="app-shell__header shrink-0">
			<div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3">
				<div className="flex min-w-0 items-center gap-2 sm:gap-3">
					<DeodisLogo href="/" className="h-7 sm:h-8" />
					<div className="hidden min-w-0 flex-col sm:flex">
						<span className="truncate text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
							AI Hub
						</span>
						<span className="truncate text-sm text-muted-foreground">
							{displayName ? (
								<>
									Signed in as{" "}
									<span className="font-medium text-foreground">
										{displayName}
									</span>
								</>
							) : (
								"Agent workspace"
							)}
						</span>
					</div>
				</div>

				<nav
					className="hidden items-center gap-2 xl:flex"
					aria-label="Main navigation"
				>
					{navItems.map((item) => (
						<NavLink key={item.href} {...item} />
					))}
				</nav>

				<div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
					<ThemeToggleButton />
					{!displayName ? (
						<Button asChild size="sm" className="hidden sm:inline-flex">
							<Link href="/auth/signin">
								<LogInIcon data-icon="inline-start" aria-hidden="true" />
								Sign in
							</Link>
						</Button>
					) : null}
					<Sheet>
						<SheetTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								className="xl:hidden"
								aria-label="Open navigation menu"
							>
								<MenuIcon aria-hidden="true" />
							</Button>
						</SheetTrigger>
						<SheetContent
							side="right"
							className="flex w-[min(100vw-2rem,22rem)] flex-col"
						>
							<SheetHeader className="border-b border-border pb-4 text-left">
								<SheetTitle className="text-base font-semibold">
									Navigation
								</SheetTitle>
								<p className="text-sm text-muted-foreground">
									{displayName ?? "AI Hub"}
								</p>
							</SheetHeader>
							<nav
								className="flex flex-col gap-2 py-4"
								aria-label="Mobile navigation"
							>
								{navItems.map((item) => (
									<NavLink key={item.href} {...item} />
								))}
							</nav>
							{!displayName ? (
								<div className="mt-auto border-t border-border pt-4">
									<Button asChild className="w-full">
										<Link href="/auth/signin">
											<LogInIcon data-icon="inline-start" aria-hidden="true" />
											Sign in
										</Link>
									</Button>
								</div>
							) : null}
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
