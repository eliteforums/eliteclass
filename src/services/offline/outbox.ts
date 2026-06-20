// ---------------------------------------------------------------------------
// Sync Outbox — IndexedDB-backed mutation queue
// ---------------------------------------------------------------------------
//
// Every offline-aware mutation enqueues an entry here through
// `useOfflineMutation`. A drain loop (foreground for no-SW path, Background
// Sync for the SW path) replays each entry against the network.
//
// Behavior contract (see `design.md` Property 14–21, requirements 13.1–13.8):
//   * `enqueue` is async-safe and returns the persisted entry.
//   * `peekDue(now)` returns rows whose `nextAttemptAt <= now` and status
//     is "pending".
//   * `markRetry` applies an exponential backoff:
//        delay = min(300_000, 2_000 * 2^(attempts-1))
//     and bumps `attempts`. After 8 failed attempts the entry is moved to
//     the dead-letter store via `markDead`.
//   * `markSuccess` removes the entry and signals the drainSignal.
//   * `purgeForUser` clears every row owned by the given user (sign-out).
// ---------------------------------------------------------------------------

import { offlineDb, STORES, type OutboxRow } from "./db";

export type OutboxOp = OutboxRow["method"];

export interface EnqueueArgs {
  ownerUserId: string;
  url: string;
  method: OutboxOp;
  body: unknown;
  headers?: Record<string, string>;
  entityType: string;
  entityId: string | null;
  optimisticId?: string | null;
  baseUpdatedAt?: string | null;
  invalidates: ReadonlyArray<readonly unknown[]>;
}

export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes

export const drainSignal = new EventTarget();

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function computeBackoffMs(attempts: number): number {
  // attempts === 1 means we just failed once; first retry waits 2s.
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
}

function emitChange() {
  try {
    drainSignal.dispatchEvent(new Event("change"));
  } catch {
    // ignore in environments without DOM Event
  }
}

export async function enqueue(args: EnqueueArgs): Promise<OutboxRow> {
  const db = await offlineDb();
  const now = new Date().toISOString();
  const row: OutboxRow = {
    id: uuid(),
    ownerUserId: args.ownerUserId,
    url: args.url,
    method: args.method,
    body: args.body,
    headers: args.headers ?? {},
    entityType: args.entityType,
    entityId: args.entityId,
    optimisticId: args.optimisticId ?? null,
    baseUpdatedAt: args.baseUpdatedAt ?? null,
    invalidates: args.invalidates,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now, // immediately due
    status: "pending",
    lastError: null,
  };
  await db.put(STORES.OUTBOX, row);
  emitChange();
  return row;
}

export async function peekDue(
  ownerUserId: string,
  now: number = Date.now(),
  limit = 25,
): Promise<OutboxRow[]> {
  const db = await offlineDb();
  const rows = (await db.getAllFromIndex(
    STORES.OUTBOX,
    "byOwner",
    ownerUserId,
  )) as OutboxRow[];
  const dueIso = new Date(now).toISOString();
  return rows
    .filter((r) => r.status === "pending" && r.nextAttemptAt <= dueIso)
    .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
    .slice(0, limit);
}

export async function markInFlight(id: string): Promise<void> {
  const db = await offlineDb();
  const row = await db.get(STORES.OUTBOX, id);
  if (!row) return;
  row.status = "in_flight";
  await db.put(STORES.OUTBOX, row);
}

export async function markSuccess(id: string): Promise<void> {
  const db = await offlineDb();
  await db.delete(STORES.OUTBOX, id);
  emitChange();
}

export async function markRetry(id: string, error: string): Promise<void> {
  const db = await offlineDb();
  const row = await db.get(STORES.OUTBOX, id);
  if (!row) return;
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await markDead(id, error);
    return;
  }
  row.attempts = attempts;
  row.lastError = error;
  row.status = "pending";
  row.nextAttemptAt = new Date(
    Date.now() + computeBackoffMs(attempts),
  ).toISOString();
  await db.put(STORES.OUTBOX, row);
  emitChange();
}

export async function markDead(id: string, error: string): Promise<void> {
  const db = await offlineDb();
  const row = await db.get(STORES.OUTBOX, id);
  if (!row) return;
  row.status = "dead";
  row.lastError = error;
  const tx = db.transaction([STORES.OUTBOX, STORES.DEAD_LETTER], "readwrite");
  await tx.objectStore(STORES.DEAD_LETTER).put(row);
  await tx.objectStore(STORES.OUTBOX).delete(id);
  await tx.done;
  emitChange();
}

export async function retry(id: string): Promise<void> {
  const db = await offlineDb();
  const row = await db.get(STORES.OUTBOX, id);
  if (!row) return;
  // Reset attempts so the user-triggered retry actually fires immediately.
  row.attempts = 0;
  row.lastError = null;
  row.status = "pending";
  row.nextAttemptAt = new Date().toISOString();
  await db.put(STORES.OUTBOX, row);
  emitChange();
}

export async function discard(id: string): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction([STORES.OUTBOX, STORES.DEAD_LETTER], "readwrite");
  await tx.objectStore(STORES.OUTBOX).delete(id);
  await tx.objectStore(STORES.DEAD_LETTER).delete(id);
  await tx.done;
  emitChange();
}

export interface OutboxCounts {
  pending: number;
  dead: number;
}

export async function count(ownerUserId: string): Promise<OutboxCounts> {
  const db = await offlineDb();
  const [pending, dead] = await Promise.all([
    db.getAllFromIndex(STORES.OUTBOX, "byOwner", ownerUserId),
    db.getAllFromIndex(STORES.DEAD_LETTER, "byOwner", ownerUserId),
  ]);
  return { pending: pending.length, dead: dead.length };
}

export async function listForOwner(
  ownerUserId: string,
): Promise<{ pending: OutboxRow[]; dead: OutboxRow[] }> {
  const db = await offlineDb();
  const [pending, dead] = await Promise.all([
    db.getAllFromIndex(STORES.OUTBOX, "byOwner", ownerUserId),
    db.getAllFromIndex(STORES.DEAD_LETTER, "byOwner", ownerUserId),
  ]);
  return {
    pending: (pending as OutboxRow[]).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
    dead: (dead as OutboxRow[]).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}

export async function purgeForUser(ownerUserId: string): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction([STORES.OUTBOX, STORES.DEAD_LETTER], "readwrite");
  for (const storeName of [STORES.OUTBOX, STORES.DEAD_LETTER] as const) {
    const store = tx.objectStore(storeName);
    const rows = (await store
      .index("byOwner")
      .getAllKeys(ownerUserId)) as string[];
    for (const key of rows) {
      await store.delete(key);
    }
  }
  await tx.done;
  emitChange();
}

// Exposed for unit tests.
export const __internal = { computeBackoffMs };
