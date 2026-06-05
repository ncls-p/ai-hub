type StreamEvent = Record<string, unknown>;

type Subscriber = {
	enqueue: (event: StreamEvent) => void;
	close: () => void;
};

type StreamRun = {
	events: StreamEvent[];
	done: boolean;
	subscribers: Set<Subscriber>;
	abortController?: AbortController;
};

const globalStore = globalThis as typeof globalThis & {
	__aiHubChatStreamRuns?: Map<string, StreamRun>;
};

const runs = globalStore.__aiHubChatStreamRuns ?? new Map<string, StreamRun>();
globalStore.__aiHubChatStreamRuns = runs;

function getRun(messageId: string) {
	let run = runs.get(messageId);
	if (!run) {
		run = { events: [], done: false, subscribers: new Set() };
		runs.set(messageId, run);
	}
	return run;
}

export function publishChatStreamEvent(messageId: string, event: StreamEvent) {
	const run = getRun(messageId);
	run.events.push(event);
	for (const subscriber of run.subscribers) {
		subscriber.enqueue(event);
	}
}

export function registerChatStreamAbortController(
	messageId: string,
	abortController: AbortController,
) {
	const run = getRun(messageId);
	run.abortController = abortController;
}

export function abortChatStream(messageId: string) {
	const run = runs.get(messageId);
	if (!run || run.done) return false;
	run.abortController?.abort();
	publishChatStreamEvent(messageId, { type: "done", stopped: true });
	completeChatStream(messageId);
	return true;
}

export function completeChatStream(messageId: string) {
	const run = getRun(messageId);
	run.done = true;
	run.abortController = undefined;
	for (const subscriber of run.subscribers) {
		subscriber.close();
	}
	run.subscribers.clear();
	setTimeout(() => runs.delete(messageId), 5 * 60 * 1000);
}

export function hasActiveChatStream(messageId: string) {
	const run = runs.get(messageId);
	return Boolean(run && !run.done);
}

export function subscribeToChatStream(
	messageId: string,
	subscriber: Subscriber,
	options: { replay?: boolean } = {},
) {
	const run = getRun(messageId);
	if (options.replay ?? true) {
		for (const event of run.events) {
			subscriber.enqueue(event);
		}
	}
	if (run.done) {
		subscriber.close();
		return () => undefined;
	}
	run.subscribers.add(subscriber);
	return () => {
		run.subscribers.delete(subscriber);
	};
}

export function createChatStreamResponse(
	messageId: string,
	headers: Record<string, string> = {},
	options: { replay?: boolean } = {},
) {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let unsubscribe: () => void = () => undefined;
			unsubscribe = subscribeToChatStream(
				messageId,
				{
					enqueue(event) {
						try {
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
							);
						} catch {
							unsubscribe();
						}
					},
					close() {
						try {
							controller.close();
						} catch {
							// already closed
						}
					},
				},
				options,
			);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
			...headers,
		},
	});
}
