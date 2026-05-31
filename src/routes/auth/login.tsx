import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { LoginForm } from "@/modules/auth/components/LoginForm";

export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { title: "Sign in — EliteClass" },
      { name: "description", content: "Sign in to your EliteClass account" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <AuthGuard>
      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to your institute account"
      >
        <LoginForm />
      </AuthLayout>
    </AuthGuard>
  );
}
