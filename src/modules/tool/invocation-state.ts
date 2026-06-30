/**
 * Polling-based approval waiter.
 *
 * The chat route's tool execute function polls the DB until the invocation
 * status changes from `awaiting_approval` to `success` / `failed` / `rejected`.
 * The approve/reject endpoints update the DB row and the poller picks it up.
 */
import { eq } from "drizzle-orm";
import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

export async function waitForApproval(
  invocationId: string,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<{
  status: "success" | "failed" | "rejected";
  output?: unknown;
  error?: string;
}> {
  const maxWaitMs = options.maxWaitMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const [row] = await db
      .select()
      .from(toolInvocations)
      .where(eq(toolInvocations.id, invocationId))
      .limit(1);

    if (!row) {
      return { status: "failed", error: "Invocation record disappeared" };
    }

    if (row.status === "success" && row.outputJsonEncrypted) {
      try {
        const output = JSON.parse(await decryptValue(row.outputJsonEncrypted));
        return { status: "success", output };
      } catch {
        return { status: "failed", error: "Failed to decrypt tool output" };
      }
    }

    if (row.status === "failed") {
      return {
        status: "failed",
        error: row.errorMessage ?? "Tool execution failed",
      };
    }

    if (row.status === "rejected") {
      return {
        status: "rejected",
        error: row.errorMessage ?? "Tool invocation was rejected by user",
      };
    }
  }

  await db
    .update(toolInvocations)
    .set({
      status: "failed",
      errorMessage: "Approval timed out",
      completedAt: new Date(),
    })
    .where(eq(toolInvocations.id, invocationId));

  return { status: "failed", error: "Approval timed out" };
}
