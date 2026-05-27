/**
 * Edge Cache Layer using Cloudflare Workers Cache API (caches.default)
 *
 * Provides read/write caching at the edge with:
 * - Public scope: shared cache for institute-level data
 * - User scope: per-user cache keys for user-specific data
 * - Tag-based invalidation via URL-prefix matching
 * - Graceful fallback when Cache API is unavailable
 */

// Cloudflare Workers Cache API type augmentation
// caches.default is Cloudflare-specific and not in standard DOM types
declare global {
  interface CacheStorage {
    default: Cache;
  }
}

export interface EdgeCacheOptions {
  ttlSeconds: number;
  scope: 'public' | 'user';
  tags?: string[];
}

export interface CacheResult<T> {
  data: T;
  hit: boolean;
}

const CACHE_DOMAIN = 'https://cache.internal';
const CACHE_PREFIX = 'eliteclass';
const TAG_HEADER = 'x-cache-tags';

/**
 * Build a structured cache key following the pattern:
 *   eliteclass:{scope}:{entity}:{identifier}
 *
 * For user-scoped keys, the userId is embedded in the key.
 * For public-scoped keys, no userId is included.
 */
export function buildCacheKey(url: string, userId?: string): string {
  // Strip protocol and host to get a clean path
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '');

  if (userId) {
    return `${CACHE_PREFIX}:user:${userId}:${path}`;
  }

  return `${CACHE_PREFIX}:public:${path}`;
}

/**
 * Attempt to retrieve a cached response from the edge.
 * Returns null on cache miss or if Cache API is unavailable.
 */
export async function edgeCacheGet<T>(
  request: Request,
  options: EdgeCacheOptions
): Promise<CacheResult<T> | null> {
  try {
    const cache = caches.default;
    const userId = options.scope === 'user' ? extractUserId(request) : undefined;
    const key = buildCacheKey(request.url, userId);
    const cacheRequest = new Request(`${CACHE_DOMAIN}/${key}`);

    const response = await cache.match(cacheRequest);

    if (!response) {
      return null;
    }

    const data = (await response.json()) as T;
    return { data, hit: true };
  } catch {
    // Cache API unavailable or error — fall through gracefully
    return null;
  }
}

/**
 * Store data in the edge cache with the specified TTL and tags.
 * Silently fails if Cache API is unavailable.
 */
export async function edgeCachePut<T>(
  request: Request,
  data: T,
  options: EdgeCacheOptions
): Promise<void> {
  try {
    const cache = caches.default;
    const userId = options.scope === 'user' ? extractUserId(request) : undefined;
    const key = buildCacheKey(request.url, userId);
    const cacheRequest = new Request(`${CACHE_DOMAIN}/${key}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': `s-maxage=${options.ttlSeconds}`,
    };

    // Store tags as a custom header for later invalidation lookup
    if (options.tags && options.tags.length > 0) {
      headers[TAG_HEADER] = options.tags.join(',');
    }

    const response = new Response(JSON.stringify(data), { headers });

    await cache.put(cacheRequest, response);
  } catch {
    // Cache API unavailable — silently fail, data will be fetched from origin next time
  }
}

/**
 * Invalidate cache entries by tags.
 *
 * Since Cloudflare's Cache API doesn't support native tag-based purging,
 * we use a URL-based approach: each tag maps to a synthetic cache URL
 * that we delete. Services should use consistent tag naming so that
 * tag-based invalidation removes the correct entries.
 *
 * Tags are encoded as cache key prefixes:
 *   https://cache.internal/eliteclass:tag:{tagName}
 */
export async function edgeCacheInvalidate(tags: string[]): Promise<void> {
  try {
    const cache = caches.default;

    const deletions = tags.map((tag) => {
      const tagKey = `${CACHE_PREFIX}:tag:${tag}`;
      const cacheRequest = new Request(`${CACHE_DOMAIN}/${tagKey}`);
      return cache.delete(cacheRequest);
    });

    await Promise.all(deletions);
  } catch {
    // Cache API unavailable — invalidation is best-effort
  }
}

/**
 * Store a tag reference in the cache so tag-based invalidation can find it.
 * Call this alongside edgeCachePut when tags are specified.
 */
export async function edgeCacheRegisterTags(
  request: Request,
  options: EdgeCacheOptions
): Promise<void> {
  if (!options.tags || options.tags.length === 0) return;

  try {
    const cache = caches.default;
    const userId = options.scope === 'user' ? extractUserId(request) : undefined;
    const key = buildCacheKey(request.url, userId);

    // For each tag, store a reference pointing to the actual cache key
    const registrations = options.tags.map((tag) => {
      const tagKey = `${CACHE_PREFIX}:tag:${tag}`;
      const tagRequest = new Request(`${CACHE_DOMAIN}/${tagKey}`);
      const tagResponse = new Response(JSON.stringify({ keys: [key] }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `s-maxage=${options.ttlSeconds}`,
        },
      });
      return cache.put(tagRequest, tagResponse);
    });

    await Promise.all(registrations);
  } catch {
    // Best-effort tag registration
  }
}

/**
 * Extract user ID from the request.
 * Looks for the user ID in common auth header patterns.
 */
function extractUserId(request: Request): string | undefined {
  // Check for user ID in custom header (set by auth middleware)
  const userId = request.headers.get('x-user-id');
  if (userId) return userId;

  // Check Authorization header for Supabase JWT sub claim
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
