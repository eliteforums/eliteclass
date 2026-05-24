// ---------------------------------------------------------------------------
// EduOS — AdmissionForm
//
// Multi-section student admission form.
// Uses React Hook Form + Zod for validation and the admitStudent service
// which calls the `admit_student` Supabase RPC on the backend.
//
// Sections:
//  1. Personal Info    — full name, email, phone
//  2. Academic Details — admission number, batch
//  3. Identity         — Aadhaar last 4 digits (masked input)
//  4. Emergency Contact — name, phone, relationship (all optional)
// ---------------------------------------------------------------------------

import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, User, BookOpen, Shield, Phone, Users } from "lucide-react";

import { admissionSchema, type AdmissionSchema } from "@/modules/students/validations";
import { admitStudent } from "@/services";
import { getBatchesByInstitute } from "@/services";
import { useAuthStore } from "@/store/authStore";
import type {
  Batch,
  AdmitStudentPayload,
  AdmitStudentResult,
  ParentAdmissionPayload,
  StudentAdmissionPayload,
} from "@/types";
import { StudentCredentialsCard } from "@/modules/students/components/StudentCredentialsCard";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AdmissionFormProps {
  /** Institute ID to attach the new student to. */
  instituteId: string;
  /** Called with the new student's ID and admission number on success. */
  onSuccess: (result: AdmitStudentResult) => void;
  /** Called when the user explicitly cancels or clicks "Done" after success. */
  onCancel: () => void;
}

// ── Shared style constants ─────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

// ── Sub-components ────────────────────────────────────────────────────────────

/** Consistent section header with a small icon badge and title. */
function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4"
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `AdmissionForm` — complete student admission form.
 *
 * Shows a success state after a successful submission with an option to
 * reset and admit another student immediately.
 */
export function AdmissionForm({ instituteId, onSuccess, onCancel }: AdmissionFormProps) {
  const { institute } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<AdmitStudentResult | null>(null);
  const [admittedStudentName, setAdmittedStudentName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBatches() {
      setIsLoadingBatches(true);
      const result = await getBatchesByInstitute(instituteId, { page: 1, pageSize: 500 });
      if (!cancelled) {
        setBatches(result.success && result.data ? result.data.items : []);
        setIsLoadingBatches(false);
      }
    }

    void loadBatches();

    return () => {
      cancelled = true;
    };
  }, [instituteId]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdmissionSchema>({
    resolver: zodResolver(admissionSchema),
    defaultValues: {
      fullName: "",
      contactEmail: "",
      phone: "",
      admissionNo: "",
      batchId: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      emergencyRelationship: "",
      parentName: "",
      parentEmail: "",
      parentPhone: "",
      parentOccupation: "",
      parentRelationType: undefined,
    },
  });

  // ── Submit handler ──────────────────────────────────────────────────────────

  async function onSubmit(values: AdmissionSchema) {
    setServerError(null);

    // Assemble the EmergencyContact object only if at least one field is filled.
    const hasEmergencyContact =
      !!values.emergencyContactName ||
      !!values.emergencyContactPhone ||
      !!values.emergencyRelationship;

    const studentPayload: StudentAdmissionPayload = {
      institute_id: instituteId,
      student_name: values.fullName,
      student_email: values.contactEmail.trim() || null,
      phone: values.phone,
      admission_number: values.admissionNo,
      batch_id: values.batchId?.trim() || null,
      aadhaar_last4: null,
      emergency_contact: hasEmergencyContact
        ? {
            name: values.emergencyContactName ?? "",
            phone: values.emergencyContactPhone ?? "",
            relation: values.emergencyRelationship ?? "",
          }
        : null,
    };

    const parentPayload: ParentAdmissionPayload = {
      parent_name: values.parentName?.trim() || null,
      parent_email: values.parentEmail?.trim() || null,
      parent_phone: values.parentPhone?.trim() || null,
      parent_occupation: values.parentOccupation?.trim() || null,
      parent_relation_type: values.parentRelationType ?? null,
    };

    const payload: AdmitStudentPayload = {
      ...studentPayload,
      ...parentPayload,
      // Pass institute name so the credential generator can build a meaningful login ID prefix
      institute_name: institute?.name ?? undefined,
    };

    const result = await admitStudent(payload);

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to admit student. Please try again.");
      return;
    }

    setAdmittedStudentName(values.fullName);
    setSuccessResult(result.data);
    onSuccess(result.data);
  }

  // ── Admit another handler ───────────────────────────────────────────────────

  function handleAdmitAnother() {
    reset();
    setSuccessResult(null);
    setAdmittedStudentName("");
    setServerError(null);
  }

  // ── Success state ───────────────────────────────────────────────────────────

  if (successResult) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4 text-center">
        {/* Checkmark */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>

        {/* Message */}
        <div className="max-w-sm space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            Student admitted successfully!
          </h3>
          <p className="text-sm text-muted-foreground">
            Login credentials were generated. Share them securely with the student.
          </p>
        </div>

        <StudentCredentialsCard studentName={admittedStudentName} credentials={successResult} />

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleAdmitAnother}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Admit Another
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* Server error banner */}
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      {/* ── Section 1 — Personal Information ─────────────────────────────── */}
      <div>
        <SectionHeader icon={<User />} title="Personal Information" />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Full Name — spans both columns */}
          <div className="sm:col-span-2">
            <label htmlFor="fullName" className={LABEL_CLASS}>
              Full Name{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ravi Kumar Sharma"
              {...register("fullName")}
              className={INPUT_CLASS}
            />
            {errors.fullName && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Contact email */}
          <div>
            <label htmlFor="contactEmail" className={LABEL_CLASS}>
              Contact email{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="contactEmail"
              type="email"
              autoComplete="email"
              placeholder="Personal email for records only"
              {...register("contactEmail")}
              className={INPUT_CLASS}
            />
            {errors.contactEmail && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.contactEmail.message}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Sign-in email and password are auto-generated at admission.
            </p>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className={LABEL_CLASS}>
              Phone{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              {...register("phone")}
              className={INPUT_CLASS}
            />
            {errors.phone && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Section 2 — Academic Details ──────────────────────────────────── */}
      <div>
        <SectionHeader icon={<BookOpen />} title="Academic Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Admission Number */}
          <div>
            <label htmlFor="admissionNo" className={LABEL_CLASS}>
              Admission Number{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="admissionNo"
              type="text"
              placeholder="e.g. 2024-001"
              {...register("admissionNo")}
              className={INPUT_CLASS}
            />
            {errors.admissionNo ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.admissionNo.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Must be unique within this institute.
              </p>
            )}
          </div>

          {/* Batch — disabled until Batch management is built */}
          <div>
            <label htmlFor="batchId" className={LABEL_CLASS}>
              Batch <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <select id="batchId" {...register("batchId")} className={INPUT_CLASS} disabled={isLoadingBatches}>
              <option value="">Unassigned</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoadingBatches
                ? "Loading available batches..."
                : "Leave as Unassigned to admit the student without a batch."}
            </p>
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Identity section removed (Aadhaar not collected) */}

      {/* ── Section 4 — Emergency Contact ─────────────────────────────────── */}
      <div>
        <SectionHeader icon={<Phone />} title="Emergency Contact" />
        <p className="mb-4 text-xs text-muted-foreground -mt-1">
          All fields are optional — fill in what is available at admission time.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Contact Name */}
          <div>
            <label htmlFor="emergencyContactName" className={LABEL_CLASS}>
              Contact Name
            </label>
            <input
              id="emergencyContactName"
              type="text"
              placeholder="Parent / Guardian"
              autoComplete="name"
              {...register("emergencyContactName")}
              className={INPUT_CLASS}
            />
          </div>

          {/* Contact Phone */}
          <div>
            <label htmlFor="emergencyContactPhone" className={LABEL_CLASS}>
              Contact Phone
            </label>
            <input
              id="emergencyContactPhone"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              {...register("emergencyContactPhone")}
              className={INPUT_CLASS}
            />
          </div>

          {/* Relationship */}
          <div>
            <label htmlFor="emergencyRelationship" className={LABEL_CLASS}>
              Relationship
            </label>
            <input
              id="emergencyRelationship"
              type="text"
              placeholder="e.g. Father, Mother"
              {...register("emergencyRelationship")}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── Section 5 — Parent Details ────────────────────────────────────── */}
      <div>
        <SectionHeader icon={<Users />} title="Parent / Guardian Details" />
        <p className="mb-4 text-xs text-muted-foreground -mt-1">
          Optional — provide parent details to auto-create or link a parent account.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Parent Name */}
          <div>
            <label htmlFor="parentName" className={LABEL_CLASS}>
              Parent Name
            </label>
            <input
              id="parentName"
              type="text"
              placeholder="e.g. John Doe"
              autoComplete="name"
              {...register("parentName")}
              className={INPUT_CLASS}
            />
          </div>

          {/* Parent Email */}
          <div>
            <label htmlFor="parentEmail" className={LABEL_CLASS}>
              Parent Email
            </label>
            <input
              id="parentEmail"
              type="email"
              placeholder="parent@example.com"
              autoComplete="email"
              {...register("parentEmail")}
              className={INPUT_CLASS}
            />
            {errors.parentEmail && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.parentEmail.message}
              </p>
            )}
          </div>

          {/* Parent Phone */}
          <div>
            <label htmlFor="parentPhone" className={LABEL_CLASS}>
              Parent Phone
            </label>
            <input
              id="parentPhone"
              type="tel"
              placeholder="+91 98765 43210"
              autoComplete="tel"
              {...register("parentPhone")}
              className={INPUT_CLASS}
            />
          </div>

          {/* Parent Occupation */}
          <div>
            <label htmlFor="parentOccupation" className={LABEL_CLASS}>
              Occupation
            </label>
            <input
              id="parentOccupation"
              type="text"
              placeholder="e.g. Engineer, Doctor"
              {...register("parentOccupation")}
              className={INPUT_CLASS}
            />
          </div>

          {/* Relationship Type */}
          <div>
            <label htmlFor="parentRelationType" className={LABEL_CLASS}>
              Relationship Type
            </label>
            <select
              id="parentRelationType"
              {...register("parentRelationType")}
              className={INPUT_CLASS}
            >
              <option value="">— Select relationship —</option>
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Guardian</option>
              <option value="sibling">Sibling</option>
              <option value="other">Other</option>
            </select>
            {errors.parentRelationType && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.parentRelationType.message}
              </p>
            )}
          </div>
        </div>
        {errors.parentName && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {errors.parentName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Admitting…" : "Admit Student"}
        </button>
      </div>
    </form>
  );
}
