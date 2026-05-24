// ---------------------------------------------------------------------------
// Lightweight in-memory TTL cache for service-layer deduplication.
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getQueryCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setQueryCache<T>(key: string, data: T, ttlMs = 30_000): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateQueryCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cachedQuery<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = getQueryCache<T>(key);
  if (hit !== null) return hit;
  const data = await loader();
  setQueryCache(key, data, ttlMs);
  return data;
}
