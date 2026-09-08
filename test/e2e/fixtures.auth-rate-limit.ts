import { setTimeout } from "node:timers/promises";

/** Tests share one client IP. Honor the production limiter instead of disabling it. */
export async function retryRateLimitedAuth<
  T extends {
    status(): number;
    headers(): Record<string, string>;
  },
>(request: () => Promise<T>): Promise<T> {
  const response = await request();
  if (response.status() !== 429) return response;
  const seconds = Number(response.headers()["x-retry-after"]);
  // One retry within the real sign-in window; unexpected throttling still fails.
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) return response;
  await setTimeout(seconds * 1000 + 100);
  return request();
}
