import React, { useEffect, useState, useMemo } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { listAttempts, getViolationLog } from "../../services/exam.service";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";
import { ViolationLog } from "./ViolationLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, AlertTriangle, RotateCcw, Camera, ArrowUpDown, CheckCircle2, Search, Trophy, Award } from "lucide-react";
import { ProctoringCapturesGallery } from "./ProctoringCapturesGallery";
import type { ExamViolation } from "../../types";
import { grantReattempt, revokeReattempt } from "../../services/exam.service";
import { toast } from "sonner";

type SortOption = "default" | "score_desc" | "score_asc" | "percentage_desc" | "percentage_asc" | "name_asc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "default", label: "Default Order" },
  { value: "score_desc", label: "Score: High to Low" },
  { value: "score_asc", label: "Score: Low to High" },
  { value: "percentage_desc", label: "Percentage: High to Low" },
  { value: "percentage_asc", label: "Percentage: Low to High" },
  { value: "name_asc", label: "Name: A to Z" },
];

interface AttemptListProps {
  examId: string;
}

export function AttemptList({ examId }: AttemptListProps) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [violations, setViolations] = useState<ExamViolation[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const [reattemptLoadingId, setReattemptLoadingId] = useState<string | null>(null);
  const [capturesAttemptId, setCapturesAttemptId] = useState<string | null>(null);
  const [capturesStudentName, setCapturesStudentName] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      const { data, success } = await listAttempts(examId);
      if (success && data) setAttempts(data);
      setIsLoading(false);
    };
    fetch();
  }, [examId]);

  // Compute sorted and filtered attempts with rank
  const processedAttempts = useMemo(() => {
    // Filter by search term
    let filtered = attempts;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = attempts.filter(
        (a) =>
          a.student?.user?.name?.toLowerCase().includes(term) ||
          a.student?.admission_no?.toLowerCase().includes(term),
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "score_desc":
          return (b.score ?? 0) - (a.score ?? 0);
        case "score_asc":
          return (a.score ?? 0) - (b.score ?? 0);
        case "percentage_desc":
          return (b.percentage ?? 0) - (a.percentage ?? 0);
        case "percentage_asc":
          return (a.percentage ?? 0) - (b.percentage ?? 0);
        case "name_asc":
          return (a.student?.user?.name || "").localeCompare(b.student?.user?.name || "");
        default:
          // Keep original order from API
          return 0;
      }
    });

    // Assign rank based on score (only for submitted/graded attempts)
    // Sort by score desc to compute rank, then restore the user's chosen sort
    const scoreSorted = [...filtered]
      .filter((a) => a.status !== "not_started" && a.status !== "in_progress")
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const rankMap = new Map<string, number>();
    scoreSorted.forEach((attempt, index) => {
      rankMap.set(attempt.id, index + 1);
    });

    return sorted.map((attempt) => ({
      ...attempt,
      rank: rankMap.get(attempt.id) ?? null,
    }));
  }, [attempts, sortBy, searchTerm]);

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

  const handleReattempt = async (attemptId: string, currentlyGranted: boolean) => {
    setReattemptLoadingId(attemptId);
    try {
      const { success, error } = currentlyGranted
        ? await revokeReattempt(attemptId)
        : await grantReattempt(attemptId);
      if (success) {
        toast.success(
          currentlyGranted
            ? "Reattempt revoked"
            : "Reattempt granted — student can now retake the test",
        );
        // Refresh the attempts list
        const { data, success: ok } = await listAttempts(examId);
        if (ok && data) setAttempts(data);
      } else {
        toast.error(error || "Failed to update reattempt status");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setReattemptLoadingId(null);
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (attempt: any) => {
        if (attempt.status === "not_started" || attempt.status === "in_progress" || attempt.rank === null) {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const rankColors: Record<number, string> = {
          1: "bg-yellow-100 text-yellow-700 border-yellow-300",
          2: "bg-gray-100 text-gray-600 border-gray-300",
          3: "bg-orange-100 text-orange-700 border-orange-300",
        };
        const colorClass = rankColors[attempt.rank] || "bg-muted text-muted-foreground border-border";
        return (
          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold ${colorClass}`}>
            {attempt.rank === 1 ? <Trophy className="h-3.5 w-3.5" /> : attempt.rank}
          </div>
        );
      },
    },
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
          {attempt.status === "not_started"
            ? "—"
            : `${attempt.score} / ${attempt.exam?.total_marks || "—"}`}
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
    {
      key: "reattempt",
      header: "Reattempt",
      render: (attempt) => {
        const isTerminal = ["submitted", "auto_submitted", "graded", "expired"].includes(
          attempt.status,
        );
        if (!isTerminal) return <span className="text-muted-foreground">—</span>;
        const granted = !!attempt.reattempt_granted;
        return (
          <Button
            size="sm"
            variant={granted ? "destructive" : "outline"}
            disabled={reattemptLoadingId === attempt.id}
            onClick={() => handleReattempt(attempt.id, granted)}
            className="gap-1 text-xs h-7"
          >
            <RotateCcw className="h-3 w-3" />
            {reattemptLoadingId === attempt.id ? "..." : granted ? "Revoke" : "Grant Reattempt"}
          </Button>
        );
      },
    },
    {
      key: "captures",
      header: "Captures",
      render: (attempt: any) => {
        const isTerminal = ["submitted", "auto_submitted", "graded"].includes(attempt.status);
        if (!isTerminal) return <span className="text-muted-foreground text-xs">—</span>;
        const isOpen = capturesAttemptId === attempt.id;
        return (
          <Button
            size="sm"
            variant={isOpen ? "default" : "ghost"}
            className="h-7 gap-1 text-xs"
            onClick={() => {
              if (isOpen) {
                setCapturesAttemptId(null);
                setCapturesStudentName("");
              } else {
                setCapturesAttemptId(attempt.id);
                setCapturesStudentName(attempt.student?.user?.name ?? "");
              }
            }}
          >
            <Camera className="h-3.5 w-3.5" />
            {isOpen ? "Hide" : "Captures"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-card p-4 rounded-xl border border-border/50 shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            className="pl-9 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-10 w-full sm:w-[220px] rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer appearance-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {processedAttempts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card p-3 rounded-lg border border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{processedAttempts.length}</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Total</p>
            </div>
          </div>
          <div className="bg-card p-3 rounded-lg border border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {processedAttempts.filter((a) => a.status === "submitted" || a.status === "graded" || a.status === "auto_submitted").length}
              </p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Submitted</p>
            </div>
          </div>
          <div className="bg-card p-3 rounded-lg border border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Trophy className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {processedAttempts.length > 0
                  ? Math.max(...processedAttempts.filter((a) => a.score !== undefined).map((a) => a.score ?? 0), 0)
                  : 0}
              </p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Top Score</p>
            </div>
          </div>
          <div className="bg-card p-3 rounded-lg border border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Award className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {processedAttempts.length > 0
                  ? Math.round(
                      processedAttempts
                        .filter((a) => a.status !== "not_started" && a.status !== "in_progress")
                        .reduce((sum, a) => sum + (a.percentage ?? 0), 0) /
                        Math.max(processedAttempts.filter((a) => a.status !== "not_started" && a.status !== "in_progress").length, 1),
                    )
                  : 0}
                %
              </p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Avg %</p>
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={processedAttempts}
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
      {capturesAttemptId && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Camera className="h-4 w-4 text-muted-foreground" />
              Proctoring Captures
              {capturesStudentName && (
                <span className="text-muted-foreground font-normal">— {capturesStudentName}</span>
              )}
            </h4>
            <button
              type="button"
              onClick={() => {
                setCapturesAttemptId(null);
                setCapturesStudentName("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <ProctoringCapturesGallery
            attemptId={capturesAttemptId}
            studentName={capturesStudentName}
          />
        </div>
      )}

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
