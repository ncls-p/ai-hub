import Link from "next/link";
import { getSession } from "@/modules/auth/session";

export default async function HomePage() {
    const session = await getSession();

    return (
        <div className="space-y-8">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold">AI Hub</h1>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                    Build, configure, and run AI agents with multi-provider
                    support, knowledge bases, and team collaboration.
                </p>
            </div>

            <div className="flex justify-center gap-4">
                {session ? (
                    <Link
                        href="/chat"
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Start Chatting
                    </Link>
                ) : (
                    <Link
                        href="/auth/signin"
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Sign In
                    </Link>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                {[
                    {
                        title: "Multi-Provider",
                        description:
                            "Connect OpenAI-compatible APIs, Dragonfly, and more with encrypted secrets.",
                        href: "/providers",
                    },
                    {
                        title: "Versioned Agents",
                        description:
                            "Build agents with versioned configs, tools, and knowledge bases.",
                        href: "/agents",
                    },
                    {
                        title: "Team Workspaces",
                        description:
                            "GCP-inspired IAM roles, audit logs, and workspace isolation.",
                        href: "/members",
                    },
                ].map((card) => (
                    <Link
                        key={card.title}
                        href={card.href}
                        className="p-6 border rounded-xl hover:border-primary/50 transition-colors block"
                    >
                        <h3 className="font-semibold text-lg mb-2">
                            {card.title}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                            {card.description}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
