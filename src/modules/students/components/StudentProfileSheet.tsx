// ---------------------------------------------------------------------------
// EduOS — StudentProfileSheet
//
// A fixed right-side slide-in panel that displays a student's full profile.
// Opens with a backdrop overlay and closes via the X button or backdrop click.
//
// Features:
//  - Avatar with large initials
//  - Info grid: email, phone, batch, joined date
//  - Emergency contact section (rendered only when data is present)
//  - Masked Aadhaar display
//  - Linked parents count (fetched internally when the sheet opens)
//  - Footer: Archive/Restore + Edit actions
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  Shield,
  Users,
  AlertTriangle,
  Archive,
  RotateCcw,
  Pencil,
  Loader2,
  Key,
  Copy,
  Check,
  RefreshCw,
  ReceiptText,
  Eye,
} from "lucide-react";

import type { Student, StudentParent } from "@/types";
import { getInitials, formatDate, copyToClipboard } from "@/utils/helpers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getParentsForStudent, resetStudentPassword } from "@/services";
import { toast } from "sonner";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentProfileSheetProps {
  /** The student to display. `null` means the sheet is closed. */
  student: Student | null;
  /** Controls sheet open/close. */
  isOpen: boolean;
  /** Called when the sheet should close. */
  onClose: () => void;
  /** Optional — when provided shows an Edit button in the footer. */
  onEdit?: () => void;
  /** Optional — when provided shows an Assign Fee button in the footer. */
  onAssignFee?: () => void;
  /** Optional — when provided shows Archive / Restore button in the footer. */
  onArchive?: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single labeled info row used in the detail grid. */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground wrap-break-word">{value}</p>
      </div>
    </div>
  );
}

/** A section divider with a label. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-y border-border">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `StudentProfileSheet` — fixed right-side slide-in profile panel.
 *
 * Fetches the student's linked parents internally when the sheet opens,
 * so the parent component only needs to pass the `Student` object.
 *
 * Layout (top → bottom):
 *  - Header (name, admission no, status, close button)
 *  - Avatar
 *  - Info grid (email, phone, batch, joined)
 *  - Aadhaar (if present)
 *  - Emergency contact (if present)
 *  - Linked parents count
 *  - Footer actions (Archive/Restore, Edit)
 */
export function StudentProfileSheet({
  student,
  isOpen,
  onClose,
  onEdit,
  onAssignFee,
  onArchive,
}: StudentProfileSheetProps) {
  const [parents, setParents] = useState<StudentParent[]>([]);
  const [parentsLoading, setParentsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isGeneratingFromView, setIsGeneratingFromView] = useState(false);

  // Fetch linked parents whenever the sheet opens for a new student.
  const fetchParents = useCallback(async (studentId: string) => {
    setParentsLoading(true);
    const result = await getParentsForStudent(studentId);
    if (result.success && result.data) {
      setParents(result.data);
    } else {
      setParents([]);
    }
    setParentsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen && student?.id) {
      fetchParents(student.id);
      setNewPassword(null);
      setIsViewing(false);
    } else {
      setParents([]);
      setNewPassword(null);
      setIsViewing(false);
    }
  }, [isOpen, student?.id, fetchParents]);

  async function handleResetPassword() {
    if (!student?.user_id) return;
    const confirmed = window.confirm(
      "Confirm password reset — this will immediately invalidate the existing password.",
    );
    if (!confirmed) return;

    try {
      setIsResetting(true);
      console.log("[StudentProfileSheet] Resetting password for user:", student.user_id);
      const result = await resetStudentPassword(student.user_id);
      setIsResetting(false);

      if (result.success && result.data) {
        console.log("[StudentProfileSheet] Reset success, new password:", result.data.temporary_password);
        setNewPassword(result.data.temporary_password);
        setIsViewing(true);
        toast.success("Password reset successfully");
      } else {
        console.error("[StudentProfileSheet] Reset failed:", result.error);
        toast.error(result.error ?? "Failed to reset password");
      }
    } catch (err) {
      console.error("[StudentProfileSheet] Reset exception:", err);
      setIsResetting(false);
      toast.error((err as Error).message ?? "Failed to reset password");
    }
  }

  /**
   * View password handler. If we already have a freshly generated temporary
   * password in state show it. Otherwise offer to generate a new temporary
   * password (safer than exposing any real stored secret).
   */
  async function handleViewPassword() {
    if (!student?.user_id) return;

    // If we have a recently generated password in memory, show it.
    if (newPassword) {
      setIsViewing(true);
      return;
    }

    const confirmed = window.confirm(
      "No temporary password is currently available to view. Generate a new temporary password now?",
    );
    if (!confirmed) return;

    // Generate a new temp password (uses same RPC as reset) but mark it as
    // originating from a view action so the UI can reflect that intent.
    try {
      setIsGeneratingFromView(true);
      console.log("[StudentProfileSheet] Generating password for user:", student.user_id);
      const result = await resetStudentPassword(student.user_id);
      setIsGeneratingFromView(false);
      if (result.success && result.data) {
        console.log("[StudentProfileSheet] Generation success, new password:", result.data.temporary_password);
        setNewPassword(result.data.temporary_password);
        setIsViewing(true);
        toast.success("Temporary password generated");
      } else {
        console.error("[StudentProfileSheet] Generation failed:", result.error);
        toast.error(result.error ?? "Failed to generate temporary password");
      }
    } catch (err) {
      console.error("[StudentProfileSheet] Generation exception:", err);
      setIsGeneratingFromView(false);
      toast.error((err as Error).message ?? "Failed to generate temporary password");
    }
  }

  async function handleCopyPassword() {
    if (!newPassword) return;
    if (await copyToClipboard(newPassword)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Password copied to clipboard");
    }
  }

  if (!student) {
    return null;
  }

  const ec = student.emergency_contact ?? null;

  return (
    <>
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-card border-l border-border shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">
              {student.user?.name ?? "Not Added"}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{student.admission_no}</p>
            <div className="mt-1.5">
              <StatusBadge status={student.status} size="sm" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Avatar */}
          <div className="flex justify-center py-7 border-b border-border">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground select-none"
              aria-hidden="true"
            >
              {getInitials(student.user?.name ?? "?")}
            </div>
          </div>

          {/* Info grid */}
          <SectionLabel>Contact & Academic</SectionLabel>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <InfoRow icon={<Mail />} label="Email" value={student.user?.email ?? "Not Added"} />
            <InfoRow icon={<Phone />} label="Phone" value={student.user?.phone ?? "Not Added"} />
            <InfoRow
              icon={<BookOpen />}
              label="Batch"
              value={student.batch?.name ?? (student.batch_id ? "Assigned" : "Unassigned")}
            />
            <InfoRow icon={<Calendar />} label="Joined" value={formatDate(student.created_at)} />
          </div>

          {/* Account Credentials Section */}
          <SectionLabel>Account Credentials</SectionLabel>
          <div className="px-5 py-4 space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase">Sign-in Email</span>
                </div>
              </div>
              <p className="text-sm font-mono text-foreground break-all bg-background border border-border rounded px-2 py-1">
                {student.generated_email || student.user?.email || "Not Added"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    console.log("[StudentProfileSheet] View Password clicked");
                    handleViewPassword();
                  }}
                  disabled={isViewing || isGeneratingFromView}
                  title="View Temporary Password (generate if none)"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                >
                  {isGeneratingFromView ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  View Password
                </button>

                <button
                  onClick={(e) => {
                    console.log("[StudentProfileSheet] Reset Password clicked");
                    handleResetPassword();
                  }}
                  disabled={isResetting}
                  title="Reset student's password (requires confirmation)"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset Password
                </button>
              </div>

              {newPassword && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary uppercase">Temporary Password</span>
                    </div>
                    <button
                      onClick={handleCopyPassword}
                      className="p-1 hover:bg-primary/10 rounded transition-colors"
                      title="Copy password"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm font-mono font-bold text-foreground bg-background border border-primary/20 rounded px-2 py-1.5 flex items-center justify-between">
                    {newPassword}
                  </p>
                  <p className="mt-2 text-[10px] text-primary/70 leading-tight">
                    Share this password with the student. It will not be shown again once you close this panel.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Aadhaar removed from profile display */}

          {/* Emergency contact — only when present */}
          {ec && (ec.name || ec.phone || ec.relation) && (
            <>
              <SectionLabel>Emergency Contact</SectionLabel>
              <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
                {ec.name && <InfoRow icon={<AlertTriangle />} label="Name" value={ec.name} />}
                {ec.phone && <InfoRow icon={<Phone />} label="Phone" value={ec.phone} />}
                {ec.relation && <InfoRow icon={<Users />} label="Relation" value={ec.relation} />}
              </div>
            </>
          )}

          {/* Linked Parents */}
          <SectionLabel>Linked Parents</SectionLabel>
          <div className="px-5 py-4">
            {parentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading parents…
              </div>
            ) : parents.length === 0 ? (
              <p className="text-sm text-muted-foreground">None linked</p>
            ) : (
              <div className="space-y-2">
                {parents.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {link.parent?.user?.name ?? "Not Added"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.parent?.user?.email ?? "Not Added"}
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 text-xs capitalize text-muted-foreground">
                      {link.relation_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4 shrink-0">
          {/* Assign Fee */}
          {onAssignFee && (
            <button
              type="button"
              onClick={onAssignFee}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
              Assign Fee
            </button>
          )}

          {/* Archive / Restore */}
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                student.status !== "inactive"
                  ? "border-destructive/30 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40"
                  : "border-border text-foreground hover:bg-muted focus-visible:ring-primary/50"
              }`}
            >
              {student.status !== "inactive" ? (
                <>
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restore
                </>
              )}
            </button>
          )}

          {/* Edit */}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
