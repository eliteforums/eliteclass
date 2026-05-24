// ---------------------------------------------------------------------------
// AssignmentPanel — student assignment submission panel
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import {
  ClipboardList,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Calendar,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  getAssignmentByLesson,
  getStudentSubmission,
  submitAssignment,
} from "@/modules/courses/services/assignment.service";
import { uploadSubmissionFile } from "@/modules/courses/services/upload.service";
import { cn } from "@/lib/utils";
import type { LmsLesson, LmsEnrollment, LmsAssignment, LmsAssignmentSubmission } from "@/types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AssignmentPanelProps {
  lesson: LmsLesson;
  enrollment: LmsEnrollment;
  studentId: string;
  instituteId: string;
  onComplete: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssignmentPanel({
  lesson,
  enrollment,
  studentId,
  instituteId,
  onComplete,
}: AssignmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignment, setAssignment] = useState<LmsAssignment | null>(null);
  const [submission, setSubmission] = useState<LmsAssignmentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [textResponse, setTextResponse] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Load assignment and existing submission ────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);
    setAssignment(null);
    setSubmission(null);
    setTextResponse("");
    setSelectedFiles([]);

    void (async () => {
      const assignRes = await getAssignmentByLesson(lesson.id);
      if (!assignRes.success || !assignRes.data) {
        setError(assignRes.error ?? "No assignment found for this lesson.");
        setLoading(false);
        return;
      }

      const a = assignRes.data;
      setAssignment(a);

      const subRes = await getStudentSubmission(a.id, studentId);
      if (subRes.success && subRes.data) {
        setSubmission(subRes.data);
        setTextResponse(subRes.data.text_response ?? "");
      }
      setLoading(false);
    })();
  }, [lesson.id, studentId]);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!assignment) return;
    if (!textResponse.trim() && selectedFiles.length === 0) {
      toast.error("Please add a text response or attach at least one file.");
      return;
    }

    setSubmitting(true);
    setUploading(selectedFiles.length > 0);

    try {
      const fileUrls: string[] = [];
      const storagePaths: string[] = [];

      // Upload files
      for (const file of selectedFiles) {
        const uploadRes = await uploadSubmissionFile(
          file,
          studentId,
          assignment.id,
          instituteId,
        );
        if (!uploadRes.success || !uploadRes.data) {
          throw new Error(uploadRes.error ?? `Failed to upload ${file.name}`);
        }
        storagePaths.push(uploadRes.data.path);
        fileUrls.push(uploadRes.data.path);
      }

      setUploading(false);

      // Submit
      const res = await submitAssignment({
        assignment_id: assignment.id,
        enrollment_id: enrollment.id,
        student_id: studentId,
        institute_id: instituteId,
        file_urls: fileUrls,
        storage_paths: storagePaths,
        text_response: textResponse.trim() || undefined,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Submission failed");
      }

      setSubmission(res.data);
      setSelectedFiles([]);
      toast.success("Assignment submitted successfully!");
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{error ?? "Assignment not found."}</p>
      </div>
    );
  }

  // ── Submitted state ────────────────────────────────────────────────────────

  const isSubmitted = !!submission;
  const isGraded = submission?.status === "graded";

  if (isSubmitted) {
    return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-1 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">{assignment.title}</h3>
            {assignment.description && (
              <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>
            )}
          </div>
        </div>

        {/* Submission status card */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {isGraded ? "Assignment graded" : "Assignment submitted"}
              </span>
              {submission.is_late && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-600 text-xs">
                  Late
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Submitted {formatDate(submission.submitted_at)}
            </p>
          </CardContent>
        </Card>

        {/* Grade */}
        {isGraded && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-primary" />
                <span className="text-sm font-medium">
                  Grade:{" "}
                  <span className="text-primary">
                    {submission.grade} / {assignment.max_score}
                  </span>
                </span>
              </div>
              {submission.feedback && (
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Feedback: </span>
                  {submission.feedback}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submitted response */}
        {submission.text_response && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your response
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {submission.text_response}
            </div>
          </div>
        )}

        {/* Submitted files */}
        {submission.file_urls && submission.file_urls.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Attached files
            </p>
            <ul className="space-y-1">
              {submission.file_urls.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="size-3.5" />
                    File {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Submission form ────────────────────────────────────────────────────────

  const isPastDue = assignment.due_date && new Date() > new Date(assignment.due_date);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-1 size-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-semibold text-foreground">{assignment.title}</h3>
          {assignment.description && (
            <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Award className="size-4" />
          <span>Max score: {assignment.max_score} pts</span>
        </div>
        {assignment.due_date && (
          <div
            className={cn(
              "flex items-center gap-1.5",
              isPastDue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
            )}
          >
            <Calendar className="size-4" />
            <span>Due {formatDate(assignment.due_date)}</span>
            {isPastDue && (
              <Badge variant="outline" className="border-rose-500/30 text-rose-600 text-xs">
                Past due
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      {assignment.instructions && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Instructions
          </p>
          <p className="text-sm whitespace-pre-wrap text-foreground">{assignment.instructions}</p>
        </div>
      )}

      {/* Late warning */}
      {isPastDue && !assignment.allow_late && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>The deadline has passed. Submissions are no longer accepted.</span>
        </div>
      )}

      {/* Only show the form if submission is still allowed */}
      {(!isPastDue || assignment.allow_late) && (
        <>
          {/* Text response */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Written response
            </label>
            <Textarea
              value={textResponse}
              onChange={(e) => setTextResponse(e.target.value)}
              placeholder="Type your response here..."
              className="min-h-32 resize-y"
              disabled={submitting}
            />
          </div>

          {/* File upload */}
          {assignment.accepted_file_types && assignment.accepted_file_types.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Attachments
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Accepted: {assignment.accepted_file_types.join(", ")}
              </p>

              {/* Selected files */}
              {selectedFiles.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {selectedFiles.map((file, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Remove file"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                multiple
                accept={assignment.accepted_file_types.join(",")}
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="gap-2"
              >
                <Upload className="size-4" />
                Attach file
              </Button>
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || (isPastDue === true && !assignment.allow_late)}
            className="w-full gap-2"
          >
            {submitting ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {uploading ? "Uploading files…" : "Submitting…"}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Submit Assignment
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
