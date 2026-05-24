// ---------------------------------------------------------------------------
// ProgressRing — SVG circular progress indicator
// ---------------------------------------------------------------------------

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** Progress value 0–100 */
  value: number;
  /** Diameter of the SVG in px (default 64) */
  size?: number;
  /** Stroke width in px (default 6) */
  strokeWidth?: number;
  /** Whether to render the numeric percentage label in the centre */
  showLabel?: boolean;
  /** Extra classes on the root container */
  className?: string;
  /** Extra classes on the label span */
  labelClassName?: string;
}

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  showLabel = true,
  className,
  labelClassName,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/40"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>

      {showLabel && (
        <span
          className={cn(
            "absolute text-xs font-semibold tabular-nums text-foreground",
            labelClassName,
          )}
        >
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
