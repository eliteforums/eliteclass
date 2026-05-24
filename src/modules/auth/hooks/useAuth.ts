// ---------------------------------------------------------------------------
// EduOS — useAuth (auth module)
//
// A thin, module-scoped wrapper around the global `useAuthStore` and the
// `signOut` service function. Consumers within the auth module import this
// instead of reaching directly into the store or service layer.
//
// NOTE: This hook does NOT set up the Supabase `onAuthStateChange` listener —
// that responsibility belongs to the global `src/hooks/useAuth.ts` (typically
// called once at the app root via AuthProvider). This hook is read + logout only.
//
// Usage:
//   import { useAuth } from "@/modules/auth/hooks/useAuth"
//   const { user, role, logout } = useAuth()
// ---------------------------------------------------------------------------

import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/services/auth.service";
import type { User, Institute, UserRole } from "@/types";

// ── Return shape ─────────────────────────────────────────────────────────────

export interface UseAuthReturn {
  /** The currently authenticated user row, or `null` when logged out. */
  user: User | null;
  /** The institute the user belongs to, or `null` when logged out. */
  institute: Institute | null;
  /** `true` once a confirmed, non-expired session exists in the store. */
  isAuthenticated: boolean;
  /** `true` while the initial session hydration is in progress. */
  isLoading: boolean;
  /**
   * The role of the current user, derived from `user.role`.
   * Returns `null` when no user is authenticated.
   */
  role: UserRole | null;
  /**
   * The institute ID of the current user, derived from `user.institute_id`.
   * Returns `null` when no user is authenticated.
   */
  instituteId: string | null;
  /**
   * Signs the user out of Supabase and clears the local auth store.
   * Resolves once both operations complete (errors are swallowed — the store
   * is always cleared so the UI never gets stuck in an authenticated state).
   */
  logout: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Primary auth hook for components and hooks within the auth module.
 *
 * Combines reactive store state with the async `signOut` service so callers
 * get a single, stable API for reading session data and triggering logout.
 */
export function useAuth(): UseAuthReturn {
  const store = useAuthStore();

  /**
   * Calls the Supabase `signOut` RPC, then wipes the local auth store
   * regardless of whether the network call succeeded.
   * This ensures the UI always reflects the logged-out state even if the
   * server-side revocation fails (e.g. the user is offline).
   */
  async function logout(): Promise<void> {
    await signOut(); // best-effort — result intentionally ignored
    store.logout(); // always clear the store
  }

  return {
    user: store.user,
    institute: store.institute,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    role: store.getRole(),
    instituteId: store.getInstituteId(),
    logout,
  };
}
