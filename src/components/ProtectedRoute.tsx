import { type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { isRoleAllowed } from "@/utils/rbac";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
  /** Roles permitted to view this route. Empty array = any authenticated user. */
  allowedRoles?: UserRole[];
  /** Fallback while the auth store is still rehydrating from localStorage. */
  loadingFallback?: ReactNode;
  children: ReactNode;
}

/**
 * Wraps a page component and enforces authentication + role-based access.
 *
 * Behaviour:
 *  - While loading  → renders `loadingFallback` (default: full-screen spinner)
 *  - Not authenticated → redirects to /auth/login
 *  - Authenticated but wrong role → redirects to /unauthorized
 *  - Authenticated + correct role → renders children
 */
export function ProtectedRoute({
  allowedRoles = [],
  loadingFallback,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      loadingFallback ?? (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" />;
  }

  if (allowedRoles.length > 0 && !isRoleAllowed(user.role, allowedRoles)) {
    return <Navigate to="/unauthorized" />;
  }

  return <>{children}</>;
}
