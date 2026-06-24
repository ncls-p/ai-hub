import { NextResponse } from "next/server";
import { cache } from "@/server/infrastructure/cache";

export interface RateLimitOptions {
  /** Max requests per window */
  limit?: number;
  /** Window duration in seconds */
  windowSeconds?: number;
  /** Identifier key (default: IP address) */
  key?: string;
}

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW = 60; // 60 requests per minute

type RateLimitResult = { allowed: boolean; reset: number; remaining: number };

function getRateLimitKey(req: Request, key?: string) {
  if (key) return key;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function secondsUntilReset(reset: number) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, reset - now);
}

export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW;
  const key = getRateLimitKey(req, options.key);

  const countKey = `ratelimit:${key}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    const current = await cache.incr(countKey, windowSeconds);
    const count = Number(current);
    const reset = now + windowSeconds;
    const remaining = Math.max(0, limit - count);

    return {
      allowed: count <= limit,
      reset,
      remaining,
    };
  } catch {
    // Cache unavailable — allow request (fail open)
    return { allowed: true, reset: now + windowSeconds, remaining: limit };
  }
}

export function rateLimitExceededResponse(
  reset: number,
  remaining: number,
  limit = DEFAULT_LIMIT,
) {
  const retryAfter = secondsUntilReset(reset);

  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter, reset },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
      },
    },
  );
}

/**
 * Middleware wrapper for route handlers.
 * Wrap a route handler with a per-window request budget.
 */
export function withRateLimit(
  handler: (req: Request) => Promise<NextResponse>,
  options?: RateLimitOptions,
) {
  return async (req: Request) => {
    const result = await checkRateLimit(req, options);
    if (!result.allowed) {
      return rateLimitExceededResponse(
        result.reset,
        result.remaining,
        options?.limit ?? DEFAULT_LIMIT,
      );
    }
    const response = await handler(req);
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        "X-RateLimit-Limit": String(options?.limit ?? DEFAULT_LIMIT),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    });
  };
}
