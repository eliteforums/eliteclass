// ---------------------------------------------------------------------------
// Parent-Student Link Modal
//
// Modal for linking an existing parent to a student.
// Used in student detail pages and batch linking workflows.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, X } from "lucide-react";
import { z } from "zod";

import { linkParentToStudent, checkParentStudentLink } from "@/services/parent.service";
import type { RelationType } from "@/types";

// ── Schema ─────────────────────────────────────────────────────────────────

const linkSchema = z.object({
  parentId: z.string().min(1, "Parent is required"),
  relationType: z.enum(["father", "mother", "guardian", "sibling", "other"] as const, {
    errorMap: () => ({ message: "Please select a relationship type" }),
  }),
});

type LinkSchema = z.infer<typeof linkSchema>;

// ── Props ──────────────────────────────────────────────────────────────────

interface LinkParentToStudentModalProps {
  studentId: string;
  studentName: string;
  parentOptions: Array<{ id: string; name: string; email: string }>;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function LinkParentToStudentModal({
  studentId,
  studentName,
  parentOptions,
  isOpen,
  onClose,
  onSuccess,
}: LinkParentToStudentModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LinkSchema>({
    resolver: zodResolver(linkSchema),
  });

  async function onSubmit(values: LinkSchema) {
    setServerError(null);
    setIsLinking(true);

    // Check if link already exists
    const linkExists = await checkParentStudentLink(studentId, values.parentId);
    if (linkExists) {
      setServerError("This parent is already linked to this student.");
      setIsLinking(false);
      return;
    }

    // Create the link
    const result = await linkParentToStudent({
      student_id: studentId,
      parent_id: values.parentId,
      relation_type: values.relationType as RelationType,
    });

    setIsLinking(false);

    if (!result.success) {
      setServerError(result.error ?? "Failed to link parent. Please try again.");
      return;
    }

    reset();
    onSuccess();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200"
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card border border-border shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Link Parent to Student</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-6 py-4">
          {serverError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Student name (read-only) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Student</p>
            <p className="text-sm font-semibold text-foreground">{studentName}</p>
          </div>

          {/* Parent selector */}
          <div>
            <label htmlFor="parentId" className="block text-xs font-medium text-foreground mb-2">
              Parent <span className="text-destructive">*</span>
            </label>
            <select
              id="parentId"
              {...register("parentId")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            >
              <option value="">— Select a parent —</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} ({parent.email})
                </option>
              ))}
            </select>
            {errors.parentId && (
              <p className="mt-1 text-xs text-destructive">{errors.parentId.message}</p>
            )}
          </div>

          {/* Relationship type */}
          <div>
            <label
              htmlFor="relationType"
              className="block text-xs font-medium text-foreground mb-2"
            >
              Relationship Type <span className="text-destructive">*</span>
            </label>
            <select
              id="relationType"
              {...register("relationType")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            >
              <option value="">— Select relationship —</option>
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Guardian</option>
              <option value="sibling">Sibling</option>
              <option value="other">Other</option>
            </select>
            {errors.relationType && (
              <p className="mt-1 text-xs text-destructive">{errors.relationType.message}</p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isLinking}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || isLinking}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting || isLinking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Linking…
              </>
            ) : (
              "Link Parent"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
