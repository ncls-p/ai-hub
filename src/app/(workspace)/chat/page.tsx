export default function ChatPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Chat</h1>
            <div className="border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-lg">Select an agent to start chatting</p>
                <p className="text-sm mt-2">
                    Create an agent first, then start a conversation.
                </p>
            </div>
        </div>
    );
}
