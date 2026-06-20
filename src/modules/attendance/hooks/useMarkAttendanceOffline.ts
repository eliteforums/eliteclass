// ---------------------------------------------------------------------------
// useMarkAttendanceOffline — single-row attendance mark routed through
// the Sync Outbox so teachers can mark a student offline.
// ---------------------------------------------------------------------------
//
// Flow (mirrors `attendance.service#markAttendance`):
//   POST {SUPABASE_URL}/rest/v1/attendance_records?on_conflict=session_id,student_id
//        Prefer: resolution=merge-duplicates,return=representation
//        body: { session_id, student_id, status, institute_id, batch_id?,
//                notes?, marked_by, marked_at }
//
// Online: enqueue → drainOutbox runs immediately → row hits the server in
// well under a second.
//
// Offline: enqueue → optimistic snapshot flips the row → background drain
// fires when the network returns (or when the SW Background Sync handler
// in Phase G picks it up).
//
// The optimistic id is stable: `${sessionId}:${studentId}` so repeated
// marks for the same row update the same snapshot entry rather than
// piling up.
// ---------------------------------------------------------------------------

import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { upsertOne } from "@/services/offline/snapshots";
import { useAuthStore } from "@/store/authStore";
import type { AttendanceStatus } from "@/types";

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;

export interface MarkAttendanceVars {
  /** attendance_sessions.id */
  sessionId: string;
  /** students.id */
  studentId: string;
  status: AttendanceStatus;
  instituteId: string;
  batchId?: string | null;
  notes?: string | null;
  /** users.id of the teacher/admin marking attendance. */
  markedBy: string;
}

/**
 * Compose the deterministic key used for the outbox `entityId` and the
 * snapshot row. Exposed for tests / per-row "queued" badge selectors.
 */
export function attendanceOptimisticId(
  sessionId: string,
  studentId: string,
): string {
  return `${sessionId}:${studentId}`;
}

export function useMarkAttendanceOffline() {
  return useOfflineMutation<MarkAttendanceVars>({
    toRequest: (vars) => ({
      url: `${SUPABASE_URL ?? ""}/rest/v1/attendance_records?on_conflict=session_id,student_id`,
      method: "POST",
      body: {
        session_id: vars.sessionId,
        student_id: vars.studentId,
        status: vars.status,
        institute_id: vars.instituteId,
        batch_id: vars.batchId ?? null,
        notes: vars.notes ?? null,
        marked_by: vars.markedBy,
        marked_at: new Date().toISOString(),
      },
    }),
    // PostgREST needs `Prefer: resolution=merge-duplicates` for upserts; the
    // replay loop already supplies Authorization / apikey / Content-Type and
    // a default `Prefer: return=representation`. We override Prefer here so
    // both directives apply.
    extraHeaders: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    entityType: "attendance_records",
    entityId: (vars) => attendanceOptimisticId(vars.sessionId, vars.studentId),
    invalidates: (vars) => [
      // Any cached attendance list refetches; keys live under
      // `["attendance", "list", batchId, date]`.
      ["attendance", "list"],
      ["attendance", "summary", vars.studentId],
      ["attendance", "session", vars.sessionId],
    ],
    optimisticUpdate: (_qc, vars) => {
      const ownerUserId = useAuthStore.getState().user?.id ?? "anon";
      const id = attendanceOptimisticId(vars.sessionId, vars.studentId);
      void upsertOne(
        "attendance_records",
        {
          id,
          session_id: vars.sessionId,
          student_id: vars.studentId,
          institute_id: vars.instituteId,
          batch_id: vars.batchId ?? null,
          status: vars.status,
          notes: vars.notes ?? null,
          marked_by: vars.markedBy,
          marked_at: new Date().toISOString(),
        },
        ownerUserId,
        "optimistic",
      ).catch(() => {
        // Optimistic snapshot writes are best-effort; failures here must not
        // block the outbox enqueue.
      });
    },
  });
}
