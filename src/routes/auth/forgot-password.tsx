import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { ForgotPasswordForm } from "@/modules/auth/components/ForgotPasswordForm";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [{ title: "Reset Password — EduOS" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <AuthGuard>
      <AuthLayout
        title="Reset your password"
        subtitle="Enter your email and we'll send you a reset link"
        footer={
          <p>
            Remembered it?{" "}
            <Link
              to="/auth/login"
              className="font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Back to sign in
            </Link>
          </p>
        }
      >
        <ForgotPasswordForm />
      </AuthLayout>
    </AuthGuard>
  );
}
