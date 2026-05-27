import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { UpdatePasswordForm } from "@/modules/auth/components/UpdatePasswordForm";
import { z } from "zod";

const updatePasswordSearchSchema = z.object({
  force: z.boolean().optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/auth/update-password")({
  validateSearch: updatePasswordSearchSchema,
  head: () => ({
    meta: [{ title: "Update Password — EliteClass" }],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  return (
    <AuthLayout title="Create new password" subtitle="Choose a strong password for your account">
      <UpdatePasswordForm />
    </AuthLayout>
  );
}
