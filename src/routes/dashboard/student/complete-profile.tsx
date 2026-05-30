import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { isValidPhone } from "@/utils/phoneValidation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";
import { markProfileAsCompleted } from "@/components/ProfileCompletionGuard";

export const Route = createFileRoute("/dashboard/student/complete-profile")({
  head: () => ({ meta: [{ title: "Complete Your Profile — EliteClass" }] }),
  component: CompleteProfilePage,
});

const profileSchema = z.object({
  parent_name: z.string().min(1, "Parent/Guardian name is required"),
  parent_phone: z.string().refine(isValidPhone, "Enter a valid Indian phone number"),
  parent_email: z.string().email("Enter a valid email address"),
  emergency_contact_name: z.string().min(1, "Emergency contact name is required"),
  emergency_contact_phone: z.string().refine(isValidPhone, "Enter a valid Indian phone number"),
  emergency_contact_relation: z.enum(["father", "mother", "guardian", "sibling", "other"], {
    required_error: "Select a relation",
  }),
});

type ProfileFormData = z.infer<typeof profileSchema>;

function CompleteProfilePage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  async function onSubmit(data: ProfileFormData) {
    if (!supabase || !user) return;
    setIsSubmitting(true);

    try {
      // 1. Get student record
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, institute_id")
        .eq("user_id", user.id)
        .single();

      if (studentError || !student) {
        toast.error("Could not find your student record.");
        setIsSubmitting(false);
        return;
      }

      // 2. Update emergency_contact on student
      const { error: updateError, data: updatedStudent } = await supabase
        .from("students")
        .update({
          emergency_contact: {
            name: data.emergency_contact_name,
            phone: data.emergency_contact_phone,
            relation: data.emergency_contact_relation,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", student.id)
        .select("id, emergency_contact")
        .single();

      if (updateError) {
        toast.error("Failed to save emergency contact: " + updateError.message);
        setIsSubmitting(false);
        return;
      }

      // Verify the update actually persisted (RLS may silently block)
      if (!updatedStudent?.emergency_contact) {
        toast.error("Unable to save profile data. Please contact your institute admin.");
        setIsSubmitting(false);
        return;
      }

      // 3. Create or update parent using SECURITY DEFINER RPC
      // This bypasses RLS since students can't directly INSERT into users table
      await supabase.rpc("create_parent_for_student", {
        p_student_id: student.id,
        p_institute_id: student.institute_id,
        p_parent_name: data.parent_name,
        p_parent_email: data.parent_email,
        p_parent_phone: data.parent_phone,
        p_relation: data.emergency_contact_relation,
      });
      // Parent creation is best-effort — don't block on failure

      toast.success("Profile completed successfully!");
      markProfileAsCompleted();
      navigate({ to: "/dashboard/student" });
    } catch (err) {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="mx-auto max-w-2xl space-y-6 py-8 px-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Complete Your Profile</h1>
          <p className="text-muted-foreground">
            Please provide your parent/guardian and emergency contact details to continue.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Parent / Guardian Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Parent/Guardian Section */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="parent_name" className="block text-sm font-medium text-foreground mb-1.5">
                    Parent/Guardian Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="parent_name"
                    type="text"
                    {...register("parent_name")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="Enter parent/guardian full name"
                  />
                  {errors.parent_name && (
                    <p className="mt-1 text-xs text-destructive">{errors.parent_name.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="parent_phone" className="block text-sm font-medium text-foreground mb-1.5">
                    Parent Phone <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="parent_phone"
                    type="tel"
                    {...register("parent_phone")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="+91 9876543210"
                  />
                  {errors.parent_phone && (
                    <p className="mt-1 text-xs text-destructive">{errors.parent_phone.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="parent_email" className="block text-sm font-medium text-foreground mb-1.5">
                    Parent Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="parent_email"
                    type="email"
                    {...register("parent_email")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="parent@example.com"
                  />
                  {errors.parent_email && (
                    <p className="mt-1 text-xs text-destructive">{errors.parent_email.message}</p>
                  )}
                </div>
              </div>

              {/* Emergency Contact Section */}
              <div className="border-t pt-6 space-y-4">
                <h3 className="text-base font-medium">Emergency Contact</h3>

                <div>
                  <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-foreground mb-1.5">
                    Contact Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="emergency_contact_name"
                    type="text"
                    {...register("emergency_contact_name")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="Emergency contact full name"
                  />
                  {errors.emergency_contact_name && (
                    <p className="mt-1 text-xs text-destructive">{errors.emergency_contact_name.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-foreground mb-1.5">
                    Contact Phone <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="emergency_contact_phone"
                    type="tel"
                    {...register("emergency_contact_phone")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="+91 9876543210"
                  />
                  {errors.emergency_contact_phone && (
                    <p className="mt-1 text-xs text-destructive">{errors.emergency_contact_phone.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="emergency_contact_relation" className="block text-sm font-medium text-foreground mb-1.5">
                    Relation <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="emergency_contact_relation"
                    {...register("emergency_contact_relation")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">Select relation</option>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                    <option value="sibling">Sibling</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.emergency_contact_relation && (
                    <p className="mt-1 text-xs text-destructive">{errors.emergency_contact_relation.message}</p>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Complete Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
