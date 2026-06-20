// ---------------------------------------------------------------------------
// RefreshButton — invalidates the page's React Query keys + drains outbox
// ---------------------------------------------------------------------------
//
// Per-page refresh control. Pass the query keys this page depends on; the
// button invalidates them, refetches active queries, and triggers an
// outbox drain in case the page also has pending writes.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

import { drainOutbox } from "@/services/offline/replay";

interface RefreshButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  /** Query keys to invalidate. Same shape as `queryClient.invalidateQueries`. */
  queryKeys: ReadonlyArray<readonly unknown[]>;
  label?: string;
}

const STRICT_REENABLE_MS = 200;

export function RefreshButton({
  queryKeys,
  label = "Refresh",
  className,
  ...rest
}: RefreshButtonProps) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    const start = Date.now();
    try {
      await Promise.all(
        queryKeys.map((key) =>
          queryClient.invalidateQueries({ queryKey: key as readonly unknown[] }),
        ),
      );
      if (userId) {
        drainOutbox({ ownerUserId: userId, queryClient }).catch(() => {});
      }
    } catch (err) {
      toast.error("Refresh failed: " + (err as Error).message);
    } finally {
      // Strict 200ms re-enable bound (Property 25 / Req 13.4).
      const elapsed = Date.now() - start;
      const wait = Math.max(0, STRICT_REENABLE_MS - elapsed);
      window.setTimeout(() => setBusy(false), wait);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className={cn("gap-1.5", className)}
      {...rest}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      {label}
    </Button>
  );
}
