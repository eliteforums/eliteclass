// ---------------------------------------------------------------------------
// useLocationTracking — GPS location tracking hook
//
// Requests geolocation permission, tracks position changes, and sends
// updates to the server via activity.service.
//
// Usage: Call once in the app root (e.g., inside PWAProvider or a layout).
// Only tracks when user is authenticated.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { updateLocation, markOffline } from "@/services/activity.service";

const UPDATE_INTERVAL_MS = 60_000; // Update every 60 seconds
const MIN_DISTANCE_METERS = 50; // Only update if moved > 50m

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useLocationTracking() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const lastCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    let cancelled = false;

    function sendLocation(position: GeolocationPosition) {
      if (cancelled) return;

      const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;

      // Only send if moved significantly (saves API calls)
      if (lastCoordsRef.current) {
        const distance = haversineDistance(
          lastCoordsRef.current.lat,
          lastCoordsRef.current.lon,
          latitude,
          longitude,
        );
        if (distance < MIN_DISTANCE_METERS) return;
      }

      lastCoordsRef.current = { lat: latitude, lon: longitude };
      updateLocation({
        latitude,
        longitude,
        accuracy: accuracy ?? undefined,
        altitude: altitude ?? undefined,
        speed: speed ?? undefined,
        heading: heading ?? undefined,
      });
    }

    function startTracking() {
      // Initial position
      navigator.geolocation.getCurrentPosition(
        sendLocation,
        () => {}, // Silently ignore permission denied
        { enableHighAccuracy: true, timeout: 10000 }
      );

      // Watch for position changes
      watchIdRef.current = navigator.geolocation.watchPosition(
        sendLocation,
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000 }
      );

      // Also send periodic updates even if position hasn't changed (heartbeat)
      intervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) {
              // Force update for heartbeat (even if same position)
              const { latitude, longitude, accuracy, altitude, speed, heading } = pos.coords;
              lastCoordsRef.current = { lat: latitude, lon: longitude };
              updateLocation({
                latitude,
                longitude,
                accuracy: accuracy ?? undefined,
                altitude: altitude ?? undefined,
                speed: speed ?? undefined,
                heading: heading ?? undefined,
              });
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }, UPDATE_INTERVAL_MS);
    }

    startTracking();

    // Mark offline on page unload
    function handleBeforeUnload() {
      markOffline();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      markOffline();
    };
  }, [isAuthenticated, user?.id]);
}
