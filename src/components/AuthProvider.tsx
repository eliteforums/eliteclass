// ---------------------------------------------------------------------------
// AuthProvider — bootstraps auth state before any route component renders.
//
// Responsibilities:
//   1. On mount, restores any existing Supabase session from localStorage
//      and populates the Zustand authStore so every route sees consistent
//      state immediately (no flash of unauthenticated content).
//   2. Subscribes to onAuthStateChange so explicit sign-out events
//      update the store automatically.
//   3. Cleans up the subscription on unmount (SPA teardown / hot-reload).
//
// IMPORTANT: This provider intentionally IGNORES most auth state change events
// (TOKEN_REFRESHED, transient SIGNED_OUT from tab switches) to prevent
// unwanted page refreshes. Only explicit user-initiated sign-out is honored.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/services/auth.service";
import { getErrorMessage } from "@/utils/helpers";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Global flag set by the signOut() service function BEFORE calling
 * supabase.auth.signOut(). This lets the onAuthStateChange listener
 * distinguish between an intentional logout and a transient SIGNED_OUT
 * event caused by token refresh failures on tab switch.
 */
let userInitiatedSignOut = false;

/** Call this from your signOut/logout service before calling supabase.auth.signOut() */
export function markSignOutIntentional() {
  userInitiatedSignOut = true;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const setLoading = useAuthStore((s) => s.setLoading);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!supabase) {
      logout();
      return;
    }

    // ── Phase 1: Restore session on mount ────────────────────────────────────
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
          // Check if there's still a valid session in storage
          const { data: { session } } = await supabase!.auth.getSession();
          if (!session) {
            logout();
          } else {
            // Session exists but profile fetch failed — keep logged in
            setLoading(false);
          }
        }
      } catch {
        if (!mountedRef.current) return;
        // Network error — don't logout, keep existing state
        setLoading(false);
      }
    }

    void hydrateFromSession();

    // ── Phase 2: Listen for auth events ──────────────────────────────────────
    // ONLY react to intentional sign-out. Ignore everything else.
    // Token refresh, tab switch events, and transient errors are all ignored
    // to prevent the page from refreshing unexpectedly.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        // Only logout if the user explicitly initiated sign-out
        if (userInitiatedSignOut) {
          userInitiatedSignOut = false;
          logout();
        }
        // Otherwise ignore — this is a transient event from tab switch / token refresh
        return;
      }

      if (event === "SIGNED_IN" && session) {
        // Fresh sign-in (e.g. from another tab or OAuth callback)
        // Only hydrate if we're not already authenticated
        const currentState = useAuthStore.getState();
        if (!currentState.isAuthenticated) {
          void hydrateFromSession();
        }
      }

      // TOKEN_REFRESHED, INITIAL_SESSION, etc. — all ignored.
      // The Supabase client handles token refresh internally.
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
