import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
  grantAttemptOverride,
  grantAttemptOverrideToMany,
  listExamOverrides,
  listExamReattemptStats,
  type AttemptOverride,
  type ExamReattemptStatRow,
} from "@/modules/exams/services/exam.service";

const REASON_MIN = 1;
const REASON_MAX = 500;

type EnrichedOverride = AttemptOverride & {
  student_name?: string;
  admission_no?: string;
};

interface AttemptOverridePanelProps {
  examId: string;
}

/**
 * Admin "Reattempts" tab content for `/dashboard/admin/exams/[examId]`.
 *
 * Two stacked cards:
 *   1. Reattempt status table — one row per assigned student with a "Grant +1
 *      Attempt" action.
 *   2. Recent overrides — every override granted on this exam (active or
 *      consumed), newest first.
 *
 * Per Req 3.1–3.5: granting an override inserts a row into
 * `exam_attempt_overrides` with `consumed_at = NULL`, which the
 * `enforce_exam_attempt_limit` trigger reads as +1 to the cap.
 */
export function AttemptOverridePanel({ examId }: AttemptOverridePanelProps) {
  const [stats, setStats] = useState<ExamReattemptStatRow[]>([]);
  const [overrides, setOverrides] = useState<EnrichedOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [target, setTarget] = useState<ExamReattemptStatRow | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    const [statsRes, overridesRes] = await Promise.all([
      listExamReattemptStats(examId),
      listExamOverrides(examId),
    ]);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (overridesRes.success && overridesRes.data) setOverrides(overridesRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const reasonLength = reason.trim().length;
  const reasonValid = reasonLength >= REASON_MIN && reasonLength <= REASON_MAX;

  const bulkReasonLength = bulkReason.trim().length;
  const bulkReasonValid =
    bulkReasonLength >= REASON_MIN && bulkReasonLength <= REASON_MAX;

  const closeDialog = () => {
    if (isSubmitting) return;
    setTarget(null);
    setReason("");
  };

  const closeBulkDialog = () => {
    if (isBulkSubmitting) return;
    setBulkOpen(false);
    setBulkReason("");
  };

  const handleSubmit = async () => {
    if (!target) return;
    if (!reasonValid) {
      toast.error(`Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`);
      return;
    }
    setIsSubmitting(true);
    const { success, error } = await grantAttemptOverride(examId, target.student_id, reason);
    setIsSubmitting(false);
    if (success) {
      toast.success(`Granted +1 attempt to ${target.student_name}`);
      setTarget(null);
      setReason("");
      refresh();
    } else {
      toast.error(error ?? "Failed to grant override");
    }
  };

  const handleBulkSubmit = async () => {
    if (!bulkReasonValid) {
      toast.error(`Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`);
      return;
    }
    if (stats.length === 0) {
      toast.error("No students to grant attempts to.");
      return;
    }
    setIsBulkSubmitting(true);
    const studentIds = stats.map((row) => row.student_id);
    const { success, error, data } = await grantAttemptOverrideToMany(
      examId,
      studentIds,
      bulkReason,
    );
    setIsBulkSubmitting(false);
    if (success) {
      toast.success(
        `Granted +1 attempt to ${data?.length ?? studentIds.length} student${
          (data?.length ?? studentIds.length) === 1 ? "" : "s"
        }`,
      );
      setBulkOpen(false);
      setBulkReason("");
      refresh();
    } else {
      toast.error(error ?? "Failed to grant overrides");
    }
  };

  const renderMaxAttempts = (max: number) =>
    max === 0 ? <Badge variant="secondary">Unlimited</Badge> : <span>{max}</span>;

  const totalActiveOverrides = useMemo(
    () => stats.reduce((sum, row) => sum + row.active_overrides, 0),
    [stats],
  );

  return (
    <div className="space-y-6">
      {/* Stats / status table */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-muted-foreground" />
              Reattempt status
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Per-student attempts consumed and active overrides.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              size="sm"
              variant="default"
              className="gap-1"
              onClick={() => {
                setBulkReason("");
                setBulkOpen(true);
              }}
              disabled={isLoading || stats.length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              Grant +1 to all
            </Button>
            {totalActiveOverrides > 0 && (
              <Badge variant="outline" className="gap-1">
                <RotateCcw className="h-3 w-3" />
                {totalActiveOverrides} active override{totalActiveOverrides === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : stats.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students assigned to this exam yet.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission No</TableHead>
                    <TableHead className="text-center">Attempts Taken</TableHead>
                    <TableHead className="text-center">Max Attempts</TableHead>
                    <TableHead className="text-center">Active Overrides</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((row) => (
                    <TableRow key={row.student_id}>
                      <TableCell className="font-medium">{row.student_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.admission_no || "—"}
                      </TableCell>
                      <TableCell className="text-center">{row.attempts_taken}</TableCell>
                      <TableCell className="text-center">
                        {renderMaxAttempts(row.max_attempts)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.active_overrides > 0 ? (
                          <Badge variant="outline">{row.active_overrides}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            setTarget(row);
                            setReason("");
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Grant +1 Attempt
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent overrides</CardTitle>
          <p className="text-sm text-muted-foreground">
            All overrides granted on this exam, newest first. An override is consumed the next time
            the student starts a new attempt.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : overrides.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No overrides have been granted on this exam yet.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Granted At</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{row.student_name ?? "Unknown"}</span>
                          {row.admission_no && (
                            <span className="text-xs text-muted-foreground">
                              {row.admission_no}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.granted_at
                          ? format(new Date(row.granted_at), "MMM d, yyyy h:mm a")
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <span className="block truncate" title={row.reason}>
                          {row.reason}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.consumed_at ? (
                          <Badge variant="secondary">Consumed</Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-500 text-green-700">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={target !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant +1 attempt</DialogTitle>
            <DialogDescription>
              This adds one extra attempt above the configured maximum. The override is consumed
              the next time the student starts a new attempt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Student</p>
              <p className="font-medium">{target?.student_name}</p>
              {target?.admission_no && (
                <p className="text-xs text-muted-foreground">{target.admission_no}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="override-reason" className="text-sm font-medium">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="override-reason"
                placeholder="e.g. Student lost network connection mid-exam"
                value={reason}
                maxLength={REASON_MAX}
                rows={4}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    reasonLength > 0 && !reasonValid ? "text-destructive" : "text-muted-foreground"
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
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!reasonValid || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Granting…
                </>
              ) : (
                "Grant +1 Attempt"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk grant dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => !open && closeBulkDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant +1 attempt to everyone</DialogTitle>
            <DialogDescription>
              This adds one extra attempt above the configured maximum for every assigned
              student. Each override is consumed independently the next time the student
              starts a new attempt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Affected students
              </p>
              <p className="font-medium">
                {stats.length} student{stats.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="bulk-override-reason" className="text-sm font-medium">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="bulk-override-reason"
                placeholder="e.g. Network outage during the exam window"
                value={bulkReason}
                maxLength={REASON_MAX}
                rows={4}
                onChange={(e) => setBulkReason(e.target.value)}
                disabled={isBulkSubmitting}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    bulkReasonLength > 0 && !bulkReasonValid
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {bulkReasonLength === 0
                    ? "Required — applies to every student"
                    : !bulkReasonValid
                      ? `Must be ${REASON_MIN}–${REASON_MAX} characters`
                      : "Looks good"}
                </span>
                <span className="text-muted-foreground">
                  {bulkReasonLength}/{REASON_MAX}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeBulkDialog} disabled={isBulkSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkSubmit}
              disabled={!bulkReasonValid || isBulkSubmitting || stats.length === 0}
            >
              {isBulkSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Granting…
                </>
              ) : (
                `Grant +1 to all (${stats.length})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
