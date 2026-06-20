// ---------------------------------------------------------------------------
// OutboxPanel — pending + dead-letter list with retry/discard controls
// ---------------------------------------------------------------------------
//
// Rendered as a Sheet (slide-out panel) anchored from the SyncIndicator.
// Shows two tables:
//   * Pending — entries currently in the outbox; each can be force-retried
//     or discarded.
//   * Dead-letter — entries that exhausted their retry budget; can be
//     re-queued or discarded.
//
// Refreshes whenever the outbox `drainSignal` fires.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuthStore } from "@/store/authStore";

import {
  discard,
  drainSignal,
  listForOwner,
  retry,
} from "@/services/offline/outbox";
import type { OutboxRow } from "@/services/offline/db";

interface OutboxPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OutboxPanel({ open, onOpenChange }: OutboxPanelProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [pending, setPending] = useState<OutboxRow[]>([]);
  const [dead, setDead] = useState<OutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const result = await listForOwner(userId);
        if (!cancelled) {
          setPending(result.pending);
          setDead(result.dead);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    drainSignal.addEventListener("change", refresh);
    return () => {
      cancelled = true;
      drainSignal.removeEventListener("change", refresh);
    };
  }, [open, userId]);

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retry(id);
      toast.success("Queued for retry");
    } catch (err) {
      toast.error("Failed to retry: " + (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (id: string) => {
    setBusyId(id);
    try {
      await discard(id);
      toast.success("Discarded");
    } catch (err) {
      toast.error("Failed to discard: " + (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sync queue</SheetTitle>
          <SheetDescription>
            Pending writes waiting to sync, plus failed writes you can retry
            or discard.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <Section title="Pending" rows={pending} loading={loading}>
            {pending.map((row) => (
              <Row
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onRetry={() => handleRetry(row.id)}
                onDiscard={() => handleDiscard(row.id)}
              />
            ))}
          </Section>

          <Section title="Failed (dead-letter)" rows={dead} loading={loading}>
            {dead.map((row) => (
              <Row
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onRetry={() => handleRetry(row.id)}
                onDiscard={() => handleDiscard(row.id)}
                isDead
              />
            ))}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  rows,
  loading,
  children,
}: {
  title: string;
  rows: OutboxRow[];
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline">{rows.length}</Badge>
      </header>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

interface RowProps {
  row: OutboxRow;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  isDead?: boolean;
}

function Row({ row, busy, onRetry, onDiscard, isDead }: RowProps) {
  return (
    <div className="rounded-md border p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">
            <span className="text-muted-foreground mr-1">{row.method}</span>
            {row.entityType}
          </p>
          <p className="text-muted-foreground truncate">
            {format(new Date(row.createdAt), "MMM d, h:mm a")}
            {row.attempts > 0 && (
              <span className="ml-2">· tries: {row.attempts}</span>
            )}
          </p>
          {row.lastError && (
            <p className="text-destructive truncate mt-1" title={row.lastError}>
              {row.lastError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={onRetry}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1">{isDead ? "Re-queue" : "Retry"}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
            onClick={onDiscard}
            disabled={busy}
          >
            <Trash2 className="h-3 w-3" />
            <span className="ml-1">Discard</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
