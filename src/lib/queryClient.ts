// ---------------------------------------------------------------------------
// QueryClient with persisted IndexedDB cache
// ---------------------------------------------------------------------------
//
// Builds the shared TanStack Query client and wires `persistQueryClient` to
// IndexedDB via `idb` so cached reads survive reloads and full browser
// restarts. This is part of the offline-first rollout
// (`exam-reattempts-and-offline-caching` spec, Phase B).
//
// Cache isolation rules (Req 9.3, 9.6, 15.1, 15.4):
//   * Persister buster includes the authenticated user id; switching users
//     blows away the previous cache namespace.
//   * `purgePersistedCache()` removes the IndexedDB entry on sign-out so the
//     next sign-in starts clean.
//   * The persister only runs in the browser; SSR boots without persistence.
//
// PWA-disabled fallback (Req 18.3): the persister is independent of the
// service worker. Reads continue to hydrate from IndexedDB even when no SW
// is registered.
// ---------------------------------------------------------------------------

import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { openDB, type IDBPDatabase } from "idb";

import { GC_TIMES, STALE_TIMES } from "./query-keys";

const DB_NAME = "eliteclass-offline";
const DB_VERSION = 1;
const STORE_NAME = "tq-persister";
const PERSIST_KEY = "react-query-cache";

// Per-app cache schema version. Bumping this discards the entire persisted
// cache the next time the app boots (Req 9.6). Keep in sync with schema
// changes that would invalidate cached payload shapes.
const PERSISTED_SCHEMA_VERSION = "v1";

// Max persisted-cache entry size before we discard. The persist-client lib
// already compresses with structuredClone; this is a safety bound only.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

let _db: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return _db;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

// ---------------------------------------------------------------------------
// QueryClient construction
// ---------------------------------------------------------------------------

export function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIMES.default,
        gcTime: GC_TIMES.default,
        retry: (failureCount, error) => {
          if (error instanceof Error && error.name === "AbortError") return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface AttachPersisterArgs {
  /** The QueryClient to attach to. */
  queryClient: QueryClient;
  /**
   * Authenticated user id. Used as part of the buster so cached entries
   * for one user are never returned to another. Pass `null` for an
   * unauthenticated session — the cache is namespaced under "anon".
   */
  userId: string | null;
}

/**
 * Attach the IndexedDB persister to a `QueryClient`. Safe to call repeatedly;
 * each call replaces the prior persister and triggers a fresh hydrate.
 *
 * Returns a teardown function (kept for symmetry; the persist-client lib
 * already manages its own subscription, so this is informational only).
 */
export function attachPersister({ queryClient, userId }: AttachPersisterArgs): () => void {
  if (!isBrowser()) return () => {};

  const buster = `${PERSISTED_SCHEMA_VERSION}-${userId ?? "anon"}`;

  const persister = createAsyncStoragePersister({
    storage: {
      getItem: async (key) => {
        try {
          const db = await getDb();
          const value = await db.get(STORE_NAME, key);
          return (value as string | undefined) ?? null;
        } catch {
          return null;
        }
      },
      setItem: async (key, value) => {
        try {
          const db = await getDb();
          await db.put(STORE_NAME, value, key);
        } catch {
          // Quota or transient IDB failure — drop silently; reads still work.
        }
      },
      removeItem: async (key) => {
        try {
          const db = await getDb();
          await db.delete(STORE_NAME, key);
        } catch {
          // ignore
        }
      },
    },
    key: PERSIST_KEY,
  });

  const [unsubscribe] = persistQueryClient({
    queryClient,
    persister,
    maxAge: MAX_AGE_MS,
    buster,
  });

  return unsubscribe;
}

/**
 * Remove every persisted cache entry. Call on sign-out so the next sign-in
 * starts clean (Req 9.4, 15.2).
 */
export async function purgePersistedCache(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await getDb();
    await db.clear(STORE_NAME);
  } catch {
    // ignore — best-effort cleanup
  }
}
