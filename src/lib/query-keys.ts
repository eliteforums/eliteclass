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
