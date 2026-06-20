// ---------------------------------------------------------------------------
// useSyncIndicator — observable state machine for the global sync chip
// ---------------------------------------------------------------------------
//
// State derivation (design Property 25, Req 16):
//
//   canQueueWrites === false                 -> "Offline — queueing disabled"
//   isOnline === false                       -> "Offline — {pending} queued"
//   pending > 0 (online)                     -> "{pending} pending"
//   otherwise                                -> "All synced"
//
// Pulls live counts from the outbox using `drainSignal` so the chip updates
// whenever an entry is enqueued / drained / dead-lettered.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/authStore";

import { count, drainSignal } from "@/services/offline/outbox";

import { useNetwork } from "./useNetwork";
import { useOfflineCapability } from "./useOfflineCapability";

export type SyncState = "synced" | "pending" | "offline" | "disabled";

export interface SyncStatus {
  state: SyncState;
  pending: number;
  dead: number;
  label: string;
  isOnline: boolean;
  canQueueWrites: boolean;
}

const POLL_MS = 5_000;

export function useSyncIndicator(): SyncStatus {
  const { isOnline } = useNetwork();
  const capability = useOfflineCapability();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [counts, setCounts] = useState<{ pending: number; dead: number }>({
    pending: 0,
    dead: 0,
  });

  useEffect(() => {
    if (!userId) {
      setCounts({ pending: 0, dead: 0 });
      return;
    }
    let cancelled = false;
    const refresh = () => {
      count(userId)
        .then((c) => {
          if (!cancelled) setCounts(c);
        })
        .catch(() => {
          // ignore — IDB may be momentarily unavailable
        });
    };
    refresh();
    drainSignal.addEventListener("change", refresh);
    const interval = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      drainSignal.removeEventListener("change", refresh);
      window.clearInterval(interval);
    };
  }, [userId]);

  const canQueueWrites = capability.canQueueWrites;
  let state: SyncState = "synced";
  let label = "All synced";

  if (!canQueueWrites && !isOnline) {
    state = "disabled";
    label = "Offline — queueing disabled";
  } else if (!isOnline) {
    state = "offline";
    label = `Offline — ${counts.pending} queued`;
  } else if (counts.pending > 0) {
    state = "pending";
    label = `${counts.pending} pending`;
  }

  return {
    state,
    pending: counts.pending,
    dead: counts.dead,
    label,
    isOnline,
    canQueueWrites,
  };
}
