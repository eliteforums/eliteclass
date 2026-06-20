// ---------------------------------------------------------------------------
// Offline IndexedDB scaffolding
// ---------------------------------------------------------------------------
//
// Single shared IndexedDB database for the offline-first feature set. Hosts
// the Sync Outbox, Read Snapshot Cache, dead-letter queue, media-LRU
// tracking, realtime cursor positions, and a misc key-value bag.
//
// Note: the React Query persister uses its own database (`eliteclass-offline`
// store `tq-persister`) — see `src/lib/queryClient.ts`. The persister and
// this offline DB share the same database name but live in different object
// stores; both are upgraded here so the upgrade path stays in one place.
//
// All keys for outbox/snapshot/dead-letter rows include the owner user id
// so cross-user reads are impossible (Req 13.8, 15).
// ---------------------------------------------------------------------------

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const DB_NAME = "eliteclass-offline";
export const DB_VERSION = 1;

export const STORES = {
  OUTBOX: "outbox",
  DEAD_LETTER: "dead_letter",
  SNAPSHOTS: "snapshots",
  MEDIA_LRU: "media_lru",
  REALTIME_CURSORS: "realtime_cursors",
  KV: "kv",
  // Used by `src/lib/queryClient.ts` persister — declared here so the
  // upgrade path creates it the first time.
  TQ_PERSISTER: "tq-persister",
} as const;

export type OutboxStatus = "pending" | "in_flight" | "dead";

export interface OutboxRow {
  id: string;
  ownerUserId: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  headers: Record<string, string>;
  entityType: string;
  entityId: string | null;
  optimisticId: string | null;
  baseUpdatedAt: string | null;
  invalidates: ReadonlyArray<readonly unknown[]>;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  status: OutboxStatus;
  lastError: string | null;
}

export interface SnapshotRow {
  // Composite key as JSON string `"<ownerUserId>:<entityType>:<id>"` for
  // simple equality lookup without a multi-entry index.
  key: string;
  ownerUserId: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  fetchedAt: string;
  source: "list" | "detail" | "optimistic" | "replay";
}

export interface MediaLruRow {
  cacheKey: string;
  bytes: number;
  lastUsedAt: string;
}

export interface RealtimeCursorRow {
  channelKey: string;
  lastSyncedAt: string;
}

export interface KvRow<T = unknown> {
  key: string;
  value: T;
}

interface OfflineDb extends DBSchema {
  outbox: {
    key: string;
    value: OutboxRow;
    indexes: {
      byOwner: string;
      byStatus: OutboxStatus;
      byNextAttemptAt: string;
    };
  };
  dead_letter: {
    key: string;
    value: OutboxRow;
    indexes: { byOwner: string };
  };
  snapshots: {
    key: string;
    value: SnapshotRow;
    indexes: { byOwner: string; byEntityType: string };
  };
  media_lru: {
    key: string;
    value: MediaLruRow;
    indexes: { byLastUsed: string };
  };
  realtime_cursors: {
    key: string;
    value: RealtimeCursorRow;
  };
  kv: {
    key: string;
    value: KvRow;
  };
  "tq-persister": {
    // Persister stores opaque strings keyed by name; the persister manages
    // the keying internally so we expose a permissive shape.
    key: string;
    value: string;
  };
}

let _dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<OfflineDb>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!_dbPromise) {
    _dbPromise = openDB<OfflineDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
          const store = db.createObjectStore(STORES.OUTBOX, { keyPath: "id" });
          store.createIndex("byOwner", "ownerUserId");
          store.createIndex("byStatus", "status");
          store.createIndex("byNextAttemptAt", "nextAttemptAt");
        }
        if (!db.objectStoreNames.contains(STORES.DEAD_LETTER)) {
          const store = db.createObjectStore(STORES.DEAD_LETTER, {
            keyPath: "id",
          });
          store.createIndex("byOwner", "ownerUserId");
        }
        if (!db.objectStoreNames.contains(STORES.SNAPSHOTS)) {
          const store = db.createObjectStore(STORES.SNAPSHOTS, {
            keyPath: "key",
          });
          store.createIndex("byOwner", "ownerUserId");
          store.createIndex("byEntityType", "entityType");
        }
        if (!db.objectStoreNames.contains(STORES.MEDIA_LRU)) {
          const store = db.createObjectStore(STORES.MEDIA_LRU, {
            keyPath: "cacheKey",
          });
          store.createIndex("byLastUsed", "lastUsedAt");
        }
        if (!db.objectStoreNames.contains(STORES.REALTIME_CURSORS)) {
          db.createObjectStore(STORES.REALTIME_CURSORS, {
            keyPath: "channelKey",
          });
        }
        if (!db.objectStoreNames.contains(STORES.KV)) {
          db.createObjectStore(STORES.KV, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORES.TQ_PERSISTER)) {
          db.createObjectStore(STORES.TQ_PERSISTER);
        }
      },
    });
  }
  return _dbPromise;
}

/**
 * Compose a snapshot composite key. Exposed because outbox/snapshot writers
 * need to share the same shape.
 */
export function snapshotKey(
  ownerUserId: string,
  entityType: string,
  entityId: string,
): string {
  return `${ownerUserId}:${entityType}:${entityId}`;
}

export type OfflineStoreName = (typeof STORES)[keyof typeof STORES];
