/**
 * Exam Cache Service — Client-side caching to reduce Supabase DB usage
 *
 * Problem this solves:
 * - Supabase free tier can't handle 50 concurrent users making DB writes
 *   on every answer selection
 * - Each answer change = 1 DB upsert. 50 users × 50 questions = 2,500+ writes
 *
 * Solution:
 * - Load all exam data ONCE at start and cache in memory + localStorage
 * - Store ALL answers locally during the exam (never hit DB per-answer)
 * - On submit, batch-save all answers in a SINGLE DB call
 * - On crash/refresh, restore from localStorage
 *
 * Cache Structure (localStorage key: `eliteclass_exam_cache_${attemptId}`):
 * {
 *   attemptId: string,
 *   examId: string,
 *   studentId: string,
 *   instituteId: string,
 *   loadedAt: string (ISO),
 *   answers: Record<questionId, selectedOptionId>,
 *   answeredAt: Record<questionId, string (ISO)>,
 *   currentQuestionIdx: number,
 *   timeRemaining: number,
 *   lastSyncedAt: string | null,
 *   isSubmitted: boolean,
 * }
 */

import { examLogger } from "./examLogger";

const CACHE_PREFIX = "eliteclass_exam_cache";
const EXAM_DATA_PREFIX = "eliteclass_exam_data";

interface CachedExamState {
  attemptId: string;
  examId: string;
  studentId: string;
  instituteId: string;
  loadedAt: string;
  answers: Record<string, string>;
  answeredAt: Record<string, string>;
  currentQuestionIdx: number;
  timeRemaining: number;
  lastSyncedAt: string | null;
  isSubmitted: boolean;
  version: number;
}

interface CachedExamData {
  examId: string;
  exam: unknown;
  loadedAt: string;
  version: number;
}

const CACHE_VERSION = 1;

class ExamCacheService {
  private memoryCache: Map<string, CachedExamState> = new Map();
  private examDataCache: Map<string, CachedExamData> = new Map();

  // ── Cache Key Helpers ──────────────────────────────────────────────────────

  private getStateKey(attemptId: string): string {
    return `${CACHE_PREFIX}_${attemptId}`;
  }

  private getExamDataKey(examId: string): string {
    return `${EXAM_DATA_PREFIX}_${examId}`;
  }

  // ── Exam Data Caching (Questions, Options, etc.) ───────────────────────────

  /**
   * Store exam data (questions, options) in memory + localStorage.
   * Call this ONCE when exam starts — never fetch again during the exam.
   */
  storeExamData(examId: string, exam: unknown): void {
    const cacheEntry: CachedExamData = {
      examId,
      exam,
      loadedAt: new Date().toISOString(),
      version: CACHE_VERSION,
    };

    this.examDataCache.set(examId, cacheEntry);

    try {
      localStorage.setItem(this.getExamDataKey(examId), JSON.stringify(cacheEntry));
      examLogger.cache("Exam data stored", { examId, cacheSize: JSON.stringify(exam).length });
    } catch (e) {
      examLogger.warn("Cache", "Failed to persist exam data to localStorage", { error: String(e) });
    }
  }

  /**
   * Retrieve cached exam data. Returns null if not found.
   */
  getExamData(examId: string): unknown | null {
    // 1. Check memory first
    const memory = this.examDataCache.get(examId);
    if (memory) {
      examLogger.cache("Exam data retrieved from memory", { examId });
      return memory.exam;
    }

    // 2. Fallback to localStorage
    try {
      const stored = localStorage.getItem(this.getExamDataKey(examId));
      if (stored) {
        const parsed: CachedExamData = JSON.parse(stored);
        if (parsed.version === CACHE_VERSION) {
          // Restore to memory cache
          this.examDataCache.set(examId, parsed);
          examLogger.cache("Exam data restored from localStorage", { examId, age: Date.now() - new Date(parsed.loadedAt).getTime() });
          return parsed.exam;
        }
      }
    } catch (e) {
      examLogger.error("Cache", "Failed to parse cached exam data", { error: String(e) });
    }

    return null;
  }

  /**
   * Check if exam data is cached and valid.
   */
  hasExamData(examId: string): boolean {
    return this.getExamData(examId) !== null;
  }

  // ── Exam State Caching (Answers, Progress, etc.) ───────────────────────────

  /**
   * Initialize cache for a new exam attempt.
   * Call this once when the exam starts.
   */
  initAttemptCache(
    attemptId: string,
    examId: string,
    studentId: string,
    instituteId: string,
    existingAnswers?: Record<string, string>,
  ): CachedExamState {
    // Check for existing cache (resume after refresh)
    const existing = this.getAttemptCache(attemptId);
    if (existing) {
      examLogger.info("Cache", "Resuming from existing cache", { attemptId, answersCount: Object.keys(existing.answers).length });
      return existing;
    }

    const state: CachedExamState = {
      attemptId,
      examId,
      studentId,
      instituteId,
      loadedAt: new Date().toISOString(),
      answers: existingAnswers || {},
      answeredAt: {},
      currentQuestionIdx: 0,
      timeRemaining: 0,
      lastSyncedAt: null,
      isSubmitted: false,
      version: CACHE_VERSION,
    };

    this.memoryCache.set(attemptId, state);
    this.persistAttemptCache(attemptId);

    examLogger.info("Cache", "Initialized new attempt cache", { attemptId, examId, studentId });
    return state;
  }

  /**
   * Get cached exam state for an attempt.
   */
  getAttemptCache(attemptId: string): CachedExamState | null {
    // 1. Check memory first
    const memory = this.memoryCache.get(attemptId);
    if (memory) return memory;

    // 2. Fallback to localStorage
    try {
      const stored = localStorage.getItem(this.getStateKey(attemptId));
      if (stored) {
        const parsed: CachedExamState = JSON.parse(stored);
        if (parsed.version === CACHE_VERSION && !parsed.isSubmitted) {
          // Restore to memory cache
          this.memoryCache.set(attemptId, parsed);
          examLogger.cache("Attempt state restored from localStorage", { attemptId, answersCount: Object.keys(parsed.answers).length });
          return parsed;
        }
      }
    } catch (e) {
      examLogger.error("Cache", "Failed to parse cached attempt state", { error: String(e) });
    }

    return null;
  }

  /**
   * Store an answer locally. This NEVER hits the database.
   * The answer is only saved to memory + localStorage.
   */
  storeAnswer(attemptId: string, questionId: string, optionId: string): void {
    const state = this.memoryCache.get(attemptId);
    if (!state) {
      examLogger.warn("Cache", "No cache found for attempt when storing answer", { attemptId });
      return;
    }

    state.answers[questionId] = optionId;
    state.answeredAt[questionId] = new Date().toISOString();

    // Persist to localStorage for crash recovery
    this.persistAttemptCache(attemptId);

    examLogger.cache("Answer stored locally", { attemptId, questionId, totalAnswered: Object.keys(state.answers).length });
  }

  /**
   * Get all locally stored answers for an attempt.
   */
  getAnswers(attemptId: string): Record<string, string> {
    const state = this.memoryCache.get(attemptId);
    if (state) return { ...state.answers };

    const fromStorage = this.getAttemptCache(attemptId);
    return fromStorage ? { ...fromStorage.answers } : {};
  }

  /**
   * Get the answered timestamp for a question.
   */
  getAnsweredAt(attemptId: string): Record<string, string> {
    const state = this.memoryCache.get(attemptId);
    if (state) return { ...state.answeredAt };

    const fromStorage = this.getAttemptCache(attemptId);
    return fromStorage ? { ...fromStorage.answeredAt } : {};
  }

  /**
   * Save the current question index for navigation.
   */
  saveQuestionIndex(attemptId: string, idx: number): void {
    const state = this.memoryCache.get(attemptId);
    if (state) {
      state.currentQuestionIdx = idx;
      this.persistAttemptCache(attemptId);
    }
  }

  /**
   * Get the last viewed question index.
   */
  getQuestionIndex(attemptId: string): number {
    const state = this.memoryCache.get(attemptId) || this.getAttemptCache(attemptId);
    return state?.currentQuestionIdx ?? 0;
  }

  /**
   * Save remaining time for crash recovery.
   */
  saveTimeRemaining(attemptId: string, seconds: number): void {
    const state = this.memoryCache.get(attemptId);
    if (state) {
      state.timeRemaining = seconds;
      // Throttle localStorage writes to once per 10 seconds
      const lastSave = (state as any)._lastTimeSave || 0;
      const now = Date.now();
      if (now - lastSave > 10000) {
        (state as any)._lastTimeSave = now;
        this.persistAttemptCache(attemptId);
      }
    }
  }

  /**
   * Get saved time remaining.
   */
  getTimeRemaining(attemptId: string): number {
    const state = this.memoryCache.get(attemptId) || this.getAttemptCache(attemptId);
    return state?.timeRemaining ?? 0;
  }

  /**
   * Mark the attempt as submitted.
   */
  markSubmitted(attemptId: string): void {
    const state = this.memoryCache.get(attemptId);
    if (state) {
      state.isSubmitted = true;
      state.lastSyncedAt = new Date().toISOString();
      this.persistAttemptCache(attemptId);
    }
    this.clearAttemptCache(attemptId);
  }

  /**
   * Check if the attempt has been submitted.
   */
  isSubmitted(attemptId: string): boolean {
    const state = this.memoryCache.get(attemptId) || this.getAttemptCache(attemptId);
    return state?.isSubmitted ?? false;
  }

  /**
   * Persist attempt state to localStorage.
   */
  private persistAttemptCache(attemptId: string): void {
    const state = this.memoryCache.get(attemptId);
    if (!state) return;

    try {
      localStorage.setItem(this.getStateKey(attemptId), JSON.stringify(state));
    } catch (e) {
      examLogger.warn("Cache", "Failed to persist attempt cache", { error: String(e) });
    }
  }

  /**
   * Clear all cache for an attempt.
   */
  clearAttemptCache(attemptId: string): void {
    this.memoryCache.delete(attemptId);
    try {
      localStorage.removeItem(this.getStateKey(attemptId));
      examLogger.cache("Attempt cache cleared", { attemptId });
    } catch (e) {
      examLogger.warn("Cache", "Failed to clear attempt cache", { error: String(e) });
    }
  }

  /**
   * Clear exam data cache.
   */
  clearExamDataCache(examId: string): void {
    this.examDataCache.delete(examId);
    try {
      localStorage.removeItem(this.getExamDataKey(examId));
      examLogger.cache("Exam data cache cleared", { examId });
    } catch (e) {
      examLogger.warn("Cache", "Failed to clear exam data cache", { error: String(e) });
    }
  }

  // ── Full Cleanup ───────────────────────────────────────────────────────────

  /**
   * Clean up ALL exam caches for a student.
   * Call this after successful submission.
   */
  cleanupAllCaches(attemptId: string, examId: string): void {
    this.clearAttemptCache(attemptId);
    this.clearExamDataCache(examId);
    examLogger.info("Cache", "All caches cleaned up", { attemptId, examId });
  }

  /**
   * Get all active cache keys (for debugging).
   */
  getActiveCaches(): { attemptCaches: string[]; examDataCaches: string[] } {
    const attemptCaches: string[] = [];
    const examDataCaches: string[] = [];

    // From memory
    this.memoryCache.forEach((_, key) => attemptCaches.push(key));
    this.examDataCache.forEach((_, key) => examDataCaches.push(key));

    // From localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
          const id = key.replace(`${CACHE_PREFIX}_`, "");
          if (!attemptCaches.includes(id)) attemptCaches.push(id);
        }
        if (key?.startsWith(EXAM_DATA_PREFIX)) {
          const id = key.replace(`${EXAM_DATA_PREFIX}_`, "");
          if (!examDataCaches.includes(id)) examDataCaches.push(id);
        }
      }
    } catch {
      // Ignore
    }

    return { attemptCaches, examDataCaches };
  }

  /**
   * Print cache statistics (for debugging).
   */
  printStats() {
    const stats = this.getActiveCaches();
    const memoryEntries = this.memoryCache.size;
    const memoryExamData = this.examDataCache.size;
    examLogger.info("Cache", `Stats: ${memoryEntries} in-memory attempts, ${memoryExamData} in-memory exams, persisted: ${stats.attemptCaches.length} attempts, ${stats.examDataCaches.length} exams`);
  }
}

// Export singleton
export const examCache = new ExamCacheService();

// ── Convenience Types & Helpers ──────────────────────────────────────────────

export type { CachedExamState, CachedExamData };

/** Build the payload for batch answer submission */
export function buildBatchAnswerPayload(
  attemptId: string,
  answers: Record<string, string>,
  answeredAt: Record<string, string>,
): Array<{
  attempt_id: string;
  question_id: string;
  selected_option_id: string;
  answered_at: string;
}> {
  return Object.entries(answers)
    .filter(([, optionId]) => Boolean(optionId))
    .map(([questionId, optionId]) => ({
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: optionId,
      answered_at: answeredAt[questionId] || new Date().toISOString(),
    }));
}
