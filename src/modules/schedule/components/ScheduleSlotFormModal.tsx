import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import type { Batch, Room, Schedule, Staff, Subject, Section } from "@/types";
import { scheduleSlotSchema, type ScheduleSlotSchema } from "../validations";
import { DAY_LABELS } from "../utils/scheduleHelpers";

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";
const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

interface ScheduleSlotFormModalProps {
  open: boolean;
  editing: Schedule | null;
  batches: Batch[];
  subjects: Subject[];
  rooms: Room[];
  staff: Staff[];
  sections: Section[];
  isSubmitting: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (values: ScheduleSlotSchema) => Promise<void>;
  onBatchChange: (batchId: string) => void;
}

export function ScheduleSlotFormModal({
  open,
  editing,
  batches,
  subjects,
  rooms,
  staff,
  sections,
  isSubmitting,
  serverError,
  onClose,
  onSubmit,
  onBatchChange,
}: ScheduleSlotFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ScheduleSlotSchema>({
    resolver: zodResolver(scheduleSlotSchema),
    defaultValues: {
      type: "regular",
      day_of_week: 1,
      start_time: "09:00",
      end_time: "10:00",
    },
  });

  const batchId = watch("batch_id");

  useEffect(() => {
    if (batchId) onBatchChange(batchId);
  }, [batchId, onBatchChange]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      reset({
        batch_id: editing.batch_id,
        section_id: editing.section_id ?? "",
        subject_id: editing.subject_id ?? "",
        teacher_id: editing.teacher_id ?? "",
        room_id: editing.room_id ?? "",
        day_of_week: editing.day_of_week,
        start_time: editing.start_time.slice(0, 5),
        end_time: editing.end_time.slice(0, 5),
        type: editing.type,
        title: editing.title ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      reset({
        batch_id: batches[0]?.id ?? "",
        type: "regular",
        day_of_week: 1,
        start_time: "09:00",
        end_time: "10:00",
      });
    }
  }, [open, editing, batches, reset]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {editing ? "Edit schedule slot" : "Add schedule slot"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {serverError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Batch</label>
            <select {...register("batch_id")} className={INPUT_CLASS} disabled={isSubmitting}>
              <option value="">Select batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {errors.batch_id && (
              <p className="mt-1 text-xs text-destructive">{errors.batch_id.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Section</label>
              <select {...register("section_id")} className={INPUT_CLASS} disabled={isSubmitting}>
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Subject</label>
              <select {...register("subject_id")} className={INPUT_CLASS} disabled={isSubmitting}>
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Teacher</label>
              <select {...register("teacher_id")} className={INPUT_CLASS} disabled={isSubmitting}>
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user?.name ?? s.designation}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Room</label>
              <select {...register("room_id")} className={INPUT_CLASS} disabled={isSubmitting}>
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Day</label>
              <select
                {...register("day_of_week", { valueAsNumber: true })}
                className={INPUT_CLASS}
                disabled={isSubmitting}
              >
                {DAY_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Type</label>
              <select {...register("type")} className={INPUT_CLASS} disabled={isSubmitting}>
                <option value="regular">Regular</option>
                <option value="exam">Exam</option>
                <option value="break">Break</option>
                <option value="lunch">Lunch</option>
                <option value="event">Event</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Start</label>
              <input type="time" {...register("start_time")} className={INPUT_CLASS} disabled={isSubmitting} />
              {errors.start_time && (
                <p className="mt-1 text-xs text-destructive">{errors.start_time.message}</p>
              )}
            </div>
            <div>
              <label className={LABEL_CLASS}>End</label>
              <input type="time" {...register("end_time")} className={INPUT_CLASS} disabled={isSubmitting} />
              {errors.end_time && (
                <p className="mt-1 text-xs text-destructive">{errors.end_time.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Title (exam / event / break)</label>
            <input type="text" {...register("title")} className={INPUT_CLASS} disabled={isSubmitting} />
          </div>

          <div>
            <label className={LABEL_CLASS}>Notes</label>
            <textarea {...register("notes")} rows={2} className={INPUT_CLASS} disabled={isSubmitting} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add slot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
