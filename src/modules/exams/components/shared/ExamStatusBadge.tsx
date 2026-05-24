import * as React from "react";
import { cn } from "@/lib/utils";
import type { ExamStatus, ExamAttemptStatus } from "../../types";

type AnyStatus = ExamStatus | ExamAttemptStatus;

interface StatusConfig {
  badge: string;
  dot: string;
  label: string;
}

const STATUS_CONFIG: Record<AnyStatus, StatusConfig> = {
  draft: {
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    dot: "bg-gray-400 dark:bg-gray-500",
    label: "Draft",
  },
  published: {
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    dot: "bg-green-500 dark:bg-green-400",
    label: "Published",
  },
  archived: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
    label: "Archived",
  },
  in_progress: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "In Progress",
  },
  submitted: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Submitted",
  },
  graded: {
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    label: "Graded",
  },
  auto_submitted: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Auto Submitted",
  },
  expired: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    dot: "bg-orange-500 dark:bg-orange-400",
    label: "Expired",
  },
  not_started: {
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    dot: "bg-gray-400 dark:bg-gray-500",
    label: "Not Started",
  },
};

interface ExamStatusBadgeProps {
  status: AnyStatus | "not_started";
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-2.5 py-1 text-xs",
};

const DOT_SIZE_CLASSES = {
  sm: "size-1.5",
  md: "size-2",
};

export function ExamStatusBadge({ status, size = "md" }: ExamStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.badge,
        SIZE_CLASSES[size],
      )}
    >
      <span className={cn("shrink-0 rounded-full", config.dot, DOT_SIZE_CLASSES[size])} />
      {config.label}
    </span>
  );
}
