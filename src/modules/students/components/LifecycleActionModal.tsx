// ---------------------------------------------------------------------------
// EduOS — LifecycleActionModal
//
// Modal for performing a lifecycle action on a student: graduate, suspend,
// reactivate, or promote/transfer to another batch.
//
// Flow:
//   1. Action selector grid — user picks one of four action cards.
//   2. Confirmation form   — reason (required), notes (optional),
//                            batch selector (for promote), effective date.
//   3. Success screen      — brief confirmation before auto-close.
//
// Validation via Zod + React Hook Form.  API call via performLifecycleAction.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, GraduationCap, Ban, RefreshCw, ArrowUpRight, Loader2, ChevronLeft } from "lucide-react";

import type { Student, Batch, LifecycleAction } from "@/types";
import { performLifecycleAction } from "@/services/student.service";

// ── Zod schema ────────────────────────────────────────────────────────────────

const lifecycleSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters"),
  notes: z.string().max(500).optional(),
  to_batch_id: z.string().uuid().optional(),
  effective_date: z.string().min(1, "Effective date is required"),
});

type LifecycleFormData = z.infer<typeof lifecycleSchema>;

// ── Action configuration ──────────────────────────────────────────────────────

type ActionColor = "blue" | "red" | "green" | "purple";

interface ActionConfig {
  action: LifecycleAction;
  label: string;
  confirmLabel: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: ActionColor;
}

const ALL_ACTIONS: ActionConfig[] = [
  {
    action: "graduated",
    label: "Graduate",
    confirmLabel: "Confirm Graduation",
    icon: GraduationCap,
    description: "Mark student as successfully graduated",
    color: "blue",
  },
  {
    action: "suspended",
    label: "Suspend",
    confirmLabel: "Confirm Suspension",
    icon: Ban,
    description: "Temporarily suspend the student",
    color: "red",
  },
  {
    action: "reactivated",
    label: "Reactivate",
    confirmLabel: "Confirm Reactivation",
    icon: RefreshCw,
    description: "Restore student to active status",
    color: "green",
  },
  {
    action: "promoted",
    label: "Promote / Transfer",
    confirmLabel: "Confirm Promotion",
    icon: ArrowUpRight,
    description: "Move student to a different batch",
    color: "purple",
  },
];

// ── Color utility ─────────────────────────────────────────────────────────────

type ColorEntry = { card: string; icon: string; text: string; confirm: string };

const COLOR_CLASSES: Record<ActionColor, ColorEntry> = {
  blue: {
    card: "border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50",
    icon: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    text: "text-blue-700 dark:text-blue-300",
    confirm: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white",
  },
  red: {
    card: "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/50",
    icon: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
    text: "text-red-700 dark:text-red-300",
    confirm: "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white",
  },
  green: {
    card: "border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/50",
    icon: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
    text: "text-green-700 dark:text-green-300",
    confirm: "bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white",
  },
  purple: {
    card: "border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/50",
    icon: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
    text: "text-purple-700 dark:text-purple-300",
    // prettier-ignore
    confirm: "bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white",
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface LifecycleActionModalProps {
  student: Student;
  batches: Batch[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (action: LifecycleAction) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `LifecycleActionModal` — performs lifecycle transitions on a student.
 *
 * Two-step flow:
 *   Step 1 — choose an action (graduate / suspend / reactivate / promote).
 *   Step 2 — fill in the reason form and confirm.
 *
 * "Reactivate" is hidden when the student is already active.
 */
export function LifecycleActionModal({
  student,
  batches,
  isOpen,
  onClose,
  onSuccess,
}: LifecycleActionModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Default effective date to today (YYYY-MM-DD)
  const today = new Date().toISOString().split("T")[0];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LifecycleFormData>({
    resolver: zodResolver(lifecycleSchema),
    defaultValues: {
      reason: "",
      notes: "",
      to_batch_id: "",
      effective_date: today,
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleClose() {
    if (isSubmitting) return;
    setSelectedAction(null);
    setServerError(null);
    setSaved(false);
    reset();
    onClose();
  }

  function handleBack() {
    setSelectedAction(null);
    setServerError(null);
    reset({ reason: "", notes: "", to_batch_id: "", effective_date: today });
  }

  async function onSubmit(data: LifecycleFormData) {
    if (!selectedAction) return;
    setServerError(null);

    const result = await performLifecycleAction({
      student_id: student.id,
      action: selectedAction.action,
      reason: data.reason,
      notes: data.notes || undefined,
      to_batch_id: data.to_batch_id || undefined,
      effective_date: data.effective_date,
    });

    if (!result.success) {
      setServerError(result.error ?? "Failed to perform action. Please try again.");
      return;
    }

    setSaved(true);
    setTimeout(() => {
      const action = selectedAction.action;
      handleClose();
      onSuccess(action);
    }, 1400);
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  // Filter out "Reactivate" when the student is already active.
  const visibleActions = ALL_ACTIONS.filter(
    (a) => a.action !== "reactivated" || student.status !== "active",
  );

  // ── Step 3: Success screen ─────────────────────────────────────────────────

  if (saved && selectedAction) {
    const colors = COLOR_CLASSES[selectedAction.color];
    const Icon = selectedAction.icon;
    return (
      <>
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50" />
        <div
          role="dialog"
          aria-modal="true"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card border border-border shadow-xl"
        >
          <div className="flex flex-col items-center gap-3 py-10 px-8 text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${colors.icon}`}
            >
              <Icon className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-foreground">Action applied!</p>
            <p className="text-sm text-muted-foreground">
              {selectedAction.label} has been recorded for{" "}
              <span className="font-medium text-foreground">
                {student.user?.name ?? "this student"}
              </span>
              .
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── Step 2: Confirmation form ──────────────────────────────────────────────

  if (selectedAction) {
    const colors = COLOR_CLASSES[selectedAction.color];
    const Icon = selectedAction.icon;
    const isPromote = selectedAction.action === "promoted";

    return (
      <>
        {/* Backdrop */}
        <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lifecycle-confirm-title"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card border border-border shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back to action selector"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.icon}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id="lifecycle-confirm-title" className="text-sm font-semibold text-foreground">
                  {selectedAction.label}
                </h2>
                <p className="text-xs text-muted-foreground truncate max-w-52">
                  {student.user?.name ?? student.admission_no}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* Server error */}
              {serverError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {serverError}
                </div>
              )}

              {/* Batch selector — only for promote/transfer */}
              {isPromote && (
                <div>
                  <label
                    htmlFor="to_batch_id"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Destination Batch
                  </label>
                  <select
                    id="to_batch_id"
                    {...register("to_batch_id")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">— keep current batch —</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.academic_year})
                      </option>
                    ))}
                  </select>
                  {errors.to_batch_id && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.to_batch_id.message}
                    </p>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <label
                  htmlFor="reason"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Reason
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  placeholder="Explain the reason for this action…"
                  {...register("reason")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {errors.reason && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.reason.message}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Any additional notes…"
                  {...register("notes")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {errors.notes && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.notes.message}
                  </p>
                )}
              </div>

              {/* Effective date */}
              <div>
                <label
                  htmlFor="effective_date"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Effective Date
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  type="date"
                  id="effective_date"
                  {...register("effective_date")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {errors.effective_date && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {errors.effective_date.message}
                  </p>
                )}
              </div>

              {/* Footer */}
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
                  className={`flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${colors.confirm}`}
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? "Applying…" : selectedAction.confirmLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ── Step 1: Action selector ────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifecycle-selector-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card border border-border shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="lifecycle-selector-title" className="text-sm font-semibold text-foreground">
              Manage Lifecycle
            </h2>
            <p className="text-xs text-muted-foreground truncate max-w-64">
              {student.user?.name ?? student.admission_no}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-2 gap-3 p-5">
          {visibleActions.map((cfg) => {
            const colors = COLOR_CLASSES[cfg.color];
            const Icon = cfg.icon;
            return (
              <button
                key={cfg.action}
                type="button"
                onClick={() => {
                  setSelectedAction(cfg);
                  reset({ reason: "", notes: "", to_batch_id: "", effective_date: today });
                }}
                className={`flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer ${colors.card}`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors.icon}`}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${colors.text}`}>{cfg.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                    {cfg.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
