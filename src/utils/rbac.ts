import type { UserRole } from "@/types";

// ---------------------------------------------------------------------------
// Permission Map
// Each role lists the exact permission strings it holds.
// super_admin holds '*' (wildcard) and bypasses all checks.
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"], // wildcard — all permissions granted

  admin: [
    "institute:read",
    "institute:update",
    "students:create",
    "students:read",
    "students:update",
    "students:delete",
    "staff:create",
    "staff:read",
    "staff:update",
    "staff:delete",
    "parents:read",
    "lms:courses:manage",
    "lms:courses:enroll",
    "lms:analytics:read",
  ],

  staff: [
    "students:read",
    "parents:read",
    "staff:read",
    "lms:courses:manage:own",
    "lms:courses:enroll",
    "lms:analytics:read:own",
  ],

  student: ["students:read:own", "lms:courses:learn", "lms:progress:write"],

  parent: ["students:read:linked", "parents:read:own", "lms:progress:read:linked"],
};

// ---------------------------------------------------------------------------
// Display labels (used in UI dropdowns, badges, etc.)
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  student: "Student",
  parent: "Parent",
};

// ---------------------------------------------------------------------------
// Dashboard redirect paths per role
// After login, the auth flow navigates here based on the session role.
// ---------------------------------------------------------------------------

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  super_admin: "/dashboard/super-admin",
  admin: "/dashboard/admin",
  staff: "/dashboard/staff",
  student: "/dashboard/student",
  parent: "/dashboard/parent",
};

// ---------------------------------------------------------------------------
// Role hierarchy — higher number = more access
// Used for "minimum role" guards (e.g. admin+ can see X).
// ---------------------------------------------------------------------------

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 5,
  admin: 4,
  staff: 3,
  student: 2,
  parent: 1,
};

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Check whether a role holds a specific permission string.
 * super_admin always returns true via the wildcard.
 *
 * @example hasPermission('admin', 'students:delete') // true
 * @example hasPermission('staff', 'students:delete') // false
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (permissions.includes("*")) return true;
  return permissions.includes(permission);
}

/**
 * Check whether `userRole` is in the `allowedRoles` list.
 * If `allowedRoles` is empty the route is considered public.
 *
 * @example isRoleAllowed('admin', ['admin', 'staff']) // true
 */
export function isRoleAllowed(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(userRole);
}

/**
 * Resolve the default post-login dashboard path for a given role.
 * Falls back to the student dashboard if the role is somehow unrecognised.
 */
export function getDashboardPath(role: UserRole): string {
  return ROLE_DASHBOARD_PATHS[role] ?? "/dashboard/student";
}

/**
 * Return true when `userRole` is at least as privileged as `requiredRole`
 * according to the numeric hierarchy.
 *
 * @example hasMinimumRole('admin', 'staff')      // true  (4 >= 3)
 * @example hasMinimumRole('student', 'staff')    // false (2 < 3)
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
