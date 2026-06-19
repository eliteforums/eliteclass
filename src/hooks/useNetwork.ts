// ---------------------------------------------------------------------------
// useNetwork — observable online/offline state
// ---------------------------------------------------------------------------
//
// Exposes the current network state so feature code can short-circuit
// online-only mutations (Req 9) and offline-aware UI can render banners /
// per-row queued indicators.
//
// `reachable` is a finer-grained signal that distinguishes "navigator says
// online but Supabase is unreachable" from "navigator and the network agree".
// Future phases (C/D) update it from outbox replay outcomes; for now it
// always tracks `isOnline`.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export interface NetworkState {
  isOnline: boolean;
  reachable: "yes" | "no" | "unknown";
}

function readState(): NetworkState {
  if (typeof navigator === "undefined") {
    return { isOnline: true, reachable: "unknown" };
  }
  const online = navigator.onLine;
  return { isOnline: online, reachable: online ? "yes" : "no" };
}

export function useNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => readState());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setState({ isOnline: true, reachable: "yes" });
    const handleOffline = () => setState({ isOnline: false, reachable: "no" });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Resync on mount in case the value drifted while the listener was off.
    setState(readState());

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return state;
}
