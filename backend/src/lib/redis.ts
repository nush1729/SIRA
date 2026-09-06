import Redis from "ioredis";
import { env } from "../config/env";

// Narrow use only, per architecture doc Section 5.2: (a) a short-lived lock during slot
// confirmation to close the double-booking race window before the DB constraint is even hit,
// (b) session/rate-limit counters. Never used as a system of record.
export const redis = new Redis(env.REDIS_URL);

/**
 * Attempts to acquire a short-lived lock for a given key (e.g. a slot id) so that a burst of
 * duplicate/rapid-click confirm requests fails fast instead of racing all the way to Postgres.
 * Returns true if the lock was acquired, false if another request already holds it.
 */
export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, "1", "PX", ttlMs, "NX");
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
