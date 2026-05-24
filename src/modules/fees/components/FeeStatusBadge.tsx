// ---------------------------------------------------------------------------
// EduOS — FeeStatusBadge
//
// A small pill badge that visualises a FeeStatus value with a colored dot
// and appropriate background / foreground colors in both light and dark mode.
//
// Color map:
//  paid     → green
//  pending  → amber / yellow
//  partial  → blue
//  overdue  → red
//  waived   → gray
//
// Mirrors the same structure as StatusBadge so both components feel
// visually consistent throughout the app.
// ---------------------------------------------------------------------------

import type { FeeStatus } from "@/types";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface FeeStatusBadgeProps {
  /** The fee status to display. */
  status: FeeStatus;
  /** Visual size variant. Defaults to "md". */
  size?: "sm" | "md";
}

// ── Color configuration ───────────────────────────────────────────────────────

interface FeeStatusConfig {
  /** Tailwind classes for the badge pill. */
  badge: string;
  /** Tailwind classes for the leading dot. */
  dot: string;
  /** Human-readable label (capitalized). */
  label: string;
}

const FEE_STATUS_CONFIG: Record<FeeStatus, FeeStatusConfig> = {
  paid: {
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    dot: "bg-green-500 dark:bg-green-400",
    label: "Paid",
  },
  pending: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Pending",
  },
  partial: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Partial",
  },
  overdue: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
    label: "Overdue",
  },
  waived: {
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    dot: "bg-gray-400 dark:bg-gray-500",
    label: "Waived",
  },
};

// ── Size configuration ────────────────────────────────────────────────────────

const SIZE_CLASSES: Record<NonNullable<FeeStatusBadgeProps["size"]>, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-2.5 py-1 text-xs",
};

const DOT_SIZE_CLASSES: Record<NonNullable<FeeStatusBadgeProps["size"]>, string> = {
  sm: "size-1.5",
  md: "size-2",
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `FeeStatusBadge` — visual indicator for a student fee assignment's status.
 *
 * Renders a small pill with a colored dot and capitalized status label.
 * Adapts automatically to light and dark mode.
 *
 * @example
 * ```tsx
 * <FeeStatusBadge status="paid" />
 * <FeeStatusBadge status="overdue" size="sm" />
 * ```
 */
export function FeeStatusBadge({ status, size = "md" }: FeeStatusBadgeProps) {
  const config = FEE_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.badge,
        SIZE_CLASSES[size],
      )}
      aria-label={`Fee status: ${config.label}`}
    >
      {/* Colored dot */}
      <span
        className={cn("shrink-0 rounded-full", config.dot, DOT_SIZE_CLASSES[size])}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
