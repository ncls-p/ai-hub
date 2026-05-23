export default function MembersPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Members</h1>
            </div>
            <div className="border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-lg">No members yet</p>
                <p className="text-sm mt-2">
                    Invite team members to collaborate.
                </p>
            </div>
        </div>
    );
}
