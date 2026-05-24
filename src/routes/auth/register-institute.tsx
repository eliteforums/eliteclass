import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { RegisterInstituteForm } from "@/modules/auth/components/RegisterInstituteForm";

export const Route = createFileRoute("/auth/register-institute")({
  head: () => ({
    meta: [{ title: "Register Institute — EduOS" }],
  }),
  component: RegisterInstitutePage,
});

function RegisterInstitutePage() {
  return (
    <AuthGuard>
      <AuthLayout title="Start your free trial" subtitle="Set up your institute in 2 minutes">
        <RegisterInstituteForm />
      </AuthLayout>
    </AuthGuard>
  );
}
