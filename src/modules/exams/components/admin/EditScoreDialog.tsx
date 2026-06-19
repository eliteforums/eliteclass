import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { updateAttemptScore } from "@/modules/exams/services/exam.service";

const REASON_MIN = 3;
const REASON_MAX = 500;

export interface EditScoreDialogAttempt {
  id: string;
  student_name: string;
  current_score: number;
  max_score: number;
}

interface EditScoreDialogProps {
  attempt: EditScoreDialogAttempt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Manual score edit dialog used from the admin attempt list (Req 5).
 *
 * Wraps `updateAttemptScore`, which routes through the
 * `update_exam_score` SECURITY DEFINER RPC for atomic
 * update-attempt + insert-audit + insert-activity-log.
 *
 * Validation mirrors the DB-side checks so we can short-circuit clearly:
 *   * new score is a number in `[0, max_score]`
 *   * reason is `[REASON_MIN, REASON_MAX]` characters after trim
 */
export function EditScoreDialog({
  attempt,
  open,
  onOpenChange,
  onSuccess,
}: EditScoreDialogProps) {
  const [scoreInput, setScoreInput] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens for a different attempt.
  useEffect(() => {
    if (open && attempt) {
      setScoreInput(String(attempt.current_score ?? 0));
      setReason("");
      setIsSubmitting(false);
    }
  }, [open, attempt]);

  const parsedScore = useMemo(() => {
    if (scoreInput.trim() === "") return Number.NaN;
    const n = Number(scoreInput);
    return Number.isFinite(n) ? n : Number.NaN;
  }, [scoreInput]);

  const maxScore = attempt?.max_score ?? 0;
  const scoreInRange =
    Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= maxScore;
  const scoreChanged =
    Number.isFinite(parsedScore) && parsedScore !== (attempt?.current_score ?? 0);

  const reasonLength = reason.trim().length;
  const reasonValid = reasonLength >= REASON_MIN && reasonLength <= REASON_MAX;

  const canSubmit = !isSubmitting && scoreInRange && scoreChanged && reasonValid;

  const handleClose = (next: boolean) => {
    if (isSubmitting) return; // disallow close while submitting
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!attempt || !canSubmit) return;
    setIsSubmitting(true);
    const { success, error } = await updateAttemptScore(attempt.id, parsedScore, reason);
    setIsSubmitting(false);
    if (success) {
      toast.success(`Updated score for ${attempt.student_name}`);
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(error ?? "Failed to update score");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Edit score
          </DialogTitle>
          <DialogDescription>
            Update the recorded score for this attempt. The change is logged to the audit trail
            with your name and reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Student</p>
              <p className="font-medium truncate" title={attempt?.student_name ?? ""}>
                {attempt?.student_name ?? "—"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
              <p className="font-medium">
                {attempt?.current_score ?? 0} / {maxScore}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-score-value" className="text-sm font-medium">
              New score <span className="text-destructive">*</span>
            </label>
            <Input
              id="edit-score-value"
              type="number"
              inputMode="decimal"
              min={0}
              max={maxScore}
              step="any"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              disabled={isSubmitting}
            />
            <p
              className={
                scoreInput !== "" && !scoreInRange
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {scoreInput === ""
                ? `Enter a value between 0 and ${maxScore}`
                : !Number.isFinite(parsedScore)
                  ? "Must be a number"
                  : !scoreInRange
                    ? `Must be between 0 and ${maxScore}`
                    : !scoreChanged
                      ? "Score is unchanged"
                      : `Out of ${maxScore}`}
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-score-reason" className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="edit-score-reason"
              placeholder="e.g. Manual regrade after rubric review"
              rows={4}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between text-xs">
              <span
                className={
                  reasonLength > 0 && !reasonValid
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {reasonLength === 0
                  ? "Required"
                  : !reasonValid
                    ? `Must be ${REASON_MIN}–${REASON_MAX} characters`
                    : "Looks good"}
              </span>
              <span className="text-muted-foreground">
                {reasonLength}/{REASON_MAX}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save change"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
