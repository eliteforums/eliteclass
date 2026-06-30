// ---------------------------------------------------------------------------
// useAppUpdate — unified update detection for web + PWA
// ---------------------------------------------------------------------------
// Two paths can flip `updateAvailable` to true:
//
//   1. Service Worker (installed PWA): the SW signals a waiting worker via
//      the existing `onSWUpdateAvailable` hook. Triggered as soon as a new
//      version is fetched.
//
//   2. Web app (no SW): we poll `/version.json` every 5 minutes (and on tab
//      focus). If the polled version differs from the version baked into
//      this build (`import.meta.env.VITE_APP_VERSION`), it means a new
//      deployment is live and the user is on the old bundle.
//
// `applyUpdate()` is smart: if there's a waiting SW it does skip-waiting +
// reload; otherwise it hard-reloads (purging the bfcache) to fetch the new
// assets.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import {
  onSWUpdateAvailable,
  skipWaitingAndReload,
} from "@/lib/sw-register";

const POLL_INTERVAL_MS = 5 * 60_000;
const VERSION_URL = "/version.json";

interface VersionPayload {
  version: string;
  builtAt?: string;
}

function getRunningVersion(): string | null {
  // Replaced at build by vite.config.ts. Falls back to null in dev where the
  // define plugin is bypassed or HMR resets the value.
  const v = import.meta.env.VITE_APP_VERSION as string | undefined;
  if (!v || v === "undefined") return null;
  return v;
}

async function fetchLatestVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(`${VERSION_URL}?cb=${Date.now()}`, {
      cache: "no-store",
      signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as VersionPayload;
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hasWaitingSWRef = useRef(false);

  // ── SW path ───────────────────────────────────────────────────────────
  useEffect(() => {
    onSWUpdateAvailable(() => {
      hasWaitingSWRef.current = true;
      setUpdateAvailable(true);
    });
  }, []);

  // ── Web (manifest) path ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const running = getRunningVersion();
    if (!running) return; // Dev mode — skip polling.

    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      const latest = await fetchLatestVersion(controller.signal);
      if (cancelled || !latest) return;
      if (latest !== running) {
        setUpdateAvailable(true);
      }
    };

    // Initial check shortly after mount so users on stale tabs see the
    // prompt without waiting a full 5 minutes.
    const initialDelay = window.setTimeout(check, 4_000);
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    // Also re-check when the tab regains focus — laptops sleeping for hours
    // would otherwise miss the next interval tick.
    const onFocus = () => {
      void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(initialDelay);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (hasWaitingSWRef.current) {
      void skipWaitingAndReload();
      return;
    }
    // Web fallback: hard-reload so the browser fetches the new bundle.
    // Setting location.href (instead of reload) bypasses the bfcache that
    // can otherwise restore the stale tree.
    window.location.href = window.location.href.split("#")[0];
  }, []);

  return { updateAvailable, applyUpdate };
}
