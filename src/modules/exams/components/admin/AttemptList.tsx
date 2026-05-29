import React, { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { listAttempts, getViolationLog } from "../../services/exam.service";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";
import { ViolationLog } from "./ViolationLog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, AlertTriangle } from "lucide-react";
import type { ExamViolation } from "../../types";

interface AttemptListProps {
  examId: string;
}

export function AttemptList({ examId }: AttemptListProps) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [violations, setViolations] = useState<ExamViolation[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const { data, success } = await listAttempts(examId);
      if (success && data) setAttempts(data);
      setIsLoading(false);
    };
    fetch();
  }, [examId]);

  const handleToggleViolations = async (attemptId: string) => {
    if (expandedAttemptId === attemptId) {
      setExpandedAttemptId(null);
      setViolations([]);
      return;
    }
    setExpandedAttemptId(attemptId);
    setViolationsLoading(true);
    const { data, success } = await getViolationLog(attemptId);
    if (success && data) {
      setViolations(data);
    } else {
      setViolations([]);
    }
    setViolationsLoading(false);
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "student",
      header: "Student",
      render: (attempt: any) => (
        <div className="flex flex-col">
          <span className="font-medium">{attempt.student?.user?.name || "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{attempt.student?.admission_no}</span>
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      render: (attempt) => (
        <div className="font-bold">
          {attempt.status === "not_started" ? "—" : `${attempt.score} / ${attempt.exam?.total_marks || "—"}`}
        </div>
      ),
    },
    {
      key: "percentage",
      header: "Percentage",
      render: (attempt) => (
        <span className="text-muted-foreground">
          {attempt.status === "not_started" ? "—" : `${attempt.percentage}%`}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (attempt) => <ExamStatusBadge status={attempt.status} />,
    },
    {
      key: "violations",
      header: "Violations",
      render: (attempt) => {
        if (attempt.status === "not_started") {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <button
            type="button"
            onClick={() => handleToggleViolations(attempt.id)}
            className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80"
          >
            {attempt.violation_count > 0 ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {attempt.violation_count}
              </Badge>
            ) : (
              <Badge variant="secondary">0</Badge>
            )}
          </button>
        );
      },
    },
    {
      key: "last_violation_at",
      header: "Last Violation",
      render: (attempt) => {
        const date = attempt.last_violation_at;
        return (
          <span className="text-muted-foreground">
            {date ? format(new Date(date), "MMM d, h:mm a") : "—"}
          </span>
        );
      },
    },
    {
      key: "auto_submit_reason",
      header: "Auto Submit Reason",
      render: (attempt) => (
        <span className="text-muted-foreground max-w-[220px] truncate block">
          {attempt.auto_submit_reason || "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (attempt) => {
        const date = attempt.submitted_at || attempt.started_at;
        return (
          <span className="text-muted-foreground">
            {date ? format(new Date(date), "MMM d, h:mm a") : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={attempts}
        isLoading={isLoading}
        keyExtractor={(a) => a.id}
        emptyState={
          <EmptyState
            icon={<Users />}
            title="No students assigned"
            description="Assign students to this test to see their results here."
          />
        }
      />
      {expandedAttemptId && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium">Violation Log</h4>
            <button
              type="button"
              onClick={() => setExpandedAttemptId(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {violationsLoading ? (
            <p className="text-sm text-muted-foreground">Loading violations...</p>
          ) : (
            <ViolationLog violations={violations} />
          )}
        </div>
      )}
    </div>
  );
}
