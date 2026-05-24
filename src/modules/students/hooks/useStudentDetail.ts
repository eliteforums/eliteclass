// ---------------------------------------------------------------------------
// EduOS — useStudentDetail
//
// Aggregates all data needed to render the full student detail page.
// Fires five parallel requests on mount so the page shows all sections
// as soon as each stream of data resolves — nothing blocks on the others.
//
// Requests fired in parallel:
//   1. getStudentById       → student profile + joined user
//   2. getStudentHistory    → audit trail entries
//   3. getStudentPromotions → lifecycle promotion records
//   4. getStudentDocuments  → uploaded document metadata
//   5. getBatchesByInstitute → available batches (for LifecycleActionModal)
//
// Individual loading flags (isLoadingStudent, isLoadingHistory, …) let the
// UI progressively reveal each section as its data arrives, rather than
// waiting for all five to complete before rendering anything.
//
// Usage:
//   const { student, history, promotions, documents, batches,
//           isLoadingStudent, isLoadingHistory, refreshStudent, fetchAll }
//     = useStudentDetail({ studentId, instituteId })
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import {
  getStudentById,
  getStudentHistory,
  getStudentPromotions,
  getStudentDocuments,
} from "@/services/student.service";
import { getBatchesByInstitute } from "@/services/batch.service";
import type { Student, StudentHistory, StudentPromotion, StudentDocument, Batch } from "@/types";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseStudentDetailOptions {
  /** The `students.id` PK to fetch. Pass `null` to skip fetching. */
  studentId: string | null;
  /** The institute scope for batch lookups. Pass `null` to skip. */
  instituteId: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * `useStudentDetail` — aggregated data hook for the student detail page.
 *
 * All five requests run in parallel via a single `Promise.all` call.
 * The student fetch is treated as critical: if it fails, `studentError` is
 * set.  The other four fetches are soft-dependencies — their failures are
 * logged as warnings but do not block the student card from rendering.
 *
 * Pass `null` for either `studentId` or `instituteId` to idle the hook
 * (useful when IDs are derived from async auth that hasn't resolved yet).
 */
export function useStudentDetail({ studentId, instituteId }: UseStudentDetailOptions) {
  // ── State ──────────────────────────────────────────────────────────────────

  const [student, setStudent] = useState<Student | null>(null);
  const [history, setHistory] = useState<StudentHistory[]>([]);
  const [promotions, setPromotions] = useState<StudentPromotion[]>([]);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  // Granular loading flags — each resolves independently.
  const [isLoadingStudent, setIsLoadingStudent] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPromotions, setIsLoadingPromotions] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  // Only the student fetch is considered fatal.
  const [studentError, setStudentError] = useState<string | null>(null);

  // ── refreshStudent ─────────────────────────────────────────────────────────

  /**
   * Re-fetch only the student profile.
   * Call this after a lifecycle action or remark to get the latest status
   * without reloading history/promotions/documents/batches.
   */
  const refreshStudent = useCallback(async () => {
    if (!studentId) return;

    setIsLoadingStudent(true);
    setStudentError(null);

    const result = await getStudentById(studentId);

    if (result.success && result.data) {
      setStudent(result.data);
    } else {
      setStudentError(result.error ?? "Failed to reload student profile.");
    }

    setIsLoadingStudent(false);
  }, [studentId]);

  // ── fetchAll ───────────────────────────────────────────────────────────────

  /**
   * Fire all five data requests in parallel and update state as each resolves.
   *
   * Using individual `setIsLoading*` calls before `Promise.all` ensures the
   * UI immediately shows spinners/skeletons for every section.
   */
  const fetchAll = useCallback(async () => {
    if (!studentId || !instituteId) return;

    // Raise all five loading flags at once — no sequential dependency.
    setIsLoadingStudent(true);
    setIsLoadingHistory(true);
    setIsLoadingPromotions(true);
    setIsLoadingDocuments(true);
    setIsLoadingBatches(true);
    setStudentError(null);

    const [studentResult, historyResult, promotionsResult, documentsResult, batchesResult] =
      await Promise.all([
        getStudentById(studentId),
        getStudentHistory(studentId),
        getStudentPromotions(studentId),
        getStudentDocuments(studentId),
        getBatchesByInstitute(instituteId),
      ]);

    // ── Student (critical) ─────────────────────────────────────────────────
    if (studentResult.success && studentResult.data) {
      setStudent(studentResult.data);
    } else {
      setStudentError(studentResult.error ?? "Failed to load student profile.");
    }
    setIsLoadingStudent(false);

    // ── History (soft dependency) ──────────────────────────────────────────
    if (historyResult.success && historyResult.data) {
      setHistory(historyResult.data);
    } else {
      console.warn("[useStudentDetail] Failed to load history:", historyResult.error);
      setHistory([]);
    }
    setIsLoadingHistory(false);

    // ── Promotions (soft dependency) ───────────────────────────────────────
    if (promotionsResult.success && promotionsResult.data) {
      setPromotions(promotionsResult.data);
    } else {
      console.warn("[useStudentDetail] Failed to load promotions:", promotionsResult.error);
      setPromotions([]);
    }
    setIsLoadingPromotions(false);

    // ── Documents (soft dependency) ────────────────────────────────────────
    if (documentsResult.success && documentsResult.data) {
      setDocuments(documentsResult.data);
    } else {
      console.warn("[useStudentDetail] Failed to load documents:", documentsResult.error);
      setDocuments([]);
    }
    setIsLoadingDocuments(false);

    // ── Batches (soft dependency) ──────────────────────────────────────────
    if (batchesResult.success && batchesResult.data) {
      setBatches(batchesResult.data.items);
    } else {
      console.warn("[useStudentDetail] Failed to load batches:", batchesResult.error);
      setBatches([]);
    }
    setIsLoadingBatches(false);
  }, [studentId, instituteId]);

  // ── Auto-fetch on mount / ID changes ──────────────────────────────────────

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    // ── Data ────────────────────────────────────────────────────────────────
    /** The fetched student record (includes joined `user`). `null` while loading or on error. */
    student,
    /** Full audit-trail entries from `student_history`. */
    history,
    /** Lifecycle promotion records from `student_promotions`. */
    promotions,
    /** Document metadata rows from `student_documents`. */
    documents,
    /** Active batches for the institute — used to populate the transfer selector. */
    batches,

    // ── Loading flags ────────────────────────────────────────────────────────
    /** `true` while the student profile fetch is in-flight. */
    isLoadingStudent,
    /** `true` while the history fetch is in-flight. */
    isLoadingHistory,
    /** `true` while the promotions fetch is in-flight. */
    isLoadingPromotions,
    /** `true` while the documents fetch is in-flight. */
    isLoadingDocuments,
    /** `true` while the batches fetch is in-flight. */
    isLoadingBatches,

    // ── Errors ───────────────────────────────────────────────────────────────
    /** Non-null when the student fetch failed. Soft-dependency errors are only logged. */
    studentError,

    // ── Actions ──────────────────────────────────────────────────────────────
    /** Re-fetch only the student profile (after a status change, remark, etc.). */
    refreshStudent,
    /** Re-fetch all five data sources in parallel. */
    fetchAll,
  };
}
