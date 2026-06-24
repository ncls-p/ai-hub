import { Redis } from "ioredis";
import { env } from "@/lib/env";

let redisInstance: Redis | null = null;

function getCache(): Redis {
  if (redisInstance) return redisInstance;

  redisInstance = new Redis(env.DRAGONFLY_URL, {
    password: env.DRAGONFLY_PASSWORD || undefined,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  return redisInstance;
}

export const cache = {
  async get<T = string>(key: string): Promise<T | null> {
    try {
      const val = await getCache().get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await getCache().setex(key, ttlSeconds, serialized);
      } else {
        await getCache().set(key, serialized);
      }
    } catch {
      // Cache writes are best-effort
    }
  },

  async del(key: string): Promise<void> {
    try {
      await getCache().del(key);
    } catch {
      // Cache deletes are best-effort
    }
  },

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const val = await getCache().incr(key);
      if (ttlSeconds) {
        await getCache().expire(key, ttlSeconds);
      }
      return val;
    } catch {
      return 0;
    }
  },
};
