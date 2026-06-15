/**
 * useExamCache Hook
 *
 * React hook that manages local caching for exam data and answers.
 *
 * Key behaviors:
 * - All exam data is loaded ONCE and cached in memory + localStorage
 * - Answers are stored LOCALLY — no DB write per answer
 * - On submit, all answers are batch-saved in a SINGLE DB call
 * - Crash recovery via localStorage on page refresh
 *
 * This reduces DB calls from ~N per exam (one per answer) to just a few:
 *   1. Fetch exam data (once)
 *   2. Start attempt (once)
 *   3. Batch save all answers (once at submit)
 *   4. Submit attempt (once)
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { examCache, buildBatchAnswerPayload } from "../services/examCache.service";
import { examLogger } from "../services/examLogger";
import { batchSaveAnswers } from "../services/exam.service";
import type { Exam } from "../types";

interface UseExamCacheProps {
  attemptId: string;
  examId: string;
  studentId: string;
  instituteId: string;
  exam: Exam | null;
}

interface UseExamCacheReturn {
  /** Get answers from local cache (NOT from DB) */
  answers: Record<string, string>;
  /** Store an answer locally (does NOT hit DB) */
  storeAnswer: (questionId: string, optionId: string) => void;
  /** Get the current question index */
  currentQuestionIdx: number;
  /** Save current question index */
  saveQuestionIndex: (idx: number) => void;
  /** Save time remaining for crash recovery */
  saveTimeRemaining: (seconds: number) => void;
  /** Batch-save ALL answers to DB (call on submit) */
  syncAnswersToDb: () => Promise<{ success: boolean; error?: string }>;
  /** Check if there's a cache for this attempt */
  hasCache: boolean;
  /** Check if sync is in progress */
  isSyncing: boolean;
  /** Initialize cache with existing data */
  initializeCache: (existingAnswers?: Record<string, string>) => void;
  /** Get cache statistics */
  getCacheStats: () => {
    totalAnswered: number;
    totalQuestions: number;
    percentComplete: number;
    isCacheReady: boolean;
  };
}

export function useExamCache({
  attemptId,
  examId,
  studentId,
  instituteId,
  exam,
}: UseExamCacheProps): UseExamCacheReturn {
  // State for re-rendering when answers change
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasCache, setHasCache] = useState(false);

  // Refs to avoid stale closures
  const attemptIdRef = useRef(attemptId);
  const initializedRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // ── Exam Data Caching ──────────────────────────────────────────────────────

  /** Cache exam data when it becomes available */
  useEffect(() => {
    if (exam && examId) {
      examCache.storeExamData(examId, exam);
      examLogger.cache("Exam data cached in hook", { examId, questionCount: exam.questions?.length || 0 });
    }
  }, [exam, examId]);

  // ── Cache Initialization ───────────────────────────────────────────────────

  const initializeCache = useCallback(
    (existingAnswers?: Record<string, string>) => {
      if (initializedRef.current) return;

      // Check for existing cache (e.g., after page refresh)
      const existingCache = examCache.getAttemptCache(attemptId);

      if (existingCache) {
        // Restore from cache
        setAnswers(existingCache.answers);
        setCurrentQuestionIdx(existingCache.currentQuestionIdx);
        setHasCache(true);
        initializedRef.current = true;
        examLogger.info("CacheHook", "Restored from existing cache", {
          attemptId,
          answerCount: Object.keys(existingCache.answers).length,
        });
      } else {
        // Initialize new cache
        examCache.initAttemptCache(attemptId, examId, studentId, instituteId, existingAnswers);
        if (existingAnswers) {
          setAnswers(existingAnswers);
        }
        setHasCache(true);
        initializedRef.current = true;
        examLogger.info("CacheHook", "Initialized new cache", { attemptId, examId });
      }
    },
    [attemptId, examId, studentId, instituteId],
  );

  // ── Answer Management (LOCAL ONLY) ─────────────────────────────────────────

  const storeAnswer = useCallback(
    (questionId: string, optionId: string) => {
      // Store in cache service (memory + localStorage)
      examCache.storeAnswer(attemptIdRef.current, questionId, optionId);

      // Update React state for UI re-render
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: optionId };
        examLogger.debug("CacheHook", "Answer state updated", {
          questionId,
          totalAnswered: Object.keys(next).length,
        });
        return next;
      });
    },
    [],
  );

  // ── Question Navigation ────────────────────────────────────────────────────

  const saveQuestionIndex = useCallback((idx: number) => {
    setCurrentQuestionIdx(idx);
    examCache.saveQuestionIndex(attemptIdRef.current, idx);
    examLogger.debug("CacheHook", "Question index saved", { idx });
  }, []);

  // ── Timer Persistence ──────────────────────────────────────────────────────

  const saveTimeRemaining = useCallback((seconds: number) => {
    examCache.saveTimeRemaining(attemptIdRef.current, seconds);
  }, []);

  // ── Batch Sync to DB (SUBMIT TIME ONLY) ────────────────────────────────────

  const syncAnswersToDb = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsSyncing(true);
    examLogger.startTimer("batchSync");

    try {
      const localAnswers = examCache.getAnswers(attemptIdRef.current);
      const answeredAt = examCache.getAnsweredAt(attemptIdRef.current);
      const payload = buildBatchAnswerPayload(attemptIdRef.current, localAnswers, answeredAt);

      if (payload.length === 0) {
        examLogger.info("CacheHook", "No answers to sync");
        setIsSyncing(false);
        return { success: true };
      }

      examLogger.info("CacheHook", `Syncing ${payload.length} answers to DB`, {
        attemptId: attemptIdRef.current,
      });

      const result = await batchSaveAnswers(attemptIdRef.current, localAnswers);

      if (result.success) {
        examCache.markSubmitted(attemptIdRef.current);
        examLogger.endTimer("batchSync", "CacheHook", "Batch sync completed", {
          answerCount: payload.length,
        });
        return { success: true };
      } else {
        examLogger.error("CacheHook", "Batch sync failed", { error: result.error });
        return { success: false, error: result.error || "Failed to sync answers" };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      examLogger.error("CacheHook", "Batch sync error", { error: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // ── Statistics ─────────────────────────────────────────────────────────────

  const getCacheStats = useCallback(() => {
    const totalAnswered = Object.keys(answers).length;
    const totalQuestions = exam?.questions?.length || 0;
    return {
      totalAnswered,
      totalQuestions,
      percentComplete: totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0,
      isCacheReady: hasCache,
    };
  }, [answers, exam, hasCache]);

  return {
    answers,
    storeAnswer,
    currentQuestionIdx,
    saveQuestionIndex,
    saveTimeRemaining,
    syncAnswersToDb,
    hasCache,
    isSyncing,
    initializeCache,
    getCacheStats,
  };
}
