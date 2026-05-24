import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
// A centered placeholder shown when a list or table has no data to display.
// Accepts an optional icon, title, descriptive text, and an action element
// (e.g. a Button) so call-sites can nudge users toward the next step.
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  /** Large illustrative icon rendered above the title. */
  icon?: ReactNode;
  /** Primary message — rendered as a bold heading. */
  title: string;
  /** Secondary descriptive text rendered in muted color below the title. */
  description?: string;
  /** Optional CTA element (e.g. a Button) rendered beneath the description. */
  action?: ReactNode;
  /** Additional Tailwind classes to merge onto the root element. */
  className?: string;
}

/**
 * `EmptyState` — reusable zero-data placeholder.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<Users className="size-10" />}
 *   title="No students yet"
 *   description="Add your first student to get started."
 *   action={<Button>Add student</Button>}
 * />
 * ```
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 px-6 text-center",
        className,
      )}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div
          className={cn(
            "flex size-16 items-center justify-center rounded-full",
            "bg-muted text-muted-foreground",
            "[&_svg]:size-8",
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      <div className="flex flex-col gap-1.5 max-w-xs">
        <p className="text-base font-semibold text-foreground leading-snug">{title}</p>

        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
