import { useState, useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";

interface ProfileCompletionGuardProps {
  children: ReactNode;
}

// Session-level flag: once the student completes the form in this session,
// skip the guard entirely to prevent redirect loops when RLS blocks the read-back.
const SESSION_KEY = "eliteclass-profile-completed";

export function ProfileCompletionGuard({ children }: ProfileCompletionGuardProps) {
  const { user } = useAuthStore();
  const location = useLocation();
  const [isComplete, setIsComplete] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    if (!user || user.role !== "student" || !supabase) {
      setIsComplete(true); // non-student or no supabase = pass through
      return;
    }

    // Don't check if already on the complete-profile page
    if (location.pathname.includes("complete-profile")) {
      setIsComplete(true);
      return;
    }

    // If the student already completed the form in this session, skip check
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      setIsComplete(true);
      return;
    }

    async function checkProfile() {
      try {
        // Get student record — check if emergency_contact has been filled
        const { data: student } = await supabase!
          .from("students")
          .select("id, emergency_contact")
          .eq("user_id", user!.id)
          .single();

        if (!student) {
          setIsComplete(true); // fail-open if no student record found
          return;
        }

        // Profile is complete if emergency_contact has name and phone filled
        const ec = student.emergency_contact as { name?: string; phone?: string; relation?: string } | null;
        const hasEmergencyContact = !!(ec?.name?.trim() && ec?.phone?.trim());

        if (hasEmergencyContact) {
          // Persist in session so we don't re-query
          sessionStorage.setItem(SESSION_KEY, "true");
        }

        setIsComplete(hasEmergencyContact);
      } catch {
        setIsComplete(true); // fail-open on errors
      }
    }

    checkProfile();
  }, [user, location.pathname]);

  // Loading state — show nothing (brief flash)
  if (isComplete === null) {
    return null;
  }

  // Profile incomplete — redirect
  if (!isComplete) {
    return <Navigate to="/dashboard/student/complete-profile" />;
  }

  return <>{children}</>;
}

/**
 * Call this after successfully saving the profile completion form.
 * Sets the session flag so the guard won't redirect back.
 */
export function markProfileAsCompleted(): void {
  sessionStorage.setItem(SESSION_KEY, "true");
}
