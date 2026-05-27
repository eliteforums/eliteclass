import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

interface Props {
  children: ReactNode;
}

/**
 * Checks if the current user has `force_password_change: true` in their
 * Supabase user_metadata. If so, redirects them to `/auth/update-password`
 * so they must set a new password before accessing the platform.
 */
export function ForcePasswordChangeGuard({ children }: Props) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const metadata = data?.session?.user?.user_metadata;
      if (metadata?.force_password_change === true) {
        navigate({ to: "/auth/update-password" });
      }
    });
  }, [isAuthenticated, navigate]);

  return <>{children}</>;
}
