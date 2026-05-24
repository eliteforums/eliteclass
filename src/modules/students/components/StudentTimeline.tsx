// ---------------------------------------------------------------------------
// EduOS — StudentTimeline
//
// Unified chronological timeline that merges StudentHistory audit entries
// with StudentPromotion lifecycle records.
//
// Both arrays are tagged with `_kind` and sorted by `created_at` DESC so
// all events appear in a single, date-ordered list regardless of source.
//
// Each event renders as:
//   [Date]  ● Icon dot  [Action label + actor + remark/reason]
//
// Action → colour + icon mapping is defined in `EVENT_CONFIG` below.
// ---------------------------------------------------------------------------

import { Loader2 } from "lucide-react";
import {
  GraduationCap,
  RefreshCw,
  TrendingUp,
  Award,
  Ban,
  CheckCircle,
  MessageSquare,
  Layers,
  Clock,
} from "lucide-react";

import type { StudentHistory, StudentPromotion } from "@/types";
import { formatDate, formatDateTime } from "@/utils/helpers";

// ── Event configuration ───────────────────────────────────────────────────────

interface EventStyle {
  icon: React.FC<{ className?: string }>;
  dotColor: string;
  iconColor: string;
  bgColor: string;
  label: string;
}

const EVENT_CONFIG: Record<string, EventStyle> = {
  admitted: {
    icon: GraduationCap,
    dotColor: "bg-blue-500",
    iconColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/50",
    label: "Admitted",
  },
  status_changed: {
    icon: RefreshCw,
    dotColor: "bg-yellow-500",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/50",
    label: "Status Changed",
  },
  promoted: {
    icon: TrendingUp,
    dotColor: "bg-green-500",
    iconColor: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/50",
    label: "Promoted",
  },
  transferred: {
    icon: TrendingUp,
    dotColor: "bg-purple-500",
    iconColor: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/50",
    label: "Transferred",
  },
  graduated: {
    icon: Award,
    dotColor: "bg-blue-600",
    iconColor: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-100 dark:bg-blue-900/50",
    label: "Graduated",
  },
  suspended: {
    icon: Ban,
    dotColor: "bg-red-500",
    iconColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/50",
    label: "Suspended",
  },
  reactivated: {
    icon: CheckCircle,
    dotColor: "bg-green-600",
    iconColor: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-100 dark:bg-green-900/50",
    label: "Reactivated",
  },
  remark_added: {
    icon: MessageSquare,
    dotColor: "bg-gray-400",
    iconColor: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800",
    label: "Remark Added",
  },
  batch_updated: {
    icon: Layers,
    dotColor: "bg-purple-500",
    iconColor: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/50",
    label: "Batch Updated",
  },
};

/** Fallback config for actions not yet in EVENT_CONFIG. */
const FALLBACK_CONFIG: EventStyle = {
  icon: Clock,
  dotColor: "bg-muted-foreground",
  iconColor: "text-muted-foreground",
  bgColor: "bg-muted",
  label: "Event",
};

function getEventStyle(action: string): EventStyle {
  return EVENT_CONFIG[action] ?? FALLBACK_CONFIG;
}

// ── Unified event type ────────────────────────────────────────────────────────

type HistoryEvent = StudentHistory & { _kind: "history" };
type PromotionEvent = StudentPromotion & { _kind: "promotion" };
type TimelineEvent = HistoryEvent | PromotionEvent;

function mergeAndSort(history: StudentHistory[], promotions: StudentPromotion[]): TimelineEvent[] {
  const tagged: TimelineEvent[] = [
    ...history.map((h): HistoryEvent => ({ ...h, _kind: "history" })),
    ...promotions.map((p): PromotionEvent => ({ ...p, _kind: "promotion" })),
  ];

  // Sort newest → oldest
  return tagged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentTimelineProps {
  history: StudentHistory[];
  promotions: StudentPromotion[];
  isLoading: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Renders the right-hand content card for a history entry. */
function HistoryCard({ event }: { event: HistoryEvent }) {
  const style = getEventStyle(event.action);
  const actor = event.changed_by_user?.name;
  const actorRole = event.changed_by_user?.role;

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bgColor} ${style.iconColor}`}
        >
          {style.label}
        </span>
        <time dateTime={event.created_at} className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(event.created_at)}
        </time>
      </div>

      {/* Remark / description */}
      {event.remark && (
        <p className="mt-2 text-sm text-foreground leading-relaxed">{event.remark}</p>
      )}

      {/* Status change detail */}
      {event.old_value && event.new_value && event.action !== "remark_added" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {event.old_value.status != null && (
            <>
              <span className="capitalize font-mono">{String(event.old_value.status)}</span>
              <span>→</span>
              <span className="capitalize font-mono">
                {event.new_value.status != null ? String(event.new_value.status) : "—"}
              </span>
            </>
          )}
        </div>
      )}

      {/* Actor */}
      {actor && (
        <p className="mt-2 text-xs text-muted-foreground">
          By <span className="font-medium text-foreground">{actor}</span>
          {actorRole && (
            <span className="ml-1 capitalize text-muted-foreground">({actorRole})</span>
          )}
        </p>
      )}
    </div>
  );
}

/** Renders the right-hand content card for a promotion entry. */
function PromotionCard({ event }: { event: PromotionEvent }) {
  const style = getEventStyle(event.action);
  const actor = event.promoted_by_user?.name;
  const actorRole = event.promoted_by_user?.role;

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bgColor} ${style.iconColor}`}
        >
          {style.label}
        </span>
        <time dateTime={event.created_at} className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(event.created_at)}
        </time>
      </div>

      {/* Status transition */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="capitalize font-mono">{event.from_status}</span>
        <span>→</span>
        <span className="capitalize font-mono">{event.to_status}</span>
        {event.effective_date && (
          <>
            <span className="mx-1 text-border">·</span>
            <span>Effective {formatDate(event.effective_date)}</span>
          </>
        )}
      </div>

      {/* Reason */}
      <p className="mt-2 text-sm text-foreground leading-relaxed">{event.reason}</p>

      {/* Notes */}
      {event.notes && <p className="mt-1 text-xs text-muted-foreground italic">{event.notes}</p>}

      {/* Actor */}
      {actor && (
        <p className="mt-2 text-xs text-muted-foreground">
          By <span className="font-medium text-foreground">{actor}</span>
          {actorRole && (
            <span className="ml-1 capitalize text-muted-foreground">({actorRole})</span>
          )}
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `StudentTimeline` — merged, date-sorted audit trail.
 *
 * Combines `StudentHistory` (raw DB audit) and `StudentPromotion` (lifecycle
 * action records) into a single vertical timeline sorted newest → oldest.
 *
 * Shows a loading spinner while data is being fetched, and an empty-state
 * message when both arrays are empty.
 */
export function StudentTimeline({ history, promotions, isLoading }: StudentTimelineProps) {
  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading history…
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (history.length === 0 && promotions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">No history yet</p>
        <p className="text-xs text-muted-foreground max-w-48">
          Lifecycle events and audit entries will appear here.
        </p>
      </div>
    );
  }

  // ── Merged timeline ───────────────────────────────────────────────────────

  const events = mergeAndSort(history, promotions);

  return (
    <div className="relative">
      {/* Vertical stem */}
      <div aria-hidden="true" className="absolute left-[5.5rem] top-0 bottom-0 w-px bg-border" />

      <ol className="space-y-6" aria-label="Student history timeline">
        {events.map((event) => {
          const style = getEventStyle(event.action);
          const Icon = style.icon;

          return (
            <li key={`${event._kind}-${event.id}`} className="flex items-start gap-4">
              {/* ── Date column (left) ─────────────────────────────────────── */}
              <div className="w-20 shrink-0 pt-3 text-right">
                <time
                  dateTime={event.created_at}
                  className="text-xs text-muted-foreground leading-tight"
                >
                  {formatDate(event.created_at).replace(
                    /(\d+)\s(\w+)\s(\d+)/,
                    (_, d, m, y) => `${d} ${m}\n${y}`,
                  )}
                </time>
              </div>

              {/* ── Icon dot (centre) ──────────────────────────────────────── */}
              <div className="relative z-10 shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-background ${style.bgColor}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${style.iconColor}`} aria-hidden="true" />
                </div>
              </div>

              {/* ── Content card (right) ───────────────────────────────────── */}
              <div className="min-w-0 flex-1 pt-0.5">
                {event._kind === "history" ? (
                  <HistoryCard event={event} />
                ) : (
                  <PromotionCard event={event} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
