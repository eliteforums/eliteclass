/**
 * Centralized query key factories and stale time configuration.
 *
 * Categories:
 * - institute: Rarely-changing institute-level data (5 min)
 * - realtime: User-specific frequently-changing data (30s)
 * - standard: Default for most queries (1 min)
 * - static: Reference data that almost never changes (10 min)
 *
 * gcTime is always set higher than staleTime to preserve cache across remounts.
 */

// ---------------------------------------------------------------------------
// Stale Times (ms)
// ---------------------------------------------------------------------------

export const staleTimes = {
  /** Institute-level data that rarely changes (config, batches, courses, staff) */
  institute: 300_000, // 5 minutes
  /** User-specific real-time data (attendance, notifications, exam status) */
  realtime: 30_000, // 30 seconds
  /** Default for most queries */
  standard: 60_000, // 1 minute
  /** Static reference data (fee structures, academic years, enums) */
  static: 600_000, // 10 minutes
} as const;

// ---------------------------------------------------------------------------
// Garbage Collection Times (ms) — always > staleTime
// ---------------------------------------------------------------------------

export const gcTimes = {
  /** For institute-level queries */
  institute: 600_000, // 10 minutes
  /** For realtime queries */
  realtime: 120_000, // 2 minutes
  /** Default gc time */
  standard: 300_000, // 5 minutes
  /** For static reference data */
  static: 1_800_000, // 30 minutes
} as const;

// ---------------------------------------------------------------------------
// Query Key Factories
// ---------------------------------------------------------------------------

export const queryKeys = {
  institute: {
    config: (id: string) => ["institute", "config", id] as const,
    batches: (id: string) => ["institute", "batches", id] as const,
    courses: (id: string) => ["institute", "courses", id] as const,
    staff: (id: string) => ["institute", "staff", id] as const,
    feeStructures: (id: string) => ["institute", "feeStructures", id] as const,
    academicYears: (id: string) => ["institute", "academicYears", id] as const,
  },
  students: {
    list: (instituteId: string, filters?: unknown) =>
      ["students", "list", instituteId, filters] as const,
    infinite: (instituteId: string, filters?: unknown) =>
      ["students", "infinite", instituteId, filters] as const,
    detail: (id: string) => ["students", "detail", id] as const,
    dashboard: (userId: string) => ["students", "dashboard", userId] as const,
  },
  attendance: {
    list: (batchId: string, date?: string) =>
      ["attendance", "list", batchId, date] as const,
    summary: (studentId: string) =>
      ["attendance", "summary", studentId] as const,
  },
  notifications: {
    list: (userId: string) => ["notifications", "list", userId] as const,
    unread: (userId: string) => ["notifications", "unread", userId] as const,
  },
  exams: {
    list: (instituteId: string) => ["exams", "list", instituteId] as const,
    detail: (examId: string) => ["exams", "detail", examId] as const,
    status: (examId: string, studentId: string) =>
      ["exams", "status", examId, studentId] as const,
  },
  fees: {
    structures: (instituteId: string) =>
      ["fees", "structures", instituteId] as const,
    payments: (studentId: string) =>
      ["fees", "payments", studentId] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Query Options Helpers
// ---------------------------------------------------------------------------

/** Returns staleTime + gcTime for institute-level queries */
export function instituteQueryOptions() {
  return {
    staleTime: staleTimes.institute,
    gcTime: gcTimes.institute,
  } as const;
}

/** Returns staleTime + gcTime for realtime/user-specific queries */
export function realtimeQueryOptions() {
  return {
    staleTime: staleTimes.realtime,
    gcTime: gcTimes.realtime,
  } as const;
}

/** Returns staleTime + gcTime for standard queries */
export function standardQueryOptions() {
  return {
    staleTime: staleTimes.standard,
    gcTime: gcTimes.standard,
  } as const;
}

/** Returns staleTime + gcTime for static reference data queries */
export function staticQueryOptions() {
  return {
    staleTime: staleTimes.static,
    gcTime: gcTimes.static,
  } as const;
}

// ---------------------------------------------------------------------------
// Offline-First Query Categories (exam-reattempts-and-offline-caching spec)
//
// New category constants and timing maps introduced for the offline-first
// caching rollout. The legacy `staleTimes`/`gcTimes` and *QueryOptions()
// helpers above are preserved untouched — these are additive.
//
// Boundaries match Req 8:
//   live    — staleTime ≤ 30s
//   lists   — staleTime ≥ 5 min, gcTime ≥ 1 hour
//   catalog — staleTime ≥ 1 hour, gcTime ≥ 24 hours
//   default — staleTime ≥ 60s, gcTime ≥ 30 min
// ---------------------------------------------------------------------------

export const QUERY_CATEGORIES = {
  LIVE: "live",
  LISTS: "lists",
  CATALOG: "catalog",
  DEFAULT: "default",
} as const;

export type QueryCategory =
  (typeof QUERY_CATEGORIES)[keyof typeof QUERY_CATEGORIES];

export const STALE_TIMES: Record<QueryCategory, number> = {
  live: 30_000, // 30s — Req 8.2
  lists: 5 * 60_000, // 5 min — Req 8.3
  catalog: 60 * 60_000, // 1 h — Req 8.4
  default: 60_000, // 60s — Req 8.1
};

export const GC_TIMES: Record<QueryCategory, number> = {
  live: 5 * 60_000, // 5 min
  lists: 60 * 60_000, // 1 h — Req 8.3
  catalog: 24 * 60 * 60_000, // 24 h — Req 8.4
  default: 30 * 60_000, // 30 min — Req 8.1
};

export interface CategoryConfig {
  staleTime: number;
  gcTime: number;
}

/**
 * Returns `{ staleTime, gcTime }` for the given category. Falls back to
 * `default` and warns once if an unknown category name is passed (Req 8.6).
 *
 * Usage:
 *
 *   useQuery({
 *     queryKey: queryKeys.students.list(id),
 *     queryFn: () => listStudents(id),
 *     ...getCategoryConfig("lists"),
 *   });
 */
const _warnedCategories = new Set<string>();
export function getCategoryConfig(
  category: QueryCategory | string | undefined,
): CategoryConfig {
  if (category && (category as QueryCategory) in STALE_TIMES) {
    const cat = category as QueryCategory;
    return { staleTime: STALE_TIMES[cat], gcTime: GC_TIMES[cat] };
  }
  if (category && !_warnedCategories.has(category)) {
    _warnedCategories.add(category);
    if (typeof console !== "undefined") {
      // Single warning per unknown category.
      console.warn(
        `[queryClient] unknown query category "${category}", falling back to "default"`,
      );
    }
  }
  return { staleTime: STALE_TIMES.default, gcTime: GC_TIMES.default };
}
