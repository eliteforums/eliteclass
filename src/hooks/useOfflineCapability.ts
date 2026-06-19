// ---------------------------------------------------------------------------
// useOfflineCapability — runtime detection of offline write support
// ---------------------------------------------------------------------------
//
// Detects three signals at boot and stores them so feature code knows
// whether to enqueue mutations through the Sync Outbox or fall back to a
// degraded online-only path (Req 18).
//
//   hasServiceWorker       — `'serviceWorker' in navigator` and a registration exists
//   hasBackgroundSync      — `'sync' in registration` (queueing supported)
//   hasPersistentStorage   — `navigator.storage.persist?.()` returned true
//
// `canQueueWrites = hasServiceWorker && hasBackgroundSync`. When false, the
// offline mutation hook in Phase C surfaces an explicit "offline queue
// unavailable" error rather than silently dropping the write (Req 18.4).
//
// Reads survive even when this returns no — the persisted React Query cache
// in `src/lib/queryClient.ts` is independent of the service worker.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export interface OfflineCapability {
  hasServiceWorker: boolean;
  hasBackgroundSync: boolean;
  hasPersistentStorage: boolean;
  canQueueWrites: boolean;
}

const DEFAULT_CAPABILITY: OfflineCapability = {
  hasServiceWorker: false,
  hasBackgroundSync: false,
  hasPersistentStorage: false,
  canQueueWrites: false,
};

const REGISTRATION_TIMEOUT_MS = 2000;

let _cached: OfflineCapability | null = null;
let _inflight: Promise<OfflineCapability> | null = null;

async function detectCapability(): Promise<OfflineCapability> {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return DEFAULT_CAPABILITY;
  }

  let hasServiceWorker = false;
  let hasBackgroundSync = false;

  if ("serviceWorker" in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), REGISTRATION_TIMEOUT_MS),
        ),
      ]);
      if (reg) {
        hasServiceWorker = true;
        // Background Sync is exposed as `sync` on the registration when supported.
        hasBackgroundSync =
          "sync" in reg && typeof (reg as { sync?: unknown }).sync === "object";
      }
    } catch {
      hasServiceWorker = false;
    }
  }

  let hasPersistentStorage = false;
  try {
    if ("storage" in navigator && navigator.storage.persist) {
      hasPersistentStorage = await navigator.storage.persist();
    }
  } catch {
    hasPersistentStorage = false;
  }

  return {
    hasServiceWorker,
    hasBackgroundSync,
    hasPersistentStorage,
    canQueueWrites: hasServiceWorker && hasBackgroundSync,
  };
}

export function useOfflineCapability(): OfflineCapability {
  const [state, setState] = useState<OfflineCapability>(
    _cached ?? DEFAULT_CAPABILITY,
  );

  useEffect(() => {
    let cancelled = false;
    if (_cached) {
      setState(_cached);
      return;
    }
    if (!_inflight) _inflight = detectCapability();
    _inflight.then((cap) => {
      _cached = cap;
      if (!cancelled) setState(cap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
