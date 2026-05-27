// ---------------------------------------------------------------------------
// Cached Service — wraps service calls with edge caching.
// Sits between service functions and Supabase, using the edge cache module.
// ---------------------------------------------------------------------------

import type { ApiResponse } from "@/types";
import {
  edgeCacheGet,
  edgeCachePut,
  edgeCacheRegisterTags,
  edgeCacheInvalidate,
} from "./edge-cache";
import { runService } from "./service-runner";

export interface CachedServiceOptions {
  /** Cache key path (e.g., "institute:config:{id}") */
  key: string;
  /** TTL in seconds */
  ttlSeconds: number;
  /** 'public' for shared data, 'user' for per-user data */
  scope: "public" | "user";
  /** Tags for invalidation grouping */
  tags?: string[];
}

/**
 * Wrap a service function with edge caching.
 * On cache hit, returns cached data without calling the service.
 * On cache miss, calls the service and caches the result.
 *
 * The `request` parameter is optional — when unavailable (client-side),
 * caching is skipped and the loader is called directly.
 */
export async function cachedService<T>(
  options: CachedServiceOptions,
  loader: () => Promise<ApiResponse<T>>,
  request?: Request,
): Promise<ApiResponse<T>> {
  // Try cache first (only when Request is available, i.e. edge/worker context)
  if (request) {
    const cached = await edgeCacheGet<T>(request, options);
    if (cached) {
      return { data: cached.data, error: null, success: true };
    }
  }

  // Call the actual service
  const result = await loader();

  // Cache successful responses (only when Request is available)
  if (result.success && result.data != null && request) {
    await edgeCachePut(request, result.data, options);

    if (options.tags && options.tags.length > 0) {
      await edgeCacheRegisterTags(request, options);
    }
  }

  return result;
}

/**
 * Combines `runService` error handling with edge caching.
 * - Catches thrown errors (same as runService)
 * - Checks edge cache before calling the service
 * - Caches successful responses
 *
 * Use this as a drop-in replacement for `runService` when you want caching.
 */
export async function runCachedService<T>(
  label: string,
  options: CachedServiceOptions,
  fn: () => Promise<ApiResponse<T>>,
  request?: Request,
): Promise<ApiResponse<T>> {
  return runService(label, () => cachedService(options, fn, request));
}

/**
 * Invalidate cache entries when data is mutated.
 * Call this after create/update/delete operations.
 *
 * Silently fails if cache API is unavailable.
 */
export async function invalidateServiceCache(tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  await edgeCacheInvalidate(tags);
}
