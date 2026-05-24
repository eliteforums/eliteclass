// ---------------------------------------------------------------------------
// EduOS — Admin: Parent Management Page
//
// Displays all parents registered under the admin's institute.
// Features:
//  - Fetches parents on mount via getParentsByInstitute
//  - Client-side search filter by parent name
//  - DataTable with Name, Phone, Occupation, Joined date, and View action
//  - Inline right-side profile panel (mirrors StudentProfileSheet pattern)
//  - Linked students section inside the panel (fetched on panel open)
//  - Error banner on fetch failure
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Users,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  GraduationCap,
  Loader2,
  AlertCircle,
  Key,
  Eye,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuthStore } from "@/store/authStore";
import { getParentsByInstitute, resetParentPassword } from "@/services/parent.service";
import { getStudentsByParentId } from "@/services/student.service";
import type { Parent, RelationType, StudentLinkedForParent } from "@/types";
import { getInitials, formatDate, copyToClipboard } from "@/utils/helpers";
import { toast } from "sonner";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/parents/")({
  head: () => ({ meta: [{ title: "Parents — EduOS" }] }),
  component: ParentsPage,
});

/** Human-readable relationship label (father → Father). */
function formatRelationType(rel: RelationType): string {
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

interface ParentProfilePanelProps {
  parent: Parent | null;
  isOpen: boolean;
  onClose: () => void;
}

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

/**
 * `ParentProfilePanel` — fixed right-side slide-in panel that shows a parent's
 * full profile and their linked students.
 *
 * Fetches linked students internally whenever the panel opens for a new parent
 * so the caller only needs to pass the `Parent` object.
 */
function ParentProfilePanel({ parent, isOpen, onClose }: ParentProfilePanelProps) {
  const [linkedStudents, setLinkedStudents] = useState<StudentLinkedForParent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isGeneratingFromView, setIsGeneratingFromView] = useState(false);

  // Fetch linked students whenever the panel opens for a new parent.
  const fetchLinkedStudents = useCallback(async (parentId: string) => {
    setStudentsLoading(true);
    const result = await getStudentsByParentId(parentId);
    if (result.success && result.data) {
      setLinkedStudents(result.data);
    } else {
      setLinkedStudents([]);
    }
    setStudentsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen && parent?.id) {
      fetchLinkedStudents(parent.id);
      setNewPassword(null);
      setIsViewing(false);
    } else {
      setLinkedStudents([]);
      setNewPassword(null);
      setIsViewing(false);
    }
  }, [isOpen, parent?.id, fetchLinkedStudents]);

  async function handleResetPassword() {
    if (!parent?.user_id) return;
    const confirmed = window.confirm(
      "Confirm password reset — this will immediately invalidate the existing password.",
    );
    if (!confirmed) return;

    try {
      setIsResetting(true);
      const result = await resetParentPassword(parent.user_id);
      setIsResetting(false);

      if (result.success && result.data) {
        setNewPassword(result.data.temporary_password);
        setIsViewing(true);
        toast.success("Password reset successfully");
      } else {
        toast.error(result.error ?? "Failed to reset password");
      }
    } catch (err) {
      setIsResetting(false);
      toast.error((err as Error).message ?? "Failed to reset password");
    }
  }

  async function handleViewPassword() {
    if (!parent?.user_id) return;

    if (newPassword) {
      setIsViewing(true);
      return;
    }

    const confirmed = window.confirm(
      "No temporary password is currently available to view. Generate a new temporary password now?",
    );
    if (!confirmed) return;

    try {
      setIsGeneratingFromView(true);
      const result = await resetParentPassword(parent.user_id);
      setIsGeneratingFromView(false);
      if (result.success && result.data) {
        setNewPassword(result.data.temporary_password);
        setIsViewing(true);
        toast.success("Temporary password generated");
      } else {
        toast.error(result.error ?? "Failed to generate temporary password");
      }
    } catch (err) {
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

  // Close on Escape key.
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!parent) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Slide-in panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Profile: ${parent.user?.name ?? "Parent"}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-card border-l border-border shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">
              {parent.user?.name ?? "—"}
            </h2>
            <p className="text-xs text-muted-foreground truncate">{parent.user?.email ?? "—"}</p>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Avatar */}
          <div className="flex justify-center py-7 border-b border-border">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground select-none"
              aria-hidden="true"
            >
              {getInitials(parent.user?.name ?? "?")}
            </div>
          </div>

          {/* Contact details */}
          <SectionLabel>Contact Details</SectionLabel>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <InfoRow icon={<Mail />} label="Email" value={parent.user?.email ?? "—"} />
            <InfoRow icon={<Phone />} label="Phone" value={parent.user?.phone ?? "—"} />
            <InfoRow icon={<Briefcase />} label="Occupation" value={parent.occupation ?? "—"} />
            <InfoRow icon={<Calendar />} label="Joined" value={formatDate(parent.created_at)} />
          </div>

          {/* Account Credentials Section */}
          <SectionLabel>Account Credentials</SectionLabel>
          <div className="px-5 py-4 space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 tracking-tight">Sign-in Email</p>
              <p className="text-sm font-mono text-foreground break-all bg-background border border-border rounded px-2 py-1">
                {parent.user?.email ?? "—"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleViewPassword}
                  disabled={isViewing || isGeneratingFromView}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {isGeneratingFromView ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  View Password
                </button>

                <button
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset
                </button>
              </div>

              {newPassword && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary uppercase">Temporary Password</span>
                    </div>
                    <button onClick={handleCopyPassword} className="p-1 hover:bg-primary/10 rounded transition-colors">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  </div>
                  <p className="text-sm font-mono font-bold text-foreground bg-background border border-primary/20 rounded px-2 py-1.5">
                    {newPassword}
                  </p>
                  <p className="mt-2 text-[10px] text-primary/70 leading-tight">
                    Share this password with the parent. It will not be shown again once you close this panel.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Linked students */}
          <SectionLabel>Linked Students</SectionLabel>
          <div className="px-5 py-4">
            {studentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading students…
              </div>
            ) : linkedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students linked</p>
            ) : (
              <div className="space-y-2">
                {linkedStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    {/* Mini avatar */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
                      aria-hidden="true"
                    >
                      {getInitials(student.user?.name ?? "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {student.user?.name ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {student.admission_no}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Relationship:{" "}
                        <span className="font-medium text-foreground">
                          {formatRelationType(student.relation_type)}
                        </span>
                      </p>
                    </div>
                    <StatusBadge status={student.status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function ParentsPage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  // ── Data state ────────────────────────────────────────────────────────────
  const [parents, setParents] = useState<Parent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);

  // ── Fetch parents on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!instituteId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const result = await getParentsByInstitute(instituteId!);

      if (cancelled) return;

      if (result.success && result.data) {
        setParents(result.data);
      } else {
        setError(result.error ?? "Failed to load parents. Please try again.");
      }

      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [instituteId]);

  // ── Client-side search filter ─────────────────────────────────────────────
  const filteredParents = parents.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.user?.name ?? "").toLowerCase().includes(q) ||
      (p.user?.email ?? "").toLowerCase().includes(q)
    );
  });

  // ── DataTable column definitions ──────────────────────────────────────────
  const columns: DataTableColumn<Parent>[] = [
    // 1. Name + email
    {
      key: "name",
      header: "Name",
      render: (parent) => (
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
            aria-hidden="true"
          >
            {getInitials(parent.user?.name ?? "?")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {parent.user?.name ?? "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{parent.user?.email ?? "—"}</p>
          </div>
        </div>
      ),
    },

    // 2. Phone
    {
      key: "phone",
      header: "Phone",
      render: (parent) => (
        <span className="text-sm text-muted-foreground">{parent.user?.phone ?? "—"}</span>
      ),
    },

    // 3. Occupation
    {
      key: "occupation",
      header: "Occupation",
      render: (parent) => (
        <span className="text-sm text-muted-foreground">{parent.occupation ?? "—"}</span>
      ),
    },

    // 4. Joined date
    {
      key: "joined",
      header: "Joined",
      render: (parent) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(parent.created_at)}
        </span>
      ),
    },

    // 5. Actions
    {
      key: "actions",
      header: "",
      headerClassName: "w-px",
      cellClassName: "text-right",
      render: (parent) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedParent(parent);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={`View profile of ${parent.user?.name ?? "parent"}`}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          View Profile
        </button>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <PageHeader
        title="Parents"
        subtitle="Guardian accounts and student links"
        badge={isLoading ? "— parents" : `${parents.length} parents`}
      />

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div className="mt-5">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search parents by name or email…"
          className="w-full sm:max-w-xs"
        />
      </div>

      {/* ── Parents table ─────────────────────────────────────────────── */}
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filteredParents}
          isLoading={isLoading}
          loadingRows={6}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => setSelectedParent(p)}
          emptyState={
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <GraduationCap className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {searchQuery ? "No parents match your search" : "No parents yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? "Try adjusting your search term."
                    : "Parent accounts are created when students are admitted with a guardian."}
                </p>
              </div>
            </div>
          }
        />
      </div>

      {/* ── Parent Profile Panel ──────────────────────────────────────── */}
      <ParentProfilePanel
        parent={selectedParent}
        isOpen={selectedParent !== null}
        onClose={() => setSelectedParent(null)}
      />
    </ProtectedRoute>
  );
}
