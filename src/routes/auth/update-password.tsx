import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/layouts/AuthLayout";
import { UpdatePasswordForm } from "@/modules/auth/components/UpdatePasswordForm";

export const Route = createFileRoute("/auth/update-password")({
  head: () => ({
    meta: [{ title: "Update Password — EduOS" }],
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
