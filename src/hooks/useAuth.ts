// ---------------------------------------------------------------------------
// useAuth — read-only access to auth state (no side effects).
//
// Session hydration and Supabase listeners live ONLY in AuthProvider.
// Do not register onAuthStateChange here — duplicate listeners cause
// double fetches, race conditions, and FetchError spikes.
// ---------------------------------------------------------------------------

import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/services/auth.service";
import type { UserRole } from "@/types";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const institute = useAuthStore((s) => s.institute);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  async function logout() {
    await signOut();
    useAuthStore.getState().logout();
  }

  return {
    user,
    institute,
    isAuthenticated,
    isLoading,
    role: (user?.role ?? null) as UserRole | null,
    instituteId: user?.institute_id ?? null,
    logout,
  };
}
