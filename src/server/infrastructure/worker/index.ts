import http from "node:http";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

async function main() {
    logger.info("Worker starting...", { env: env.NODE_ENV });

    const server = http.createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", worker: true }));
        } else {
            res.writeHead(404);
            res.end("Not found");
        }
    });

    server.listen(3001, () => {
        logger.info("Worker listening on port 3001");
    });

    // Job queues will be wired here (BullMQ / Inngest / custom)
    // - Document ingestion
    // - Embedding generation
    // - MCP tool sync
    // - Provider model sync
    // - Long-running tool executions
    // - Marketplace moderation checks

    process.on("SIGTERM", () => {
        logger.info("Worker received SIGTERM, shutting down gracefully...");
        server.close(() => process.exit(0));
    });

    process.on("SIGINT", () => {
        logger.info("Worker received SIGINT, shutting down gracefully...");
        server.close(() => process.exit(0));
    });
}

main().catch((err) => {
    logger.error("Worker crashed", { error: (err as Error).message });
    process.exit(1);
});
