// ---------------------------------------------------------------------------
// usePermission — lightweight RBAC helpers for component-level guards.
//
// Usage examples:
//   const { can, isAllowed } = usePermission();
//   can('students:delete')              // true for admin / super_admin
//   isAllowed(['admin', 'super_admin']) // true when user holds either role
// ---------------------------------------------------------------------------

import { useAuthStore, type AuthState } from "@/store/authStore";
import { hasPermission, isRoleAllowed } from "@/utils/rbac";
import type { UserRole } from "@/types";

export function usePermission() {
  // Subscribe to only the role selector to avoid unnecessary re-renders.
  const role = useAuthStore((s: AuthState) => s.getRole());

  /**
   * Returns `true` when the current user's role holds the given permission
   * string (e.g. `'students:delete'`). Always returns `false` for unauthenticated
   * users; always returns `true` for `super_admin` (wildcard).
   */
  function can(permission: string): boolean {
    if (!role) return false;
    return hasPermission(role, permission);
  }

  /**
   * Returns `true` when the current user's role is included in
   * `allowedRoles`. Passing an empty array is treated as "public" and
   * returns `true`.
   */
  function isAllowed(allowedRoles: UserRole[]): boolean {
    if (!role) return false;
    return isRoleAllowed(role, allowedRoles);
  }

  return {
    /** Fine-grained permission check against the ROLE_PERMISSIONS map. */
    can,
    /** Coarse-grained allowlist check against an array of roles. */
    isAllowed,
    /** The raw role string, or `null` when unauthenticated. */
    role,
  };
}
