import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------
// A two-column section header intended for top-of-page placement.
//
//   LEFT  — title (large, semibold) / subtitle (muted) / optional count badge
//   RIGHT — optional actions slot (e.g. primary + secondary Button)
//
// A thin border-bottom separates the header from the page body beneath it.
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  /** Main page title. Rendered at text-2xl font-semibold. */
  title: string;
  /** Optional subtitle / description rendered below the title in muted text. */
  subtitle?: string;
  /**
   * Short summary badge rendered as a pill next to the title.
   * Typical use: `"247 students"`, `"12 active courses"`, etc.
   */
  badge?: string;
  /**
   * Right-aligned action slot.
   * Render one or more Button elements here.
   */
  actions?: ReactNode;
  /** Additional Tailwind classes merged on the root wrapper. */
  className?: string;
}

/**
 * `PageHeader` — reusable section header for top-level pages.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Students"
 *   subtitle="Manage enrollment, status, and parent links."
 *   badge="247 students"
 *   actions={
 *     <>
 *       <Button variant="outline">Export</Button>
 *       <Button>Add student</Button>
 *     </>
 *   }
 * />
 * ```
 */
export function PageHeader({ title, subtitle, badge, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-4 sm:gap-4 sm:pb-5",
        "md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      {/* ── Left: title block ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 min-w-0">
        {/* Title row — title + optional badge inline */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-foreground leading-tight tracking-tight truncate">
            {title}
          </h1>

          {badge && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5",
                "bg-muted text-muted-foreground text-xs font-medium",
                "border border-border",
              )}
              aria-label={badge}
            >
              {badge}
            </span>
          )}
        </div>

        {/* Optional subtitle */}
        {subtitle && <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
      </div>

      {/* ── Right: action buttons ──────────────────────────────────────────── */}
      {actions && (
        <div
          className={cn(
            "flex w-full shrink-0 flex-wrap items-stretch gap-2 sm:w-auto sm:items-center",
            "md:self-start",
          )}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
