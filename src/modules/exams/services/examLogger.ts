/**
 * Exam Logger — Centralized logging for exam operations
 *
 * Purpose:
 * - Track all DB operations to identify bottlenecks
 * - Monitor render cycles and question loading
 * - Provide verbose logging for debugging Supabase usage
 *
 * Usage:
 *   import { examLogger } from './examLogger';
 *   examLogger.info('Operation completed', { detail: 'value' });
 *   examLogger.db('Query executed', { table: 'exam_answers', count: 5 });
 *   examLogger.startTimer('loadQuestions');
 *   examLogger.endTimer('loadQuestions', 'Questions loaded');
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  elapsedMs?: number;
}

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  logToConsole: boolean;
  persistLogs: boolean;
  maxPersistedEntries: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const STORAGE_KEY = "eliteclass_exam_logs";
const PERF_KEY = "eliteclass_exam_perf";

class ExamLogger {
  private config: LoggerConfig = {
    enabled: true,
    level: (import.meta.env.VITE_EXAM_LOG_LEVEL as LogLevel) || "info",
    logToConsole: true,
    persistLogs: true,
    maxPersistedEntries: 500,
  };

  private timers: Map<string, number> = new Map();
  private operationCounts: Map<string, number> = new Map();
  private dbCallCount = 0;
  private renderCount = 0;
  private logs: LogEntry[] = [];

  /** Configure the logger at runtime */
  configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }

  /** Check if a level should be logged */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /** Internal log method */
  private log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>, elapsedMs?: number) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
      elapsedMs,
    };

    this.logs.push(entry);

    // Persist logs if enabled (but keep array bounded)
    if (this.config.persistLogs) {
      this.persistEntry(entry);
    }

    // Console output with color coding
    if (this.config.logToConsole) {
      const styles: Record<LogLevel, string> = {
        debug: "color: #6c757d",
        info: "color: #0d6efd",
        warn: "color: #fd7e14",
        error: "color: #dc3545; font-weight: bold",
      };

      const elapsedStr = elapsedMs !== undefined ? ` (${elapsedMs}ms)` : "";
      const dataStr = data ? ` | ${JSON.stringify(data)}` : "";

      // Use console.log with style prefix for consistent formatting
      const prefix = `[Exam][${module}]${elapsedStr}`;

      switch (level) {
        case "debug":
          console.log(`%c${prefix} ${message}${dataStr}`, styles[level]);
          break;
        case "info":
          console.log(`%c${prefix} ${message}${dataStr}`, styles[level]);
          break;
        case "warn":
          console.warn(`%c${prefix} ${message}${dataStr}`, styles[level]);
          break;
        case "error":
          console.error(`%c${prefix} ${message}${dataStr}`, styles[level]);
          break;
      }
    }
  }

  /** Persist a log entry to localStorage (bounded) */
  private persistEntry(entry: LogEntry) {
    try {
      const existing = this.getPersistedLogs();
      existing.push(entry);
      // Keep only the most recent entries
      if (existing.length > this.config.maxPersistedEntries) {
        existing.splice(0, existing.length - this.config.maxPersistedEntries);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch {
      // Silently fail if localStorage is full
    }
  }

  /** Get all persisted logs */
  getPersistedLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /** Clear persisted logs */
  clearPersistedLogs() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERF_KEY);
    this.logs = [];
    this.operationCounts.clear();
    this.dbCallCount = 0;
    this.renderCount = 0;
  }

  // ── Timer Utilities ────────────────────────────────────────────────────────

  /** Start a named timer */
  startTimer(name: string) {
    this.timers.set(name, performance.now());
  }

  /** End a named timer and log the elapsed time */
  endTimer(name: string, module: string, message: string, data?: Record<string, unknown>) {
    const start = this.timers.get(name);
    if (start === undefined) {
      this.warn(module, `Timer "${name}" was not started`);
      return;
    }
    const elapsed = Math.round(performance.now() - start);
    this.timers.delete(name);
    this.info(module, message, { ...data, timerName: name, elapsedMs: elapsed });
    return elapsed;
  }

  // ── Operation Tracking ─────────────────────────────────────────────────────

  /** Track an operation count (e.g., DB calls, renders) */
  trackOp(category: string, operation: string, count = 1) {
    const key = `${category}:${operation}`;
    const current = this.operationCounts.get(key) || 0;
    this.operationCounts.set(key, current + count);
  }

  /** Get operation counts summary */
  getStats(): {
    totalDbCalls: number;
    totalRenders: number;
    operations: Record<string, number>;
    totalLogs: number;
  } {
    const ops: Record<string, number> = {};
    this.operationCounts.forEach((count, key) => {
      ops[key] = count;
    });
    return {
      totalDbCalls: this.dbCallCount,
      totalRenders: this.renderCount,
      operations: ops,
      totalLogs: this.logs.length,
    };
  }

  /** Print a summary of all tracked operations */
  printSummary() {
    const stats = this.getStats();
    console.log(
      `%c[ExamLogger] Summary — DB Calls: ${stats.totalDbCalls}, Renders: ${stats.totalRenders}, Logs: ${stats.totalLogs}`,
      "color: #0d6efd; font-weight: bold; font-size: 14px",
    );
    Object.entries(stats.operations).forEach(([key, count]) => {
      console.log(`%c  ${key}: ${count}`, "color: #6c757d");
    });
  }

  // ── Specialized Log Methods ────────────────────────────────────────────────

  /** Log database operations */
  db(operation: string, details?: Record<string, unknown>) {
    this.dbCallCount++;
    this.trackOp("db", operation);
    this.info("DB", operation, details);
  }

  /** Log render cycles */
  render(component: string, details?: Record<string, unknown>) {
    this.renderCount++;
    this.trackOp("render", component);
    this.debug("Render", `${component} rendered`, details);
  }

  /** Log cache operations */
  cache(operation: string, details?: Record<string, unknown>) {
    this.trackOp("cache", operation);
    this.debug("Cache", operation, details);
  }

  /** Log timer events */
  timer(event: string, details?: Record<string, unknown>) {
    this.trackOp("timer", event);
    this.debug("Timer", event, details);
  }

  // ── Standard Log Levels ────────────────────────────────────────────────────

  debug(module: string, message: string, data?: Record<string, unknown>) {
    this.log("debug", module, message, data);
  }

  info(module: string, message: string, data?: Record<string, unknown>) {
    this.log("info", module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, unknown>) {
    this.log("warn", module, message, data);
  }

  error(module: string, message: string, data?: Record<string, unknown>) {
    this.log("error", module, message, data);
  }
}

// Export singleton instance
export const examLogger = new ExamLogger();

// Export performance tracking decorator
export function withPerfLogging<T extends (...args: any[]) => any>(
  fn: T,
  module: string,
  operationName: string,
): T {
  return ((...args: any[]) => {
    examLogger.startTimer(operationName);
    try {
      const result = fn(...args);
      // Handle both sync and async
      if (result instanceof Promise) {
        return result
          .then((value) => {
            examLogger.endTimer(operationName, module, `${operationName} completed`, {
              args: args.length,
            });
            return value;
          })
          .catch((error) => {
            examLogger.endTimer(operationName, module, `${operationName} failed`, {
              error: String(error),
            });
            throw error;
          });
      }
      examLogger.endTimer(operationName, module, `${operationName} completed`, {
        args: args.length,
      });
      return result;
    } catch (error) {
      examLogger.endTimer(operationName, module, `${operationName} failed`, {
        error: String(error),
      });
      throw error;
    }
  }) as T;
}

/**
 * Hook to track component render count
 * Usage: useRenderLogging('ExamPlayer', { examId });
 */
export function useRenderLogging(componentName: string, details?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    examLogger.render(componentName, details);
  }
}
