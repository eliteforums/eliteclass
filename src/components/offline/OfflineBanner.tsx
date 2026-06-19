// ---------------------------------------------------------------------------
// OfflineBanner — top-of-app indicator while navigator.onLine === false
// ---------------------------------------------------------------------------
//
// Renders a sticky banner across the top of the dashboard chrome whenever
// the device is offline (Req 14, 16 - banner subset). Hidden again within
// 500ms of the `online` event firing.
// ---------------------------------------------------------------------------

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useNetwork } from "@/hooks/useNetwork";

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const [visible, setVisible] = useState(!isOnline);

  // The banner appears immediately when offline and hides after a short
  // grace period when coming back online so the transition is not jarring.
  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(false), 250);
    return () => window.clearTimeout(t);
  }, [isOnline]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex w-full items-center justify-center gap-2 bg-amber-500/95 px-3 py-2 text-xs font-medium text-amber-950 shadow-sm backdrop-blur"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>You are offline. Changes will sync when you reconnect.</span>
    </div>
  );
}
