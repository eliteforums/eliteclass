// ---------------------------------------------------------------------------
// EduOS — useRoleRedirect
//
// Guards auth pages (login, register, forgot-password) against users who
// are already authenticated. Call `redirectIfAuthenticated()` at the top of
// an auth page's render logic (or in a `useEffect`) to bounce the user to
// their role-appropriate dashboard if a valid session already exists.
//
// Usage:
//   import { useRoleRedirect } from "@/modules/auth/hooks/useRoleRedirect"
//
//   function LoginPage() {
//     const { redirectIfAuthenticated, isLoading } = useRoleRedirect()
//     redirectIfAuthenticated()
//     if (isLoading) return <Spinner />
//     return <LoginForm />
//   }
// ---------------------------------------------------------------------------

import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { getDashboardPath } from "@/utils/rbac";
import type { UserRole } from "@/types";

// ── Return shape ─────────────────────────────────────────────────────────────

export interface UseRoleRedirectReturn {
  /**
   * When the current user is authenticated, resolves their dashboard path via
   * `getDashboardPath(role)` and navigates there imperatively.
   * Is a no-op when `isLoading` is `true` or when no session exists.
   */
  redirectIfAuthenticated: () => void;
  /** `true` while the initial session hydration is in progress. */
  isLoading: boolean;
  /** `true` once a confirmed, non-expired session exists in the store. */
  isAuthenticated: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provides a guard function for auth pages that should not be accessible
 * to already-authenticated users.
 *
 * Reads session state directly from `useAuthStore` (no network call) and
 * uses TanStack Router's `useNavigate` for client-side navigation.
 */
export function useRoleRedirect(): UseRoleRedirectReturn {
  const navigate = useNavigate();

  // Read exactly the fields we need — stable selectors avoid re-renders
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const getRole = useAuthStore((s) => s.getRole);

  /**
   * If the user already has a valid session, navigate them to the correct
   * role-based dashboard. Skips the redirect while the session is still
   * being hydrated from localStorage / Supabase to avoid a flash of the
   * auth page followed by an immediate redirect.
   */
  function redirectIfAuthenticated(): void {
    // Wait until we know the definitive auth state
    if (isLoading) return;

    if (isAuthenticated) {
      const role: UserRole | null = getRole();

      // getDashboardPath has a built-in fallback, but we still guard against
      // a null role to satisfy TypeScript and avoid passing `null` to it.
      const destination = role ? getDashboardPath(role) : "/dashboard/student";

      navigate({ to: destination, replace: true });
    }
  }

  return {
    redirectIfAuthenticated,
    isLoading,
    isAuthenticated,
  };
}
