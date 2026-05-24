// ---------------------------------------------------------------------------
// EduOS — StudentRemarkModal
//
// A focused modal for adding a freeform remark to a student's history log.
// Delegates persistence to the `addStudentRemark` service which calls the
// `add_student_remark` Postgres RPC — the server fills in `changed_by` and
// `institute_id` automatically via `auth.uid()`.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MessageSquarePlus, CheckCircle2, X } from "lucide-react";

import { remarkSchema, type RemarkSchema } from "@/modules/students/validations";
import { addStudentRemark } from "@/services";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentRemarkModalProps {
  /** The student to add the remark to. */
  studentId: string;
  /** Used only for display — shown in the modal title. */
  studentName: string;
  /** Controls modal open/close. */
  isOpen: boolean;
  /** Called when the modal should close (backdrop click, Esc, Cancel). */
  onClose: () => void;
  /** Called after the remark is successfully saved. */
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `StudentRemarkModal` — simple dialog to add a history remark to a student.
 *
 * After a successful save it shows a brief success confirmation before
 * calling `onSuccess` and closing.  The textarea enforces a 3–500 character
 * range via Zod, and a live character counter is shown near the limit.
 */
export function StudentRemarkModal({
  studentId,
  studentName,
  isOpen,
  onClose,
  onSuccess,
}: StudentRemarkModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RemarkSchema>({
    resolver: zodResolver(remarkSchema),
    defaultValues: { remark: "" },
  });

  const remarkValue = watch("remark");
  const charCount = remarkValue?.length ?? 0;
  const isNearLimit = charCount > 450;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function onSubmit({ remark }: RemarkSchema) {
    setServerError(null);

    const result = await addStudentRemark(studentId, remark);

    if (!result.success) {
      setServerError(result.error ?? "Failed to save remark. Please try again.");
      return;
    }

    setSaved(true);

    // Give the user a moment to read the success state, then call onSuccess.
    setTimeout(() => {
      reset();
      setSaved(false);
      onSuccess();
      onClose();
    }, 1200);
  }

  function handleClose() {
    if (isSubmitting) return; // Don't close while saving
    reset();
    setSaved(false);
    setServerError(null);
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
        aria-labelledby="remark-modal-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card border border-border shadow-xl"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="remark-modal-title" className="text-sm font-semibold text-foreground">
                Add Remark
              </h2>
              <p className="text-xs text-muted-foreground truncate max-w-48">{studentName}</p>
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

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="p-5">
          {/* Success state */}
          {saved ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-sm font-medium text-foreground">Remark saved!</p>
              <p className="text-xs text-muted-foreground">
                This has been added to the student's history log.
              </p>
            </div>
          ) : (
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

              {/* Textarea */}
              <div>
                <label
                  htmlFor="remark"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Remark
                  <span className="text-destructive ml-1" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  id="remark"
                  rows={5}
                  placeholder="Add a note about this student — e.g. attendance concern, behavioural observation, or achievement…"
                  {...register("remark")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />

                {/* Character counter + error */}
                <div className="mt-1 flex items-start justify-between gap-2">
                  {errors.remark ? (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.remark.message}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p
                    className={`text-xs tabular-nums shrink-0 ${
                      isNearLimit ? "text-destructive" : "text-muted-foreground"
                    }`}
                    aria-live="polite"
                  >
                    {charCount}/500
                  </p>
                </div>
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
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? "Saving…" : "Save Remark"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
