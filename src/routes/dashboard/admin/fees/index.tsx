// ---------------------------------------------------------------------------
// EduOS — Admin: Fee Management Page
//
// Full fee management interface for institute admins.
// Features:
//  - Revenue summary row with 4 real-time stat cards
//  - "Pending Dues" tab — filterable table with Record Payment action
//  - "Fee Structures" tab — list of fee templates with Add Fee Structure modal
//  - All data from Supabase via fee.service.ts; state managed with useState + useEffect
//
// NO DashboardLayout wrapper — layout is inherited from the parent route.
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  IndianRupee,
  CreditCard,
  Clock,
  AlertTriangle,
  Plus,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Layers,
  BadgeCheck,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";

import {
  getFeeStructures,
  getPendingDues,
  getInstituteStudentFees,
  getRevenueStats,
  createFeeStructure,
  deleteFeeStructure,
} from "@/services/fee.service";
import { FeeStatusBadge } from "@/modules/fees/components/FeeStatusBadge";
import { RecordPaymentModal } from "@/modules/fees/components/RecordPaymentModal";
import {
  createFeeStructureSchema,
  type CreateFeeStructureSchema,
} from "@/modules/fees/validations";

import type {
  StudentFee,
  FeeStructure,
  FeeStatus,
  RevenueStats,
  RecordPaymentResult,
} from "@/types";
import { formatDate } from "@/utils/helpers";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/fees/")({
  head: () => ({ meta: [{ title: "Fees — EduOS" }] }),
  component: FeesPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number as Indian rupees: ₹1,00,000 */
function inr(amount?: number | null) {
  const n = Number(amount ?? 0) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Derive the current academic year as "YYYY-YY" from the current date. */
function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

/** Map a frequency enum to a human-readable label. */
function frequencyLabel(freq: FeeStructure["frequency"]): string {
  const map: Record<FeeStructure["frequency"], string> = {
    one_time: "One-time",
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
  };
  return map[freq] ?? freq;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  /** Tailwind icon-wrapper bg + text color classes. */
  iconColor: string;
  isLoading?: boolean;
}

function StatCard({ label, value, icon, iconColor, isLoading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconColor}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        {isLoading ? (
          <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BadgeCheck className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">Everything looks good here.</p>
    </div>
  );
}

// ── Add Fee Structure Modal (inline) ─────────────────────────────────────────

interface AddFeeStructureModalProps {
  instituteId: string;
  academicYear: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (structure: FeeStructure) => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

function AddFeeStructureModal({
  instituteId,
  academicYear,
  isOpen,
  onClose,
  onSuccess,
}: AddFeeStructureModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeeStructureSchema>({
    resolver: zodResolver(createFeeStructureSchema),
    defaultValues: {
      name: "",
      amount: undefined as unknown as number,
      frequency: "one_time",
      academic_year: academicYear,
      description: "",
    },
  });

  async function onSubmit(values: CreateFeeStructureSchema) {
    setServerError(null);

    const result = await createFeeStructure({
      institute_id: instituteId,
      name: values.name,
      amount: values.amount,
      frequency: values.frequency,
      academic_year: values.academic_year,
      description: values.description || undefined,
    });

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to create fee structure. Please try again.");
      return;
    }

    reset();
    onSuccess(result.data);
    onClose();
  }

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setServerError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <>
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-structure-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card border border-border shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2 id="add-structure-title" className="text-sm font-semibold text-foreground">
              Add Fee Structure
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Name */}
            <div>
              <label htmlFor="fs-name" className={LABEL_CLASS}>
                Name <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                id="fs-name"
                type="text"
                placeholder="e.g. Tuition Fee, Transport Fee…"
                {...register("name")}
                className={INPUT_CLASS}
              />
              {errors.name && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="fs-amount" className={LABEL_CLASS}>
                Amount (₹) <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                id="fs-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter amount in rupees"
                {...register("amount", { valueAsNumber: true })}
                className={INPUT_CLASS}
              />
              {errors.amount && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* Frequency */}
            <div>
              <label htmlFor="fs-frequency" className={LABEL_CLASS}>
                Frequency <span className="text-destructive ml-0.5">*</span>
              </label>
              <select id="fs-frequency" {...register("frequency")} className={INPUT_CLASS}>
                <option value="one_time">One-time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
              {errors.frequency && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.frequency.message}
                </p>
              )}
            </div>

            {/* Academic Year */}
            <div>
              <label htmlFor="fs-year" className={LABEL_CLASS}>
                Academic Year <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                id="fs-year"
                type="text"
                placeholder="e.g. 2024-25"
                {...register("academic_year")}
                className={INPUT_CLASS}
              />
              {errors.academic_year && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.academic_year.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="fs-desc" className={LABEL_CLASS}>
                Description
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="fs-desc"
                rows={2}
                placeholder="Optional description or notes…"
                {...register("description")}
                className={`${INPUT_CLASS} resize-none`}
              />
              {errors.description && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Creating…" : "Create Fee Structure"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

type Tab = "pending" | "structures";
type StatusFilter = FeeStatus | "all";

function FeesPage() {
  const { user, institute } = useAuthStore();
  const instituteId = user?.institute_id ?? null;
  const academicYear = currentAcademicYear();

  // ── Data state ───────────────────────────────────────────────────────────
  const [pendingDues, setPendingDues] = useState<StudentFee[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);

  // ── Loading / error state ────────────────────────────────────────────────
  const [isLoadingDues, setIsLoadingDues] = useState(true);
  const [isLoadingStructures, setIsLoadingStructures] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [duesError, setDuesError] = useState<string | null>(null);
  const [structuresError, setStructuresError] = useState<string | null>(null);
  const [deletingStructureId, setDeletingStructureId] = useState<string | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /** The student fee row whose Record Payment modal is open. */
  const [selectedFee, setSelectedFee] = useState<StudentFee | null>(null);
  const [isAddStructureOpen, setIsAddStructureOpen] = useState(false);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  const fetchDues = useCallback(async () => {
    if (!instituteId) return;
    setIsLoadingDues(true);
    setDuesError(null);

    // When the status filter is 'all' we want to show every student_fee row
    // (including paid) so admins can inspect completed payments. Otherwise
    // keep the optimized pending-dues query for performance.
    let result;
    if (statusFilter === "all") {
      result = await getInstituteStudentFees(instituteId);
    } else {
      result = await getPendingDues(instituteId);
    }

    if (result.success && result.data) {
      setPendingDues(result.data);
    } else {
      setDuesError(result.error ?? "Failed to load pending dues.");
    }
    setIsLoadingDues(false);
  }, [instituteId, statusFilter]);

  const fetchStructures = useCallback(async () => {
    if (!instituteId) return;
    setIsLoadingStructures(true);
    setStructuresError(null);
    const result = await getFeeStructures(instituteId);
    if (result.success && result.data) {
      setFeeStructures(result.data);
    } else {
      setStructuresError(result.error ?? "Failed to load fee structures.");
    }
    setIsLoadingStructures(false);
  }, [instituteId]);

  const fetchStats = useCallback(async () => {
    if (!instituteId) return;
    setIsLoadingStats(true);
    const result = await getRevenueStats(instituteId, academicYear);
    if (result.success && result.data) {
      setRevenueStats(result.data);
    }
    setIsLoadingStats(false);
  }, [instituteId, academicYear]);

  // Fetch all three datasets on mount (and when instituteId becomes available).
  useEffect(() => {
    fetchDues();
    fetchStructures();
    fetchStats();
  }, [fetchDues, fetchStructures, fetchStats]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  /** Called after a payment is successfully recorded — refresh dues + stats. */
  const handlePaymentSuccess = useCallback(
    (_result: RecordPaymentResult) => {
      setSelectedFee(null);
      fetchDues();
      fetchStats();
    },
    [fetchDues, fetchStats],
  );

  /** Called after a new fee structure is created — add it to the list. */
  const handleStructureCreated = useCallback((structure: FeeStructure) => {
    setFeeStructures((prev) => [structure, ...prev]);
  }, []);

  const handleDeleteStructure = useCallback(
    async (structure: FeeStructure) => {
      if (!instituteId) return;

      const confirmed = window.confirm(
        `Delete ${structure.fee_name ?? structure.name}? This action cannot be undone.`,
      );
      if (!confirmed) return;

      setDeletingStructureId(structure.id);
      setStructuresError(null);

      const result = await deleteFeeStructure(instituteId, structure.id);

      if (!result.success) {
        setStructuresError(result.error ?? "Failed to delete fee structure.");
        setDeletingStructureId(null);
        return;
      }

      setFeeStructures((prev) => prev.filter((item) => item.id !== structure.id));
      setDeletingStructureId(null);
    },
    [instituteId],
  );

  // ── Filtered pending dues ─────────────────────────────────────────────────

  const filteredDues =
    statusFilter === "all" ? pendingDues : pendingDues.filter((sf) => sf.status === statusFilter);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Fees & Billing"
        subtitle="Fee management and payment tracking"
        badge={`${academicYear}`}
        actions={
          <button
            type="button"
            onClick={() => {
              fetchDues();
              fetchStructures();
              fetchStats();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {/* ── Revenue summary row ──────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Collected"
          value={revenueStats ? inr(revenueStats.total_collected) : "—"}
          icon={<IndianRupee className="h-5 w-5 text-green-600" />}
          iconColor="bg-green-50 dark:bg-green-950"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Total Pending"
          value={revenueStats ? inr(revenueStats.total_pending) : "—"}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          iconColor="bg-amber-50 dark:bg-amber-950"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Total Overdue"
          value={revenueStats ? inr(revenueStats.total_overdue) : "—"}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          iconColor="bg-red-50 dark:bg-red-950"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="This Month"
          value={revenueStats ? inr(revenueStats.collection_this_month) : "—"}
          icon={<CreditCard className="h-5 w-5 text-blue-600" />}
          iconColor="bg-blue-50 dark:bg-blue-950"
          isLoading={isLoadingStats}
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="mt-8 border-b border-border">
        <nav className="flex gap-1" aria-label="Fee management tabs">
          {(
            [
              { id: "pending", label: "Pending Dues", count: filteredDues.length },
              { id: "structures", label: "Fee Structures", count: feeStructures.length },
            ] as { id: Tab; label: string; count: number }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }
              `}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
              {!isLoadingDues && !isLoadingStructures && (
                <span
                  className={`
                    inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium
                    ${
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }
                  `}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab panels ──────────────────────────────────────────────────── */}
      <div className="mt-5">
        {/* ════════════════════════════════════════════════════════════════
            PENDING DUES TAB
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "pending" && (
          <div>
            {/* Filter bar */}
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {filteredDues.length} due{filteredDues.length !== 1 ? "s" : ""} found
              </p>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Filter by status"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Error */}
            {duesError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {duesError}
              </div>
            )}

            {/* Table */}
            {isLoadingDues ? (
              /* Skeleton rows */
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 w-full animate-pulse rounded-xl bg-muted"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : filteredDues.length === 0 ? (
              <EmptyState message="No pending dues" />
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Student
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Fee Type
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Final Amount
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Paid
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Remaining
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Due Date
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredDues.map((sf) => {
                        const finalAmt = Number(sf.final_amount ?? 0);
                        const paidSoFar = Number(sf.paid_so_far ?? 0);
                        const remaining = Math.max(0, finalAmt - paidSoFar);
                        const studentName = sf.student?.user?.name ?? "—";
                        const admissionNo = sf.student?.admission_no ?? "—";
                        const feeName = sf.fee_structure?.name ?? "—";

                        return (
                          <tr key={sf.id} className="hover:bg-muted/30 transition-colors">
                            {/* Student */}
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground truncate max-w-[140px]">
                                {studentName}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {admissionNo}
                              </p>
                            </td>

                            {/* Fee Type */}
                            <td className="px-4 py-3">
                              <p className="text-foreground truncate max-w-[120px]">{feeName}</p>
                              <p className="text-xs text-muted-foreground">{sf.academic_year}</p>
                            </td>

                            {/* Final Amount */}
                            <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
                              {inr(sf.final_amount)}
                            </td>

                            {/* Paid */}
                            <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400 font-medium">
                              {inr(sf.paid_so_far)}
                            </td>

                            {/* Remaining */}
                            <td
                              className={`px-4 py-3 text-right tabular-nums font-semibold ${
                                remaining > 0
                                  ? "text-destructive"
                                  : "text-green-600 dark:text-green-400"
                              }`}
                            >
                              {inr(remaining)}
                            </td>

                            {/* Due Date */}
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(sf.due_date)}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <FeeStatusBadge status={sf.status} />
                            </td>

                            {/* Action */}
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedFee(sf)}
                                disabled={remaining === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <CreditCard className="h-3 w-3" aria-hidden="true" />
                                Record Payment
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            FEE STRUCTURES TAB
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "structures" && (
          <div>
            {/* Toolbar */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {feeStructures.length} structure{feeStructures.length !== 1 ? "s" : ""}
              </p>
              <button
                type="button"
                onClick={() => setIsAddStructureOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Fee Structure
              </button>
            </div>

            {/* Error */}
            {structuresError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {structuresError}
              </div>
            )}

            {/* List */}
            {isLoadingStructures ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 w-full animate-pulse rounded-xl bg-muted"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : feeStructures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">No fee structures yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first fee structure to start assigning fees to students.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddStructureOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Fee Structure
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Frequency
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Academic Year
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {feeStructures.map((fs) => (
                        <tr key={fs.id} className="hover:bg-muted/30 transition-colors">
                          {/* Name */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{fs.fee_name ?? fs.name}</p>
                            {fs.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {fs.description}
                              </p>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                            {inr(fs.amount)}
                          </td>

                          {/* Frequency */}
                          <td className="px-4 py-3 text-muted-foreground">
                            {frequencyLabel(fs.frequency)}
                          </td>

                          {/* Academic Year */}
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {fs.academic_year}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                fs.is_active
                                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  fs.is_active
                                    ? "bg-green-500 dark:bg-green-400"
                                    : "bg-gray-400 dark:bg-gray-500"
                                }`}
                                aria-hidden="true"
                              />
                              {fs.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleDeleteStructure(fs)}
                              disabled={deletingStructureId === fs.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingStructureId === fs.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Record Payment Modal ─────────────────────────────────────────── */}
      {selectedFee && (
        <RecordPaymentModal
          studentFee={selectedFee}
          isOpen={selectedFee !== null}
          onClose={() => setSelectedFee(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* ── Add Fee Structure Modal ──────────────────────────────────────── */}
      {instituteId && (
        <AddFeeStructureModal
          instituteId={instituteId}
          academicYear={academicYear}
          isOpen={isAddStructureOpen}
          onClose={() => setIsAddStructureOpen(false)}
          onSuccess={handleStructureCreated}
        />
      )}
    </ProtectedRoute>
  );
}
