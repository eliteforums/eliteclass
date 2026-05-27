import { useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useNetworkStore } from "@/store/networkStore";

export function OfflineIndicator() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    if (prevOnline.current === false && isOnline === true) {
      toast.success("Back online");
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  // Don't show in dev mode (navigator.onLine is unreliable on localhost)
  if (import.meta.env.DEV) return null;
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-14 left-0 right-0 z-50 bg-amber-500/90 text-white text-xs py-1.5 px-4 text-center flex items-center justify-center gap-2"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>You're offline — some features may be unavailable</span>
    </div>
  );
}
