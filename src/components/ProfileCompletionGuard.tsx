import { useState, useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { checkProfileCompleteness } from "@/utils/profileCompleteness";

interface ProfileCompletionGuardProps {
  children: ReactNode;
}

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

    async function checkProfile() {
      try {
        // Get student record with emergency_contact
        const { data: student } = await supabase!
          .from("students")
          .select("id, emergency_contact")
          .eq("user_id", user!.id)
          .single();

        if (!student) {
          setIsComplete(true); // fail-open
          return;
        }

        // Get linked parent info
        const { data: parentLinks } = await supabase!
          .from("student_parents")
          .select("parent:parents(user_id)")
          .eq("student_id", student.id)
          .limit(1);

        let parentName: string | null = null;
        let parentPhone: string | null = null;
        let parentEmail: string | null = null;

        if (parentLinks && parentLinks.length > 0) {
          const parentUserId = (parentLinks[0] as any)?.parent?.user_id;
          if (parentUserId) {
            const { data: parentUser } = await supabase!
              .from("users")
              .select("name, phone, email")
              .eq("id", parentUserId)
              .single();
            if (parentUser) {
              parentName = parentUser.name;
              parentPhone = parentUser.phone;
              parentEmail = parentUser.email;
            }
          }
        }

        const result = checkProfileCompleteness(
          student.emergency_contact as any,
          parentName,
          parentPhone,
          parentEmail,
        );
        setIsComplete(result.isComplete);
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
