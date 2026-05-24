import React, { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { listAttempts } from "../../services/exam.service";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";

interface AttemptListProps {
  examId: string;
}

export function AttemptList({ examId }: AttemptListProps) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const { data, success } = await listAttempts(examId);
      if (success && data) setAttempts(data);
      setIsLoading(false);
    };
    fetch();
  }, [examId]);

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
      render: (attempt) => (
        <span className={cn("font-medium", attempt.violation_count > 0 ? "text-destructive" : "text-muted-foreground")}>
          {attempt.status === "not_started" ? "—" : attempt.violation_count}
        </span>
      ),
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
  );
}
