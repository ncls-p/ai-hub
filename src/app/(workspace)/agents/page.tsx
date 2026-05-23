export default function AgentsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Agents</h1>
            </div>
            <div className="border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-lg">No agents yet</p>
                <p className="text-sm mt-2">
                    Create your first agent to get started.
                </p>
            </div>
        </div>
    );
}
