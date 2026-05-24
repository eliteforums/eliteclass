import type { AttendanceSession } from "@/types";

/**
 * Resolve batch UUID for an attendance session.
 * List queries embed `batch:batches(id, name)` but may omit the `batch_id` column
 * from the select — use nested batch.id as fallback.
 */
export function resolveSessionBatchId(session: AttendanceSession): string | null {
  return session.batch_id ?? session.batch?.id ?? null;
}
