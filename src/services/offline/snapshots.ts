// ---------------------------------------------------------------------------
// Read Snapshot Cache — normalized entity store for offline detail views
// ---------------------------------------------------------------------------
//
// List queries call `upsertList(entityType, rows, ownerUserId)` to seed
// per-entity snapshots; detail queries fall back to `getOne` when offline
// or when the React Query cache has been evicted (Req 12).
//
// Every key embeds `ownerUserId` so cross-user reads are impossible.
// ---------------------------------------------------------------------------

import {
  offlineDb,
  STORES,
  snapshotKey,
  type SnapshotRow,
} from "./db";

export type SnapshotSource = SnapshotRow["source"];

export async function upsertList<T extends { id: string }>(
  entityType: string,
  rows: ReadonlyArray<T>,
  ownerUserId: string,
): Promise<void> {
  if (rows.length === 0) return;
  const db = await offlineDb();
  const now = new Date().toISOString();
  const tx = db.transaction(STORES.SNAPSHOTS, "readwrite");
  for (const row of rows) {
    const key = snapshotKey(ownerUserId, entityType, String(row.id));
    await tx.store.put({
      key,
      ownerUserId,
      entityType,
      entityId: String(row.id),
      payload: row,
      fetchedAt: now,
      source: "list",
    } satisfies SnapshotRow);
  }
  await tx.done;
}

export async function upsertOne<T extends { id: string }>(
  entityType: string,
  row: T,
  ownerUserId: string,
  source: SnapshotSource = "detail",
): Promise<void> {
  const db = await offlineDb();
  const key = snapshotKey(ownerUserId, entityType, String(row.id));
  await db.put(STORES.SNAPSHOTS, {
    key,
    ownerUserId,
    entityType,
    entityId: String(row.id),
    payload: row,
    fetchedAt: new Date().toISOString(),
    source,
  } satisfies SnapshotRow);
}

export async function getOne<T = unknown>(
  entityType: string,
  id: string,
  ownerUserId: string,
): Promise<T | null> {
  const db = await offlineDb();
  const key = snapshotKey(ownerUserId, entityType, id);
  const row = await db.get(STORES.SNAPSHOTS, key);
  return (row?.payload as T | undefined) ?? null;
}

export async function getMany<T = unknown>(
  entityType: string,
  ownerUserId: string,
): Promise<T[]> {
  const db = await offlineDb();
  const all = (await db.getAllFromIndex(
    STORES.SNAPSHOTS,
    "byEntityType",
    entityType,
  )) as SnapshotRow[];
  return all
    .filter((r) => r.ownerUserId === ownerUserId)
    .map((r) => r.payload as T);
}

export async function purgeForUser(ownerUserId: string): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction(STORES.SNAPSHOTS, "readwrite");
  const keys = (await tx.store
    .index("byOwner")
    .getAllKeys(ownerUserId)) as string[];
  for (const key of keys) {
    await tx.store.delete(key);
  }
  await tx.done;
}
