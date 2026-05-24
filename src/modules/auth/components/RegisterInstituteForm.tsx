import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { registerInstitute } from "@/modules/auth/services/register.service";
import { registerInstituteSchema, type RegisterInstituteSchema } from "@/modules/auth/validations";
import { getDashboardPath } from "@/utils/rbac";

// ---------------------------------------------------------------------------
// Shared class names
// ---------------------------------------------------------------------------

const inputClassName =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const labelClassName = "block text-sm font-medium text-foreground";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegisterInstituteForm() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // When Supabase email confirmation is enabled, signUp() returns no session.
  // We show a "check your inbox" screen instead of redirecting to dashboard.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInstituteSchema>({
    resolver: zodResolver(registerInstituteSchema),
  });

  async function onSubmit(values: RegisterInstituteSchema) {
    setServerError(null);

    // Strip UI-only confirmPassword before hitting the service
    const { confirmPassword: _, ...payload } = values;

    const result = await registerInstitute(payload);

    if (!result.success) {
      setServerError(result.error ?? "Registration failed. Please try again.");
      return;
    }

    if (result.data!.requiresEmailConfirmation) {
      // Email confirmation is enabled in Supabase — no active session yet.
      // Show the confirmation pending screen so the user knows to check inbox.
      setRegisteredEmail(values.email);
      return;
    }

    // Email confirmation is disabled — session is live, go straight to dashboard.
    const destination = getDashboardPath("admin");
    navigate({ to: destination, replace: true });
  }

  // ── Email confirmation pending screen ──────────────────────────────────────
  if (registeredEmail) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">Check your inbox</p>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{registeredEmail}</span>. Click it to
            activate your account and access your admin dashboard.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Didn't receive it? Check your spam folder or{" "}
          <button
            type="button"
            onClick={() => setRegisteredEmail(null)}
            className="font-medium text-primary hover:text-primary/80 transition-colors underline underline-offset-2"
          >
            try again
          </button>
          .
        </p>
        <Link
          to="/auth/login"
          className="mt-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Server error banner */}
      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Institute Name */}
      <div className="space-y-1.5">
        <label htmlFor="instituteName" className={labelClassName}>
          Institute name
        </label>
        <input
          id="instituteName"
          type="text"
          autoComplete="organization"
          placeholder="Acme Academy"
          {...register("instituteName")}
          className={inputClassName}
        />
        {errors.instituteName && (
          <p className="text-xs text-destructive">{errors.instituteName.message}</p>
        )}
      </div>

      {/* Your Name */}
      <div className="space-y-1.5">
        <label htmlFor="adminName" className={labelClassName}>
          Your name
        </label>
        <input
          id="adminName"
          type="text"
          autoComplete="name"
          placeholder="Dr. Arun Kumar"
          {...register("adminName")}
          className={inputClassName}
        />
        {errors.adminName && <p className="text-xs text-destructive">{errors.adminName.message}</p>}
      </div>

      {/* Email Address */}
      <div className="space-y-1.5">
        <label htmlFor="email" className={labelClassName}>
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="admin@acme.edu"
          {...register("email")}
          className={inputClassName}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {/* Phone Number */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className={labelClassName}>
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          {...register("phone")}
          className={inputClassName}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label htmlFor="password" className={labelClassName}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            {...register("password")}
            className={inputClassName + " pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className={labelClassName}>
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            {...register("confirmPassword")}
            className={inputClassName + " pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? "Creating…" : "Create institute"}
      </button>

      {/* Divider */}
      <div className="relative my-2 flex items-center">
        <div className="flex-1 border-t border-border" />
        <span className="mx-3 text-xs text-muted-foreground">or</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Sign-in link */}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/auth/login"
          className="font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
