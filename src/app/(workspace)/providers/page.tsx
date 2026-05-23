export default function ProvidersPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Providers</h1>
            </div>
            <div className="border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-lg">No providers configured</p>
                <p className="text-sm mt-2">
                    Add an OpenAI-compatible, Dragonfly, or Vercel AI Gateway
                    provider.
                </p>
            </div>
        </div>
    );
}
