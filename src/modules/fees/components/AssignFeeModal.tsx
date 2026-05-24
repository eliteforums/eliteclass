// ---------------------------------------------------------------------------
// EduOS — AssignFeeModal
//
// Modal for assigning a fee structure to a specific student.
// Shows a live amount preview as the admin selects a structure and enters
// a discount, so the final amount is always visible before submitting.
//
// Calls `assignFeeToStudent` from fee.service.ts; the RPC sets:
//  - final_amount = original_amount - discount_amount
//  - paid_so_far  = 0
//  - status       = 'pending'
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Loader2, CheckCircle2, IndianRupee, Tag } from "lucide-react";

import { assignFeeSchema } from "@/modules/fees/validations";
import { assignFeeToStudent } from "@/services/fee.service";
import { useAuthStore } from "@/store/authStore";
import type { FeeStructure } from "@/types";

// ── Local form values type ────────────────────────────────────────────────────
// Matches the INPUT type of assignFeeSchema (what RHF sees before validation).
// Using optional `discount_amount` mirrors how Zod's .default() widens the
// input type, eliminating the zodResolver generic mismatch.
type AssignFeeFormValues = {
  fee_structure_id: string;
  /** Optional pre-validation — Zod .default(0) fills it when undefined. */
  discount_amount?: number;
  discount_reason?: string;
  due_date: string;
  academic_year: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number as Indian rupees: ₹1,00,000 */
function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Derive the current academic year as "YYYY-YY" from the current date. */
function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

/** Map a frequency enum value to a human-readable label. */
function frequencyLabel(freq: FeeStructure["frequency"]): string {
  const map: Record<FeeStructure["frequency"], string> = {
    one_time: "One-time",
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
  };
  return map[freq] ?? freq;
}

// ── Shared input style ────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssignFeeModalProps {
  /** Primary key of the student being assigned a fee. */
  studentId: string;
  /** Used in the modal title for clarity. */
  studentName: string;
  /** Institute ID — attached to the new student_fees row. */
  instituteId: string;
  /** Pre-fetched list of fee structures for this institute. */
  feeStructures: FeeStructure[];
  /** Controls modal open/close. */
  isOpen: boolean;
  /** Called when the modal should close. */
  onClose: () => void;
  /** Called after a successful assignment (triggers a data refetch). */
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `AssignFeeModal` — dialog to assign a fee structure to a single student.
 *
 * Displays a live "Final Amount" preview that updates as the admin changes
 * the selected fee structure or discount amount.  Requires a due date and
 * academic year before allowing submission.
 */
export function AssignFeeModal({
  studentId,
  studentName,
  instituteId,
  feeStructures,
  isOpen,
  onClose,
  onSuccess,
}: AssignFeeModalProps) {
  const { user } = useAuthStore();

  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Derive original_amount from the selected fee structure.
  const [originalAmount, setOriginalAmount] = useState(0);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssignFeeFormValues>({
    resolver: zodResolver(assignFeeSchema),
    defaultValues: {
      fee_structure_id: "",
      discount_amount: 0,
      discount_reason: "",
      due_date: "",
      academic_year: currentAcademicYear(),
    },
  });

  // Watch live values for the preview panel.
  const selectedStructureId = useWatch({ control, name: "fee_structure_id" });
  const discountAmount = useWatch({ control, name: "discount_amount" }) ?? 0;

  // Keep originalAmount in sync whenever the fee structure dropdown changes.
  useEffect(() => {
    const found = feeStructures.find((fs) => fs.id === selectedStructureId);
    setOriginalAmount(found?.amount ?? 0);
  }, [selectedStructureId, feeStructures]);

  const finalAmount = Math.max(0, originalAmount - (Number(discountAmount) || 0));

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function onSubmit(values: AssignFeeFormValues) {
    setServerError(null);

    if (!user?.id) {
      setServerError("You must be signed in to assign fees.");
      return;
    }

    const result = await assignFeeToStudent({
      student_id: studentId,
      institute_id: instituteId,
      fee_structure_id: values.fee_structure_id,
      assigned_by: user.id,
      original_amount: originalAmount,
      discount_amount: values.discount_amount ?? 0,
      // Zod .default(0) guarantees this is 0 if the field was left empty.
      discount_reason: values.discount_reason || undefined,
      due_date: values.due_date,
      academic_year: values.academic_year,
    });

    if (!result.success) {
      setServerError(result.error ?? "Failed to assign fee. Please try again.");
      return;
    }

    setSaved(true);
    setTimeout(() => {
      reset();
      setSaved(false);
      setOriginalAmount(0);
      onSuccess();
      onClose();
    }, 1200);
  }

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setSaved(false);
    setServerError(null);
    setOriginalAmount(0);
    onClose();
  }

  // ── Guard ────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-fee-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card border border-border shadow-xl overflow-hidden"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="assign-fee-title" className="text-sm font-semibold text-foreground">
                Assign Fee
              </h2>
              <p className="text-xs text-muted-foreground truncate max-w-60">{studentName}</p>
            </div>
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

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-5">
          {/* ── Success state ────────────────────────────────────────────── */}
          {saved ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2
                  className="h-7 w-7 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Fee Assigned!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The fee has been assigned to {studentName}.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* Amount preview banner */}
              {originalAmount > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Final Amount After Discount</p>
                    <p className="text-lg font-bold text-foreground">{inr(finalAmount)}</p>
                    {discountAmount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {inr(originalAmount)} − {inr(Number(discountAmount) || 0)} discount
                      </p>
                    )}
                  </div>
                  <IndianRupee className="h-8 w-8 text-primary/40 shrink-0" aria-hidden="true" />
                </div>
              )}

              {/* Server error */}
              {serverError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {serverError}
                </div>
              )}

              {/* Fee Structure selector */}
              <div>
                <label htmlFor="fee-structure" className={LABEL_CLASS}>
                  Fee Structure
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <select
                  id="fee-structure"
                  {...register("fee_structure_id")}
                  className={INPUT_CLASS}
                >
                  <option value="">— Select a fee structure —</option>
                  {feeStructures.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.fee_name ?? fs.name} — {inr(fs.amount)} / {frequencyLabel(fs.frequency)}
                    </option>
                  ))}
                </select>
                {errors.fee_structure_id && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.fee_structure_id.message}
                  </p>
                )}
              </div>

              {/* Discount Amount */}
              <div>
                <label htmlFor="discount-amount" className={LABEL_CLASS}>
                  Discount Amount
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (optional — defaults to ₹0)
                  </span>
                </label>
                <div className="relative">
                  <IndianRupee
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="discount-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    max={originalAmount}
                    placeholder="0"
                    {...register("discount_amount", { valueAsNumber: true })}
                    className={`${INPUT_CLASS} pl-9`}
                  />
                </div>
                {errors.discount_amount && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.discount_amount.message}
                  </p>
                )}
              </div>

              {/* Discount Reason */}
              <div>
                <label htmlFor="discount-reason" className={LABEL_CLASS}>
                  Discount Reason
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="discount-reason"
                  type="text"
                  placeholder="e.g. Scholarship, sibling discount…"
                  {...register("discount_reason")}
                  className={INPUT_CLASS}
                />
                {errors.discount_reason && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.discount_reason.message}
                  </p>
                )}
              </div>

              {/* Due Date */}
              <div>
                <label htmlFor="due-date" className={LABEL_CLASS}>
                  Due Date
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="due-date"
                  type="date"
                  {...register("due_date")}
                  className={INPUT_CLASS}
                />
                {errors.due_date && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.due_date.message}
                  </p>
                )}
              </div>

              {/* Academic Year */}
              <div>
                <label htmlFor="academic-year" className={LABEL_CLASS}>
                  Academic Year
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="academic-year"
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

              {/* Footer actions */}
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
                  {isSubmitting ? "Assigning…" : "Assign Fee"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
