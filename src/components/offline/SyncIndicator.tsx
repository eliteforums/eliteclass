// ---------------------------------------------------------------------------
// SyncIndicator — chrome chip showing outbox sync state
// ---------------------------------------------------------------------------
//
// Compact pill that lives in the topbar. Click to open the OutboxPanel.
// State labels follow Property 25:
//
//   synced    -> "All synced"            (green dot)
//   pending   -> "{n} pending"           (amber dot)
//   offline   -> "Offline — {n} queued"  (red dot)
//   disabled  -> "Offline — queueing disabled" (gray dot)
// ---------------------------------------------------------------------------

import { CheckCircle2, CloudOff, Loader2, WifiOff } from "lucide-react";

import { useSyncIndicator } from "@/hooks/useSyncIndicator";
import { cn } from "@/lib/utils";

interface SyncIndicatorProps {
  onClick?: () => void;
  className?: string;
}

export function SyncIndicator({ onClick, className }: SyncIndicatorProps) {
  const { state, label } = useSyncIndicator();

  const Icon =
    state === "synced"
      ? CheckCircle2
      : state === "pending"
        ? Loader2
        : state === "offline"
          ? WifiOff
          : CloudOff;

  const tone =
    state === "synced"
      ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/40"
      : state === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40"
        : state === "offline"
          ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40"
          : "border-border bg-muted/40 text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-90",
        tone,
        className,
      )}
    >
      <Icon
        className={cn("h-3 w-3", state === "pending" && "animate-spin")}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
