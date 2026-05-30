// ---------------------------------------------------------------------------
// LocationGate — Blocks app usage until geolocation permission is granted
//
// Wraps authenticated content. If geolocation is denied or unavailable,
// shows a full-screen prompt explaining why location is required.
// ---------------------------------------------------------------------------

import { useEffect, useState, type ReactNode } from "react";
import { MapPin, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";

interface LocationGateProps {
  children: ReactNode;
}

type PermissionStatus = "prompt" | "granted" | "denied" | "unavailable" | "checking";

export function LocationGate({ children }: LocationGateProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("checking");

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setPermissionStatus("unavailable");
      return;
    }

    // Check permission state via Permissions API (if available)
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          setPermissionStatus(result.state as PermissionStatus);
          result.addEventListener("change", () => {
            setPermissionStatus(result.state as PermissionStatus);
          });
        })
        .catch(() => {
          // Permissions API not fully supported — try requesting directly
          requestLocation();
        });
    } else {
      // No Permissions API — request directly
      requestLocation();
    }
  }, [isAuthenticated, isLoading]);

  function requestLocation() {
    navigator.geolocation.getCurrentPosition(
      () => setPermissionStatus("granted"),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus("denied");
        } else {
          // Timeout or unavailable — allow through but tracking won't work
          setPermissionStatus("granted");
        }
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function handleRetry() {
    setPermissionStatus("checking");
    requestLocation();
  }

  // Not authenticated or still loading auth — pass through
  if (!isAuthenticated || isLoading) {
    return <>{children}</>;
  }

  // Checking permission — show brief loading
  if (permissionStatus === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <MapPin className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Checking location access...</p>
        </div>
      </div>
    );
  }

  // Permission granted — render app
  if (permissionStatus === "granted" || permissionStatus === "prompt") {
    return <>{children}</>;
  }

  // Permission denied or unavailable — show gate
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Location Access Required</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EliteClass requires location access to verify attendance, track activity,
            and ensure platform security. Please enable location access in your browser
            settings to continue.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-left space-y-2">
          <p className="text-xs font-medium text-foreground">How to enable:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Click the lock/info icon in your browser's address bar</li>
            <li>Find "Location" in the permissions list</li>
            <li>Change it from "Block" to "Allow"</li>
            <li>Refresh this page</li>
          </ol>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={handleRetry} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            I've Enabled Location — Retry
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Your location is used for attendance verification and activity logging only.
            It is never shared with other students.
          </p>
        </div>
      </div>
    </div>
  );
}
