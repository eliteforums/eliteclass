// ---------------------------------------------------------------------------
// AuthProvider — bootstraps auth state before any route component renders.
//
// Responsibilities:
//   1. On mount, restores any existing Supabase session from localStorage
//      and populates the Zustand authStore so every route sees consistent
//      state immediately (no flash of unauthenticated content).
//   2. Subscribes to onAuthStateChange so sign-in / sign-out / token refresh
//      events update the store automatically without a page reload.
//   3. Cleans up the subscription on unmount (SPA teardown / hot-reload).
//
// SUPABASE NULL SAFETY
//   `supabase` is typed as `SupabaseClient | null` (see src/lib/supabase.ts).
//   When env vars are missing the client is null and the entire auth system
//   is non-operational. The effect below detects this early and calls
//   logout() so that:
//     • isLoading is set to false → ProtectedRoute stops spinning.
//     • isAuthenticated stays false → auth pages render normally.
//     • No auth listener is registered → no null-dereference crash.
//
// This component is purely behavioural — it renders children as-is.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/helpers";

const AUTH_REFRESH_DEBOUNCE_MS = 800;

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const setLoading = useAuthStore((s) => s.setLoading);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // ── Guard: Supabase not configured ──────────────────────────────────────
    // If env vars are absent, `supabase` is null. There is nothing to
    // initialise — immediately mark loading as done so the rest of the UI
    // renders in a "logged out" state without hanging on the spinner.
    if (!supabase) {
      logout(); // sets isLoading = false, isAuthenticated = false
      return;
    }

    // TypeScript narrows `supabase` to `SupabaseClient` for everything below.
    // The module-level const cannot be reassigned, so the narrowing holds
    // inside the nested async function and the onAuthStateChange callback.

    // ── Phase 1: Restore session from localStorage ───────────────────────────
    // Runs once on mount. getCurrentUser() checks the stored JWT and fetches
    // the full user + institute record from the database.
    async function hydrateFromSession() {
      if (typeof window === "undefined") {
        logout();
        return;
      }
      setLoading(true);
      try {
        const result = await getCurrentUser();
        if (!mountedRef.current) return;
        if (result.success && result.data) {
          login(result.data.user, result.data.institute);
        } else {
          // Only logout if there's genuinely no session (not a transient network error)
          const { data: { session } } = await supabase!.auth.getSession();
          if (!session) {
            logout();
          } else {
            // Session exists but profile fetch failed — keep user logged in
            // This prevents logout on transient network errors during tab switch
            setLoading(false);
          }
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.warn("[AuthProvider] session hydrate failed:", getErrorMessage(err));
        // Don't logout on network errors — keep existing auth state
        setLoading(false);
      }
    }

    void hydrateFromSession();

    function scheduleHydrate(event: AuthChangeEvent) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const delay = event === "TOKEN_REFRESHED" ? AUTH_REFRESH_DEBOUNCE_MS : 0;
      refreshTimerRef.current = setTimeout(() => {
        void hydrateFromSession();
      }, delay);
    }

    // ── Phase 2: React to live Supabase auth events ──────────────────────────
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT" || !session) {
        // Before logging out, verify the session is actually gone.
        // During bulk operations, rate limiting can cause transient auth errors
        // that fire SIGNED_OUT even though the session is still valid.
        supabase!.auth.getSession().then(({ data }) => {
          if (!data.session) {
            logout();
          }
          // If session still exists, ignore this event — it was a false alarm
        }).catch(() => {
          // Network error checking session — don't logout, keep current state
        });
        return;
      }
      if (event === "SIGNED_IN") {
        // Only re-hydrate on actual sign-in, not on token refresh.
        // Token refresh happens automatically when returning to the tab —
        // re-hydrating on every refresh causes unnecessary API calls and
        // can trigger logout if the network is slow.
        scheduleHydrate(event);
      }
      // TOKEN_REFRESHED: Supabase handles this internally — no action needed.
      // The session is already updated in localStorage by the Supabase client.
    });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => subscription.unsubscribe();

    // login/logout/setLoading are stable Zustand actions — intentionally
    // omitted from deps to prevent infinite re-subscription loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
