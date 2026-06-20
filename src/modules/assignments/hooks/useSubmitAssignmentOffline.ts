// ---------------------------------------------------------------------------
// useSubmitAssignmentOffline — student assignment submission routed through
// the Sync Outbox so a student can hit "Submit" while offline.
// ---------------------------------------------------------------------------
//
// Flow (mirrors `assignment.service#submitAssignment` for the row insert):
//   POST {SUPABASE_URL}/rest/v1/assignment_submissions
//        ?on_conflict=assignment_id,student_id
//        Prefer: resolution=merge-duplicates,return=representation
//        body: { assignment_id, student_id, institute_id,
//                content?, status, is_late, submitted_at }
//
// Online: enqueue → `drainOutbox` runs immediately → row hits the server in
// well under a second.
//
// Offline: enqueue → optimistic snapshot flips the local row to a "submitted
// (queued)" state → background drain fires when the network returns (or when
// the SW Background Sync handler in Phase G picks it up).
//
// Files (`submission_files`) are NOT handled here. Storage uploads require a
// connection (cannot be queued), and `submission_files.submission_id` only
// exists once the parent row hits the server, so multi-file submissions stay
// on the existing online `useSubmitAssignment` path. This hook covers the
// text / link only path which is the most common offline case.
//
// The optimistic id is stable: `${assignmentId}:${studentId}` so repeated
// submissions for the same row update the same snapshot entry rather than
// piling up.
// ---------------------------------------------------------------------------

import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { upsertOne } from "@/services/offline/snapshots";
import { useAuthStore } from "@/store/authStore";
import { assignmentKeys } from "./useAssignments";

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;

export interface SubmitAssignmentVars {
  /** assignments.id */
  assignmentId: string;
  /** students.id (the database PK on `students`, NOT the auth user id). */
  studentId: string;
  /** users.id of the submitting student — used for cache-key invalidation. */
  userId: string;
  /** institutes.id this submission belongs to. */
  instituteId: string;
  /** Optional free-form text or link the student is submitting. */
  content?: string | null;
  /** When TRUE the row is recorded as a late submission. */
  isLate?: boolean;
}

/**
 * Compose the deterministic key used for the outbox `entityId` and the
 * snapshot row. Exposed so per-row "queued" badges in Phase D can resolve
 * the same id without re-deriving the format.
 */
export function submissionOptimisticId(
  assignmentId: string,
  studentId: string,
): string {
  return `${assignmentId}:${studentId}`;
}

export function useSubmitAssignmentOffline() {
  return useOfflineMutation<SubmitAssignmentVars>({
    toRequest: (vars) => ({
      url: `${SUPABASE_URL ?? ""}/rest/v1/assignment_submissions?on_conflict=assignment_id,student_id`,
      method: "POST",
      body: {
        assignment_id: vars.assignmentId,
        student_id: vars.studentId,
        institute_id: vars.instituteId,
        content: vars.content ?? null,
        status: vars.isLate ? "late" : "submitted",
        is_late: vars.isLate ?? false,
        submitted_at: new Date().toISOString(),
      },
    }),
    // PostgREST needs `Prefer: resolution=merge-duplicates` for upserts; the
    // replay loop already supplies Authorization / apikey / Content-Type and
    // a default `Prefer: return=representation`. We override Prefer here so
    // both directives apply.
    extraHeaders: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    entityType: "assignment_submissions",
    entityId: (vars) => submissionOptimisticId(vars.assignmentId, vars.studentId),
    invalidates: (vars) => [
      // Match the keys defined in `assignmentKeys` so the student dashboard
      // and detail page refetch once the queued row drains successfully.
      assignmentKeys.studentList(vars.userId),
      assignmentKeys.studentDetail(vars.assignmentId, vars.userId),
      assignmentKeys.submissions(vars.assignmentId),
    ],
    optimisticUpdate: (_qc, vars) => {
      const ownerUserId = useAuthStore.getState().user?.id ?? "anon";
      const id = submissionOptimisticId(vars.assignmentId, vars.studentId);
      void upsertOne(
        "assignment_submissions",
        {
          id,
          assignment_id: vars.assignmentId,
          student_id: vars.studentId,
          institute_id: vars.instituteId,
          content: vars.content ?? null,
          status: vars.isLate ? "late" : "submitted",
          is_late: vars.isLate ?? false,
          submitted_at: new Date().toISOString(),
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
