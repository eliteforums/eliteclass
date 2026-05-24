// ---------------------------------------------------------------------------
// EduOS — StaffProfileSheet
//
// A fixed right-side slide-in panel that displays a staff member's full profile.
// Opens with a backdrop overlay and closes via the X button or backdrop click.
//
// Features:
//  - Avatar with large initials
//  - Info grid: email, phone, designation, department, qualification, joined date
//  - Account Credentials section: View/Reset Password
//  - Assignments section: Courses and Batches
//  - Footer: Edit and Remove actions
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  Briefcase,
  GraduationCap,
  Shield,
  Loader2,
  Key,
  Copy,
  Check,
  RotateCcw,
  Eye,
  Trash2,
  Pencil,
  ClipboardList,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import type {
  Staff,
  StaffAssignment,
  StaffBatchAssignment,
  StaffBatchOption,
  StaffCourseAssignment,
  StaffCourseOption,
} from "@/types";
import { getInitials, formatDate, copyToClipboard } from "@/utils/helpers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  resetStaffPassword,
  getStaffAssignments,
  getStaffBatchAssignments,
  getAssignableBatchOptions,
  assignBatchToStaff,
  removeStaffBatchAssignment,
  getStaffCourses,
  getAssignableCourseOptions,
  assignCourseToStaff,
  removeStaffCourse,
} from "@/services/staff.service";
import { toast } from "sonner";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StaffProfileSheetProps {
  /** The staff member to display. `null` means the sheet is closed. */
  staff: Staff | null;
  /** Controls sheet open/close. */
  isOpen: boolean;
  /** Called when the sheet should close. */
  onClose: () => void;
  /** Optional — when provided shows an Edit button in the footer. */
  onEdit?: () => void;
  /** Optional — when provided shows a Delete button in the footer. */
  onDelete?: () => void;
  /** Called when assigned courses change so parent state can stay in sync. */
  onAssignedCoursesChange?: (courses: StaffCourseAssignment[]) => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-y border-border">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StaffProfileSheet({
  staff,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onAssignedCoursesChange,
}: StaffProfileSheetProps) {
  const authUser = useAuthStore((s) => s.user);

  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [batchAssignments, setBatchAssignments] = useState<StaffBatchAssignment[]>([]);
  const [availableBatchOptions, setAvailableBatchOptions] = useState<StaffBatchOption[]>([]);
  const [isLoadingBatchAssignments, setIsLoadingBatchAssignments] = useState(false);
  const [isLoadingBatchOptions, setIsLoadingBatchOptions] = useState(false);
  const [batchAssignmentError, setBatchAssignmentError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [isAssigningBatch, setIsAssigningBatch] = useState(false);
  const [staffCourseAssignments, setStaffCourseAssignments] = useState<StaffCourseAssignment[]>([]);
  const [availableCourseOptions, setAvailableCourseOptions] = useState<StaffCourseOption[]>([]);
  const [isLoadingCourseAssignments, setIsLoadingCourseAssignments] = useState(false);
  const [isLoadingCourseOptions, setIsLoadingCourseOptions] = useState(false);
  const [courseAssignmentError, setCourseAssignmentError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [isAssigningCourse, setIsAssigningCourse] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [removingCourseAssignmentId, setRemovingCourseAssignmentId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isGeneratingFromView, setIsGeneratingFromView] = useState(false);

  const canManageBatchAssignments = useMemo(() => {
    if (!authUser) return false;
    if (authUser.role === "admin" || authUser.role === "super_admin") return true;
    return false;
  }, [authUser]);

  const canManageCourseAssignments = canManageBatchAssignments;

  const assignedBatchIds = useMemo(
    () => new Set(batchAssignments.map((a) => a.batch_id)),
    [batchAssignments],
  );

  const availableBatchCandidates = useMemo(
    () => availableBatchOptions.filter((option) => !assignedBatchIds.has(option.id)),
    [availableBatchOptions, assignedBatchIds],
  );

  const assignedCourseIds = useMemo(
    () => new Set(staffCourseAssignments.map((a) => a.course_id)),
    [staffCourseAssignments],
  );

  const availableCourseCandidates = useMemo(
    () => availableCourseOptions.filter((option) => !assignedCourseIds.has(option.id)),
    [availableCourseOptions, assignedCourseIds],
  );

  const courseOptionLabel = useCallback((course: StaffCourseOption) => {
    if (course.status === "draft") return `${course.label} (draft)`;
    if (course.status === "archived") return `${course.label} (archived)`;
    return course.label;
  }, []);

  const filteredCourseCandidates = useMemo(() => {
    const query = courseSearchQuery.trim().toLowerCase();
    if (!query) return availableCourseCandidates;
    return availableCourseCandidates.filter(
      (course) =>
        course.name.toLowerCase().includes(query) ||
        (course.code?.toLowerCase().includes(query) ?? false) ||
        course.label.toLowerCase().includes(query),
    );
  }, [availableCourseCandidates, courseSearchQuery]);

  const courseAssignments = useMemo(
    () => assignments.filter((a) => Boolean(a.course_name || a.subject_name)),
    [assignments],
  );

  const fetchAssignments = useCallback(async (staffId: string) => {
    setIsLoadingAssignments(true);
    const result = await getStaffAssignments(staffId);
    if (result.success && result.data) {
      setAssignments(result.data);
    } else {
      setAssignments([]);
    }
    setIsLoadingAssignments(false);
  }, []);

  const fetchBatchAssignments = useCallback(async (staffId: string) => {
    setIsLoadingBatchAssignments(true);
    setBatchAssignmentError(null);
    const result = await getStaffBatchAssignments(staffId);

    if (result.success && result.data) {
      setBatchAssignments(result.data);
    } else {
      setBatchAssignments([]);
      setBatchAssignmentError(result.error ?? "Failed to load batch assignments.");
    }

    setIsLoadingBatchAssignments(false);
  }, []);

  const syncAssignedCoursesToParent = useCallback(
    (courses: StaffCourseAssignment[]) => {
      onAssignedCoursesChange?.(courses);
    },
    [onAssignedCoursesChange],
  );

  const fetchStaffCourseAssignments = useCallback(
    async (staffId: string) => {
      setIsLoadingCourseAssignments(true);
      setCourseAssignmentError(null);
      const result = await getStaffCourses(staffId);

      if (result.success && result.data) {
        setStaffCourseAssignments(result.data);
        syncAssignedCoursesToParent(result.data);
      } else {
        setStaffCourseAssignments([]);
        syncAssignedCoursesToParent([]);
        setCourseAssignmentError(result.error ?? "Failed to load assigned courses.");
      }

      setIsLoadingCourseAssignments(false);
    },
    [syncAssignedCoursesToParent],
  );

  const fetchAssignableCourseOptions = useCallback(async (instituteId: string) => {
    setIsLoadingCourseOptions(true);
    const result = await getAssignableCourseOptions(instituteId);

    if (result.success && result.data) {
      setAvailableCourseOptions(result.data);
    } else {
      setAvailableCourseOptions([]);
      setCourseAssignmentError(result.error ?? "Failed to load available courses.");
    }

    setIsLoadingCourseOptions(false);
  }, []);

  const fetchAssignableBatchOptions = useCallback(async (instituteId: string) => {
    setIsLoadingBatchOptions(true);
    const result = await getAssignableBatchOptions(instituteId);

    if (result.success && result.data) {
      setAvailableBatchOptions(result.data);
    } else {
      setAvailableBatchOptions([]);
      setBatchAssignmentError(result.error ?? "Failed to load available batches.");
    }

    setIsLoadingBatchOptions(false);
  }, []);

  useEffect(() => {
    if (isOpen && staff?.id) {
      fetchAssignments(staff.id);
      fetchBatchAssignments(staff.id);
      fetchStaffCourseAssignments(staff.id);
      if (canManageBatchAssignments && staff.institute_id) {
        fetchAssignableBatchOptions(staff.institute_id);
      }
      if (canManageCourseAssignments && staff.institute_id) {
        fetchAssignableCourseOptions(staff.institute_id);
      }
      setNewPassword(null);
      setIsViewing(false);
      setSelectedBatchId("");
      setSelectedCourseId("");
      setCourseSearchQuery("");
    } else {
      setAssignments([]);
      setBatchAssignments([]);
      setStaffCourseAssignments([]);
      setAvailableBatchOptions([]);
      setAvailableCourseOptions([]);
      setNewPassword(null);
      setIsViewing(false);
      setSelectedBatchId("");
      setSelectedCourseId("");
      setCourseSearchQuery("");
      setBatchAssignmentError(null);
      setCourseAssignmentError(null);
    }
  }, [
    isOpen,
    staff?.id,
    staff?.institute_id,
    fetchAssignments,
    fetchBatchAssignments,
    fetchStaffCourseAssignments,
    fetchAssignableBatchOptions,
    fetchAssignableCourseOptions,
    canManageBatchAssignments,
    canManageCourseAssignments,
  ]);

  useEffect(() => {
    if (!selectedBatchId) return;
    if (!availableBatchCandidates.some((batch) => batch.id === selectedBatchId)) {
      setSelectedBatchId("");
    }
  }, [selectedBatchId, availableBatchCandidates]);

  useEffect(() => {
    if (!selectedCourseId) return;
    if (!availableCourseCandidates.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId("");
    }
  }, [selectedCourseId, availableCourseCandidates]);

  async function handleAssignSelectedCourse() {
    if (!staff?.id || !staff.institute_id || !selectedCourseId) return;

    setIsAssigningCourse(true);
    setCourseAssignmentError(null);

    const assignedBy = authUser?.id ?? null;

    const result = await assignCourseToStaff({
      institute_id: staff.institute_id,
      staff_id: staff.id,
      course_id: selectedCourseId,
      assigned_by: assignedBy,
    });

    setIsAssigningCourse(false);

    if (result.success && result.data) {
      setStaffCourseAssignments((prev) => {
        if (prev.some((a) => a.course_id === result.data!.course_id)) return prev;
        const next = [result.data!, ...prev];
        syncAssignedCoursesToParent(next);
        return next;
      });
      setSelectedCourseId("");
      setCourseSearchQuery("");
      toast.success("Course assigned successfully.");
      void fetchStaffCourseAssignments(staff.id);
      return;
    }

    const message = result.error ?? "Failed to assign course.";
    setCourseAssignmentError(message);
    toast.error(message);
  }

  async function handleRemoveCourseAssignment(assignmentId: string) {
    if (!staff?.id) return;

    setRemovingCourseAssignmentId(assignmentId);
    const previous = staffCourseAssignments;
    const next = previous.filter((a) => a.id !== assignmentId);
    setStaffCourseAssignments(next);
    syncAssignedCoursesToParent(next);

    const result = await removeStaffCourse({
      assignment_id: assignmentId,
      staff_id: staff.id,
    });

    setRemovingCourseAssignmentId(null);

    if (!result.success) {
      setStaffCourseAssignments(previous);
      syncAssignedCoursesToParent(previous);
      const message = result.error ?? "Failed to remove course assignment.";
      setCourseAssignmentError(message);
      toast.error(message);
      return;
    }

    toast.success("Course assignment removed.");
  }

  async function handleAssignSelectedBatch() {
    if (!staff?.id || !staff.institute_id || !selectedBatchId) return;

    setIsAssigningBatch(true);
    setBatchAssignmentError(null);

    const assignedBy = authUser?.id ?? null;

    const result = await assignBatchToStaff({
      institute_id: staff.institute_id,
      staff_id: staff.id,
      batch_id: selectedBatchId,
      assigned_by: assignedBy,
    });

    setIsAssigningBatch(false);

    if (result.success && result.data) {
      setBatchAssignments((prev) => {
        if (prev.some((a) => a.batch_id === result.data!.batch_id)) return prev;
        return [result.data!, ...prev];
      });
      setSelectedBatchId("");
      toast.success("Batch assigned successfully.");
      void fetchBatchAssignments(staff.id);
      return;
    }

    const message = result.error ?? "Failed to assign batch.";
    setBatchAssignmentError(message);
    toast.error(message);
  }

  async function handleRemoveBatchAssignment(assignmentId: string) {
    if (!staff?.id) return;

    setRemovingAssignmentId(assignmentId);
    const previous = batchAssignments;
    setBatchAssignments((prev) => prev.filter((a) => a.id !== assignmentId));

    const result = await removeStaffBatchAssignment({
      assignment_id: assignmentId,
      staff_id: staff.id,
    });

    setRemovingAssignmentId(null);

    if (!result.success) {
      setBatchAssignments(previous);
      const message = result.error ?? "Failed to remove batch assignment.";
      setBatchAssignmentError(message);
      toast.error(message);
      return;
    }

    toast.success("Batch assignment removed.");
  }

  async function handleResetPassword() {
    if (!staff?.user_id) return;
    const confirmed = window.confirm(
      "Confirm password reset — this will immediately invalidate the existing password.",
    );
    if (!confirmed) return;

    try {
      setIsResetting(true);
      const result = await resetStaffPassword(staff.user_id);
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
    if (!staff?.user_id) return;

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
      const result = await resetStaffPassword(staff.user_id);
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

  if (!staff) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-card border-l border-border shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">
              {staff.user?.name ?? "—"}
            </h2>
            <p className="text-xs text-muted-foreground">{staff.designation}</p>
            <div className="mt-1.5">
              <StatusBadge status={staff.is_active !== false ? "active" : "inactive"} size="sm" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Avatar */}
          <div className="flex justify-center py-7 border-b border-border">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground select-none">
              {getInitials(staff.user?.name ?? "?")}
            </div>
          </div>

          {/* Info grid */}
          <SectionLabel>Professional Details</SectionLabel>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <InfoRow icon={<Briefcase />} label="Department" value={staff.department ?? "—"} />
            <InfoRow icon={<GraduationCap />} label="Qualification" value={staff.qualification ?? "—"} />
            <InfoRow icon={<Mail />} label="Email" value={staff.user?.email ?? "—"} />
            <InfoRow icon={<Phone />} label="Phone" value={staff.user?.phone ?? "—"} />
            <InfoRow icon={<Calendar />} label="Joined" value={staff.joining_date ? formatDate(staff.joining_date) : "—"} />
          </div>

          {/* Account Credentials Section */}
          <SectionLabel>Account Credentials</SectionLabel>
          <div className="px-5 py-4 space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 tracking-tight">Sign-in Email</p>
              <p className="text-sm font-mono text-foreground break-all bg-background border border-border rounded px-2 py-1">
                {staff.user?.email ?? "—"}
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
                    Share this password with the staff member. It will not be shown again once you close this panel.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Assignments */}
          <SectionLabel>Course Assignments</SectionLabel>
          <div className="px-5 py-4">
            {isLoadingAssignments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assignments…
              </div>
            ) : courseAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignments yet</p>
            ) : (
              <div className="space-y-2">
                {courseAssignments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      <p className="text-sm font-semibold text-foreground">{a.subject_name || "General"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground pl-5.5">
                      {a.course_name} • {a.batch?.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SectionLabel>Assigned Courses</SectionLabel>
          <div className="px-5 py-4 space-y-3">
            {canManageCourseAssignments && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <SearchInput
                  value={courseSearchQuery}
                  onChange={setCourseSearchQuery}
                  placeholder="Search courses…"
                  className="w-full"
                />

                {isLoadingCourseOptions ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading courses…
                  </div>
                ) : (
                  <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                    <SelectTrigger className="w-full" disabled={filteredCourseCandidates.length === 0}>
                      <SelectValue
                        placeholder={
                          filteredCourseCandidates.length === 0
                            ? "No available courses"
                            : "Select available course"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCourseCandidates.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {courseOptionLabel(course)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {!isLoadingCourseOptions && availableCourseCandidates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All linked LMS courses are already assigned or unavailable.
                  </p>
                )}

                {!isLoadingCourseOptions &&
                  availableCourseCandidates.length > 0 &&
                  filteredCourseCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground">No courses match your search.</p>
                  )}

                <button
                  type="button"
                  onClick={handleAssignSelectedCourse}
                  disabled={isAssigningCourse || !selectedCourseId || isLoadingCourseOptions}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isAssigningCourse ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Assign course
                </button>
              </div>
            )}

            {courseAssignmentError && (
              <p className="text-xs text-destructive">{courseAssignmentError}</p>
            )}

            {isLoadingCourseAssignments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assigned courses…
              </div>
            ) : staffCourseAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assigned courses yet</p>
            ) : (
              <div className="space-y-2">
                {staffCourseAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          <p className="text-sm font-semibold text-foreground truncate">
                            {assignment.course?.name ?? "Unknown course"}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5.5">
                          {assignment.course?.code ?? "No code"}
                        </p>
                      </div>
                      {canManageCourseAssignments && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCourseAssignment(assignment.id)}
                          disabled={removingCourseAssignmentId === assignment.id}
                          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          aria-label="Remove course assignment"
                        >
                          {removingCourseAssignmentId === assignment.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SectionLabel>Batch Assignments</SectionLabel>
          <div className="px-5 py-4 space-y-3">
            {canManageBatchAssignments && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                {isLoadingBatchOptions ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading batches…
                  </div>
                ) : (
                  <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                    <SelectTrigger className="w-full" disabled={availableBatchCandidates.length === 0}>
                      <SelectValue
                        placeholder={
                          availableBatchCandidates.length === 0
                            ? "No available batches"
                            : "Select available batch"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBatchCandidates.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name} ({batch.academic_year})
                          {batch.course_name ? ` • ${batch.course_name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {!isLoadingBatchOptions && availableBatchCandidates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All active batches are already assigned or unavailable.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleAssignSelectedBatch}
                  disabled={isAssigningBatch || !selectedBatchId || isLoadingBatchOptions}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isAssigningBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Assign batch
                </button>
              </div>
            )}

            {batchAssignmentError && (
              <p className="text-xs text-destructive">{batchAssignmentError}</p>
            )}

            {isLoadingBatchAssignments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading batch assignments…
              </div>
            ) : batchAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batch assignments yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {batchAssignments.map((assignment) => (
                  <Badge
                    key={assignment.id}
                    variant="outline"
                    className="flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                  >
                    <span>
                      {assignment.batch?.name ?? "Unknown batch"}
                      {assignment.batch?.academic_year
                        ? ` (${assignment.batch.academic_year})`
                        : ""}
                    </span>
                    {canManageBatchAssignments && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBatchAssignment(assignment.id)}
                        disabled={removingAssignmentId === assignment.id}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label="Remove batch assignment"
                      >
                        {removingAssignmentId === assignment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
