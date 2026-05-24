// ---------------------------------------------------------------------------
// EduOS — CreateSessionModal
//
// Fixed-overlay modal for creating a new attendance session.
// Uses React Hook Form + Zod for validation and calls
// `createAttendanceSession` from the attendance service on submit.
//
// Fields:
//  1. Batch selector   — required; drives which students appear in the
//                        marking table after session creation.
//  2. Session Date     — date input, defaults to today.
//  3. Session Type     — "Daily" (full-day roll call) | "Lecture" (single class).
//  4. Topic            — optional; most useful for lecture-type sessions.
//
// The `conducted_by` field is resolved from the auth store — the currently
// signed-in user is automatically recorded as the session conductor.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Loader2, CalendarCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { createSessionSchema, type CreateSessionSchema } from "@/modules/attendance/validations";
import { createAttendanceSession } from "@/services/attendance.service";
import { useAuthStore } from "@/store/authStore";
import type { AttendanceBatchOption, AttendanceSession } from "@/types";

// ── Style constants ───────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return today's date as YYYY-MM-DD — safe for <input type="date"> defaultValue. */
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateSessionModalProps {
  /** The institute this session belongs to. */
  instituteId: string;
  /** List of active batches to populate the batch selector. */
  batches: AttendanceBatchOption[];
  /** True while batches are loading from the backend. */
  isBatchesLoading?: boolean;
  /** Whether the modal is visible. */
  isOpen: boolean;
  /** Called when the user dismisses the modal without submitting. */
  onClose: () => void;
  /** Called with the newly created session on successful submission. */
  onSuccess: (session: AttendanceSession) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `CreateSessionModal` — modal for creating a new attendance session.
 *
 * Renders as a fixed full-screen overlay with a centred card. Clicking the
 * backdrop (outside the card) dismisses the modal without saving.
 */
export function CreateSessionModal({
  instituteId,
  batches,
  isBatchesLoading = false,
  isOpen,
  onClose,
  onSuccess,
}: CreateSessionModalProps) {
  const { user } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSessionSchema>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      batch_id: "",
      session_date: todayIso(),
      session_type: "daily",
      topic: "",
      notes: "",
    },
  });

  const batchId = watch("batch_id");

  useEffect(() => {
    if (!isOpen || isBatchesLoading || batches.length === 0) return;
    if (!batchId) {
      setValue("batch_id", batches[0].id, { shouldValidate: true });
    }
  }, [isOpen, isBatchesLoading, batches, batchId, setValue]);

  // ── Submit ────────────────────────────────────────────────────────────────

  async function onSubmit(values: CreateSessionSchema) {
    setServerError(null);

    const result = await createAttendanceSession({
      institute_id: instituteId,
      batch_id: values.batch_id || null,
      course_id: null,
      conducted_by: user?.id ?? "",
      session_date: values.session_date,
      session_type: values.session_type,
      topic: values.topic || undefined,
      notes: values.notes || undefined,
    });

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to create session. Please try again.");
      return;
    }

    reset();
    onSuccess(result.data);
  }

  // ── Dismiss on backdrop click ─────────────────────────────────────────────

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      reset();
      setServerError(null);
      onClose();
    }
  }

  function handleClose() {
    reset();
    setServerError(null);
    onClose();
  }

  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="create-session-title"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        {/* ── Close button ──────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="create-session-title" className="text-base font-semibold text-foreground">
              New Attendance Session
            </h2>
            <p className="text-xs text-muted-foreground">
              Fill in the details to open a session for marking.
            </p>
          </div>
        </div>

        {/* ── Server error ─────────────────────────────────────────────── */}
        {serverError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {serverError}
          </div>
        )}

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Batch selector */}
          <div>
            <label className={LABEL_CLASS} htmlFor="cs-batch">
              Batch{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            {isBatchesLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading batches...
              </div>
            ) : batches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3">
                <p className="text-sm font-medium text-foreground">
                  No batches found. Create a batch first.
                </p>
                <Link
                  to="/dashboard/admin/batches"
                  className="mt-2 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={handleClose}
                >
                  Create Batch
                </Link>
              </div>
            ) : (
            <select
              id="cs-batch"
              className={INPUT_CLASS}
              value={batchId ?? ""}
              onChange={(e) => setValue("batch_id", e.target.value, { shouldValidate: true })}
              disabled={isSubmitting}
            >
              <option value="">— Select a batch —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            )}
            {errors.batch_id && (
              <p className="mt-1 text-xs text-destructive">{errors.batch_id.message}</p>
            )}
          </div>

          {/* Session Date */}
          <div>
            <label className={LABEL_CLASS} htmlFor="cs-date">
              Session Date{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="cs-date"
              type="date"
              className={INPUT_CLASS}
              {...register("session_date")}
              disabled={isSubmitting}
            />
            {errors.session_date && (
              <p className="mt-1 text-xs text-destructive">{errors.session_date.message}</p>
            )}
          </div>

          {/* Session Type */}
          <div>
            <label className={LABEL_CLASS} htmlFor="cs-type">
              Session Type{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="cs-type"
              className={INPUT_CLASS}
              {...register("session_type")}
              disabled={isSubmitting}
            >
              <option value="daily">Daily (full-day roll call)</option>
              <option value="lecture">Lecture (single class)</option>
            </select>
            {errors.session_type && (
              <p className="mt-1 text-xs text-destructive">{errors.session_type.message}</p>
            )}
          </div>

          {/* Topic (optional) */}
          <div>
            <label className={LABEL_CLASS} htmlFor="cs-topic">
              Topic <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="cs-topic"
              type="text"
              className={INPUT_CLASS}
              placeholder="e.g. Chapter 3 — Newton's Laws"
              {...register("topic")}
              disabled={isSubmitting}
            />
            {errors.topic && (
              <p className="mt-1 text-xs text-destructive">{errors.topic.message}</p>
            )}
          </div>

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                "Create Session"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
