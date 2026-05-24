// AuthGuard — redirects already-authenticated users away from auth pages.
// Place this inside auth route components (login, register-institute, etc.)
// to prevent authenticated users from seeing the auth forms.

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { getDashboardPath } from "@/utils/rbac";
import type { ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      void navigate({
        to: getDashboardPath(user.role),
        replace: true,
      });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  // Still rehydrating from storage — show a full-screen spinner
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Authenticated — render nothing while the redirect effect fires
  if (isAuthenticated && user) {
    return null;
  }

  // Not authenticated — render the auth form
  return <>{children}</>;
}
