// ---------------------------------------------------------------------------
// Offline Snapshot Helpers — fire-and-forget wrappers used by OCS services
// ---------------------------------------------------------------------------
//
// These helpers sit on top of `snapshots.ts` (the low-level IndexedDB API)
// and resolve the current owner user id from the auth store so service
// functions don't have to thread the user id through their signatures.
//
// Design notes:
//   - Writes are fire-and-forget: a failed snapshot must never break a list
//     query. We swallow errors with `.catch(() => {})`.
//   - When the user is unknown (signed out, hydration in progress, SSR),
//     writes are skipped. There is no point caching anonymous lists since
//     the snapshot store is keyed by `ownerUserId`.
//   - Detail-view fallback (`readCachedDetail`) returns `null` instead of
//     throwing so callers can compose it cleanly inside a normal ApiResponse
//     return path.
//   - `isOffline()` keeps the offline-detection logic in one place so the
//     services stay readable.
// ---------------------------------------------------------------------------

import { useAuthStore } from "@/store/authStore";
import { getOne, upsertList } from "./snapshots";

function currentOwnerUserId(): string | null {
  // `getState()` is safe to call outside React; on SSR the store still
  // returns its initial null user.
  try {
    return useAuthStore.getState().user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget snapshot write for a list query. Resolves the owner user
 * from the auth store and silently no-ops when no user is signed in or
 * IndexedDB is unavailable (SSR, locked-down browsers).
 */
export function cacheList<T extends { id: string }>(
  entityType: string,
  rows: ReadonlyArray<T> | null | undefined,
): void {
  if (!rows || rows.length === 0) return;
  if (typeof indexedDB === "undefined") return;

  const ownerUserId = currentOwnerUserId();
  if (!ownerUserId) return;

  void upsertList(entityType, rows, ownerUserId).catch(() => {
    // Snapshot writes are best-effort; never disrupt the calling list query.
  });
}

/**
 * Read a single cached detail row from the snapshot store. Returns `null`
 * when offline storage is unavailable, when no user is signed in, or when
 * the row was never cached. Callers should branch on `null` to decide
 * whether to surface a network error.
 */
export async function readCachedDetail<T = unknown>(
  entityType: string,
  id: string,
): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const ownerUserId = currentOwnerUserId();
  if (!ownerUserId) return null;
  try {
    return await getOne<T>(entityType, id, ownerUserId);
  } catch {
    return null;
  }
}

/**
 * Quick offline detection used by detail-view fallbacks. Treats SSR as
 * "online" so server-rendered pages don't accidentally short-circuit to the
 * snapshot cache.
 */
export function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}
