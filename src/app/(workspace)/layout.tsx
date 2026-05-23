import Link from "next/link";

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <header className="border-b bg-card">
                <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
                    <Link href="/" className="font-bold text-lg">
                        AI Hub
                    </Link>
                    <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                        <Link
                            href="/chat"
                            className="hover:text-foreground transition-colors"
                        >
                            Chat
                        </Link>
                        <Link
                            href="/agents"
                            className="hover:text-foreground transition-colors"
                        >
                            Agents
                        </Link>
                        <Link
                            href="/providers"
                            className="hover:text-foreground transition-colors"
                        >
                            Providers
                        </Link>
                        <Link
                            href="/members"
                            className="hover:text-foreground transition-colors"
                        >
                            Members
                        </Link>
                        <Link
                            href="/settings"
                            className="hover:text-foreground transition-colors"
                        >
                            Settings
                        </Link>
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <Link
                            href="/auth/signin"
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </div>
    );
}
