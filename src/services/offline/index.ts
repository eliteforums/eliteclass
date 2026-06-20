// ---------------------------------------------------------------------------
// Offline subsystem bootstrap
// ---------------------------------------------------------------------------
//
// Wires the foreground outbox replay loop. Two triggers:
//   1. `online` event — drain everything as soon as connectivity returns.
//   2. 30-second poll — handle the case where outbox entries are added
//      while a tab is foreground but the SW Background Sync API is
//      unavailable (Mobile Safari, no-SW dev builds).
//
// The SW Background Sync handler in Phase G will register the same drain
// against `'sync'` events; the two paths are idempotent because each entry
// transitions to "in_flight" before the network call.
// ---------------------------------------------------------------------------

import type { QueryClient } from "@tanstack/react-query";

import { drainOutbox } from "./replay";
import { drainSignal } from "./outbox";

const POLL_MS = 30_000;

interface BootstrapOptions {
  queryClient: QueryClient;
  getOwnerUserId: () => string | null;
}

let _started = false;

export function bootstrapOfflineRuntime({
  queryClient,
  getOwnerUserId,
}: BootstrapOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (_started) return () => {};
  _started = true;

  const safeDrain = () => {
    const ownerUserId = getOwnerUserId();
    if (!ownerUserId) return;
    drainOutbox({ ownerUserId, queryClient }).catch((err) => {
      if (typeof console !== "undefined") {
        console.warn("[offline] drain error", err);
      }
    });
  };

  const handleOnline = () => safeDrain();
  const handleEnqueued = () => {
    if (typeof navigator !== "undefined" && navigator.onLine) safeDrain();
  };

  window.addEventListener("online", handleOnline);
  drainSignal.addEventListener("change", handleEnqueued);

  const interval = window.setInterval(safeDrain, POLL_MS);

  // Initial pass — flush anything enqueued by a previous session.
  if (navigator.onLine) safeDrain();

  return () => {
    window.removeEventListener("online", handleOnline);
    drainSignal.removeEventListener("change", handleEnqueued);
    window.clearInterval(interval);
    _started = false;
  };
}
