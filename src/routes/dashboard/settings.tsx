// ---------------------------------------------------------------------------
// EliteClass — /dashboard/settings
// Profile & Institute settings page. Available to all roles.
// Admins see an additional "Institute" section.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, User as UserIcon, Building2, Lock, Check, Globe } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import {
  updateProfile,
  updateInstitute,
  changePassword,
} from "@/services/profile.service";
import { useTranslation, LANGUAGES } from "@/lib/i18n";
import { AvatarPicker } from "@/components/avatars/AvatarPicker";
import { AvatarDisplay } from "@/components/avatars/AvatarPreview";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — EliteClass" }] }),
  component: SettingsPage,
});

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
});

const instituteSchema = z.object({
  name: z.string().min(2, "Institute name must be at least 2 characters"),
});

const passwordSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type InstituteFormValues = z.infer<typeof instituteSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

// ── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff", "student", "parent"]}>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { user, institute, setUser, setInstitute } = useAuthStore();
  const isAdmin = user?.role === "admin";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, security, and preferences."
      />

      <div className="mt-6 space-y-8">
        {/* Language Section */}
        <LanguageSection />

        {/* Profile Section */}
        <ProfileSection />

        {/* Password Section */}
        <PasswordSection />

        {/* Institute Section (admin only) */}
        {isAdmin && <InstituteSection />}
      </div>
    </div>
  );
}

// ── Language Section ──────────────────────────────────────────────────────────

function LanguageSection() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
          <Globe className="h-4 w-4 text-indigo-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("settings.language")}</h2>
          <p className="text-xs text-muted-foreground">{t("settings.selectLanguage")}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              language === lang.code
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{lang.nativeName}</div>
              <div className="text-xs text-muted-foreground">{lang.name}</div>
            </div>
            {language === lang.code && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection() {
  const { user, setUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    setSaving(true);

    const result = await updateProfile(user.id, {
      name: values.name,
      phone: values.phone || null,
    });

    setSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to update profile");
      return;
    }

    if (result.data) {
      setUser(result.data);
    }
    toast.success("Profile updated");
  }

  async function handleAvatarSelect(avatarConfig: string) {
    if (!user) return;
    setSavingAvatar(true);

    const result = await updateProfile(user.id, { avatar_url: avatarConfig });
    setSavingAvatar(false);

    if (result.success && result.data) {
      setUser(result.data);
      toast.success("Avatar updated!");
      setShowAvatarPicker(false);
    } else {
      toast.error(result.error ?? "Failed to update avatar");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <UserIcon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Profile</h2>
          <p className="text-xs text-muted-foreground">Your personal information</p>
        </div>
      </div>

      {/* Avatar Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-foreground mb-2">Profile Picture</label>
        <div className="flex items-center gap-4">
          <AvatarDisplay
            avatarUrl={user?.avatar_url}
            name={user?.name ?? "User"}
            size={64}
          />
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            >
              {showAvatarPicker ? "Close" : "Change Avatar"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Choose from 18+ avatar styles</p>
          </div>
        </div>

        {showAvatarPicker && (
          <div className="mt-4 rounded-lg border border-border p-4 bg-background">
            <AvatarPicker
              currentAvatar={user?.avatar_url}
              userName={user?.name ?? "User"}
              onSelect={handleAvatarSelect}
              onCancel={() => setShowAvatarPicker(false)}
            />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">Email cannot be changed</p>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="settings-name" className="block text-sm font-medium text-foreground">
            Full Name
          </label>
          <input
            id="settings-name"
            type="text"
            {...register("name")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label htmlFor="settings-phone" className="block text-sm font-medium text-foreground">
            Phone
          </label>
          <input
            id="settings-phone"
            type="tel"
            {...register("phone")}
            placeholder="+91 98765 43210"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>

        {/* Role (read-only) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Role</label>
          <input
            type="text"
            value={user?.role?.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? ""}
            disabled
            className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed capitalize"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Password Section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordFormValues) {
    setSaving(true);
    const result = await changePassword(values.newPassword);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to change password");
      return;
    }

    toast.success("Password changed successfully");
    reset();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
          <Lock className="h-4 w-4 text-orange-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Security</h2>
          <p className="text-xs text-muted-foreground">Change your password</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="block text-sm font-medium text-foreground">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
            placeholder="••••••••"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.newPassword && (
            <p className="text-xs text-destructive">{errors.newPassword.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
            placeholder="••••••••"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {saving ? "Updating…" : "Change Password"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Institute Section (admin only) ───────────────────────────────────────────

function InstituteSection() {
  const { institute, setInstitute } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<InstituteFormValues>({
    resolver: zodResolver(instituteSchema),
    defaultValues: {
      name: institute?.name ?? "",
    },
  });

  async function onSubmit(values: InstituteFormValues) {
    if (!institute) return;
    setSaving(true);

    const result = await updateInstitute(institute.id, { name: values.name });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to update institute");
      return;
    }

    if (result.data) {
      setInstitute(result.data);
    }
    toast.success("Institute updated");
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !institute) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, SVG).");
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file must be under 2MB.");
      return;
    }

    setUploadingLogo(true);

    try {
      // Upload to Supabase Storage
      const ext = file.name.split(".").pop() ?? "png";
      const filePath = `institute-logos/${institute.id}/logo.${ext}`;

      const { data: uploadData, error: uploadError } = await (await import("@/lib/supabase")).supabase!
        .storage.from("public-assets")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        toast.error("Failed to upload logo: " + uploadError.message);
        setUploadingLogo(false);
        return;
      }

      // Get public URL
      const { data: urlData } = (await import("@/lib/supabase")).supabase!
        .storage.from("public-assets")
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        toast.error("Failed to get logo URL.");
        setUploadingLogo(false);
        return;
      }

      // Update institute record with logo URL
      const result = await updateInstitute(institute.id, { logo: publicUrl });
      if (result.success && result.data) {
        setInstitute(result.data);
        toast.success("Institute logo updated!");
      } else {
        toast.error(result.error ?? "Failed to save logo.");
      }
    } catch (err) {
      toast.error("An error occurred uploading the logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (!institute) return;
    setSaving(true);

    const result = await updateInstitute(institute.id, { logo: null });
    if (result.success && result.data) {
      setInstitute(result.data);
      toast.success("Logo removed.");
    } else {
      toast.error(result.error ?? "Failed to remove logo.");
    }
    setSaving(false);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
          <Building2 className="h-4 w-4 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Institute</h2>
          <p className="text-xs text-muted-foreground">Manage your institute details</p>
        </div>
      </div>

      {/* Logo Upload Section */}
      <div className="mb-6 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Institute Logo
        </label>
        <p className="text-xs text-muted-foreground">
          This logo will be used on certificates and official documents.
        </p>
        <div className="flex items-center gap-4">
          {/* Logo preview */}
          <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
            {institute?.logo ? (
              <img
                src={institute.logo}
                alt="Institute logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground/50" />
            )}
          </div>

          {/* Upload controls */}
          <div className="flex flex-col gap-2">
            <label className="relative cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                {uploadingLogo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>Upload Logo</>
                )}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {institute?.logo && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="text-xs text-destructive hover:underline text-left"
              >
                Remove logo
              </button>
            )}
            <p className="text-[10px] text-muted-foreground">PNG, JPG, SVG. Max 2MB.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="institute-name" className="block text-sm font-medium text-foreground">
            Institute Name
          </label>
          <input
            id="institute-name"
            type="text"
            {...register("name")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Subscription (read-only) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Subscription Plan</label>
          <input
            type="text"
            value={institute?.subscription_plan?.toUpperCase() ?? "—"}
            disabled
            className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
