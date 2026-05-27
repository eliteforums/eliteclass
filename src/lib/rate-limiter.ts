// --- Types ---

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number | null;
}

// --- Default Configs ---

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowSeconds: 60,
};

export const REGISTER_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowSeconds: 600,
};

// --- Internal State ---

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** In-memory store keyed by hashed identifier */
const store = new Map<string, RateLimitEntry>();

/** Cleanup interval handle (avoids unbounded memory growth) */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      // Remove entries whose window has fully expired (use max window of 600s as upper bound)
      if (now - entry.windowStart > 600_000) {
        store.delete(key);
      }
    });
  }, 60_000); // Run cleanup every 60s

  // Allow the process to exit without waiting for this interval
  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }
}

// --- Helpers ---

/**
 * Hash the IP address so we never store raw IPs in memory.
 * Uses a simple non-cryptographic hash since this is just for key deduplication.
 */
function hashIp(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, '0').slice(0, 16);
}

/**
 * Build a store key from action and hashed IP.
 */
function buildKey(action: string, ipHash: string): string {
  return `ratelimit:${action}:${ipHash}`;
}

// --- Public API ---

/**
 * Check whether a request from the given IP for the given action is allowed
 * under the configured rate limit.
 *
 * Uses an in-memory sliding window counter. This works per-isolate (Vercel
 * serverless functions reuse warm instances), providing basic protection
 * without requiring external infrastructure.
 *
 * Fail-open: if any internal error occurs, the request is allowed.
 */
export async function checkRateLimit(
  ip: string,
  action: 'login' | 'register',
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    startCleanup();

    const now = Date.now();
    const ipHash = hashIp(ip);
    const key = buildKey(action, ipHash);
    const windowMs = config.windowSeconds * 1000;

    const entry = store.get(key);

    // No existing entry or window has expired — start fresh
    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: config.maxAttempts - 1,
        retryAfterSeconds: null,
      };
    }

    // Within active window
    const elapsed = now - entry.windowStart;
    const remaining = windowMs - elapsed;
    const retryAfterSeconds = Math.ceil(remaining / 1000);

    if (entry.count >= config.maxAttempts) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    // Increment and allow
    entry.count += 1;
    const attemptsLeft = config.maxAttempts - entry.count;

    return {
      allowed: true,
      remaining: attemptsLeft,
      retryAfterSeconds: null,
    };
  } catch {
    // Fail-open: allow the request if anything goes wrong internally
    return {
      allowed: true,
      remaining: config.maxAttempts,
      retryAfterSeconds: null,
    };
  }
}

// --- Test Helpers (exported for testing only) ---

/**
 * Reset the in-memory store. Useful for testing.
 */
export function _resetStore(): void {
  store.clear();
}

/**
 * Exposed for testing: get current store size.
 */
export function _getStoreSize(): number {
  return store.size;
}
