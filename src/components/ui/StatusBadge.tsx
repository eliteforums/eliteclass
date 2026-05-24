import * as React from "react";

import type { StudentStatus } from "@/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
// A small pill badge that visualises a StudentStatus value with a colored dot
// and appropriate background / foreground colors in both light and dark mode.
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  /** The student status to display. */
  status: StudentStatus;
  /** Visual size variant. Defaults to "md". */
  size?: "sm" | "md";
}

// ── Color configuration ──────────────────────────────────────────────────────

interface StatusConfig {
  /** Tailwind classes for the badge pill. */
  badge: string;
  /** Tailwind classes for the leading dot. */
  dot: string;
  /** Human-readable label (capitalized). */
  label: string;
}

const STATUS_CONFIG: Record<StudentStatus, StatusConfig> = {
  active: {
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    dot: "bg-green-500 dark:bg-green-400",
    label: "Active",
  },
  inactive: {
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    dot: "bg-gray-400 dark:bg-gray-500",
    label: "Inactive",
  },
  graduated: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Graduated",
  },
  suspended: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
    label: "Suspended",
  },
};

// ── Size configuration ───────────────────────────────────────────────────────

const SIZE_CLASSES: Record<NonNullable<StatusBadgeProps["size"]>, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-2.5 py-1 text-xs",
};

const DOT_SIZE_CLASSES: Record<NonNullable<StatusBadgeProps["size"]>, string> = {
  sm: "size-1.5",
  md: "size-2",
};

/**
 * `StatusBadge` — visual indicator for a student's enrollment status.
 *
 * Renders a small pill with a colored dot and capitalized status label.
 * Adapts automatically to light and dark mode.
 *
 * @example
 * ```tsx
 * <StatusBadge status="active" />
 * <StatusBadge status="suspended" size="sm" />
 * ```
 */
export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.badge,
        SIZE_CLASSES[size],
      )}
      aria-label={`Status: ${config.label}`}
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
