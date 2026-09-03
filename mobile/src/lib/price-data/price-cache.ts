/**
 * Simple TTL cache used by the price-data provider registry.
 * Keeps provider calls cheap and resilient — when a remote API
 * fails, the previous successful payload is still available.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheClear(): void {
  store.clear();
}

/** Wrap an async fn so its result is cached and errors fall back silently. */
export async function withCacheAndFallback<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: T,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  try {
    const value = await fn();
    cacheSet(key, value, ttlMs);
    return value;
  } catch {
    // Provider failure — return fallback but don't poison the cache.
    return fallback;
  }
}
