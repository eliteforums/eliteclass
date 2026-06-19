import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History, AlertCircle, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  listStudentAttemptHistory,
  getRemainingAttempts,
  type StudentAttemptHistory,
} from "../../services/exam.service";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";

interface AttemptHistoryCardProps {
  examId: string;
  userId: string;
  /** Optional fallback when the exam record does not yet expose `total_marks`. */
  totalMarksFallback?: number;
  className?: string;
}

const fmtDate = (value: string | null) =>
  value ? format(new Date(value), "MMM d, yyyy h:mm a") : "—";

/**
 * Renders a student's attempt history for one exam, including:
 *   - attempts taken / configured max (or "Unlimited")
 *   - remaining attempts (omitted when unlimited)
 *   - best score and latest score against `total_marks`
 *   - a small table of past attempts (number, started/submitted, score, status)
 *
 * Surfaces an inline warning when the student has reached the effective limit.
 */
export function AttemptHistoryCard({
  examId,
  userId,
  totalMarksFallback,
  className,
}: AttemptHistoryCardProps) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    history: StudentAttemptHistory | null;
  }>({ loading: true, error: null, history: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, history: null });

    listStudentAttemptHistory(examId, userId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setState({ loading: false, error: null, history: res.data });
      } else {
        setState({
          loading: false,
          error: res.error ?? "Failed to load attempt history.",
          history: null,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [examId, userId]);

  if (state.loading) {
    return (
      <Card className={cn("border-border/50", className)}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading attempt history…
        </CardContent>
      </Card>
    );
  }

  if (state.error || !state.history) {
    return (
      <Card className={cn("border-border/50", className)}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {state.error ?? "Failed to load attempt history."}
        </CardContent>
      </Card>
    );
  }

  const { attempts, maxAttempts, totalMarks, activeOverrides, bestScore, latestScore } =
    state.history;
  const taken = attempts.length;
  const totalMarksDisplay = totalMarks > 0 ? totalMarks : (totalMarksFallback ?? 0);
  const { remaining, isUnlimited } = getRemainingAttempts(maxAttempts, taken, activeOverrides);
  const limitReached = !isUnlimited && remaining === 0;

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Attempt history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Attempts"
            value={`${taken} of ${isUnlimited ? "Unlimited" : maxAttempts}`}
          />
          {!isUnlimited && (
            <Stat
              label="Remaining"
              value={String(remaining)}
              tone={limitReached ? "danger" : "default"}
            />
          )}
          {activeOverrides > 0 && <Stat label="Bonus attempts" value={`+${activeOverrides}`} />}
          <Stat
            label="Best score"
            value={
              bestScore === null
                ? "No attempts yet"
                : `${bestScore}${totalMarksDisplay ? `/${totalMarksDisplay}` : ""}`
            }
          />
          {latestScore !== null && (
            <Stat
              label="Latest score"
              value={`${latestScore}${totalMarksDisplay ? `/${totalMarksDisplay}` : ""}`}
            />
          )}
        </div>

        {limitReached && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You've reached the maximum attempts ({taken} of {maxAttempts}). Contact your
              instructor if you need an additional attempt.
            </span>
          </div>
        )}

        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attempts yet</p>
        ) : (
          <div className="rounded-md border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...attempts]
                  .reverse()
                  .map((attempt, idx) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell className="text-sm">{fmtDate(attempt.started_at)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(attempt.submitted_at)}</TableCell>
                      <TableCell className="text-sm">
                        {attempt.submitted_at
                          ? `${attempt.score}${
                              totalMarksDisplay ? `/${totalMarksDisplay}` : ""
                            }`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <ExamStatusBadge status={attempt.status} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: "default" | "danger";
}

function Stat({ label, value, tone = "default" }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Badge
        variant="outline"
        className={cn(
          "w-fit text-sm font-semibold",
          tone === "danger" && "border-destructive/40 text-destructive",
        )}
      >
        {value}
      </Badge>
    </div>
  );
}
