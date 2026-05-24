import React, { useEffect, useState } from "react";
import { Plus, MoreVertical, Edit, Trash, Users, Eye, Send } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { listExams, deleteExam, updateExam } from "../../services/exam.service";
import type { Exam } from "../../types";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export function ExamList() {
  const { institute } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchExams = async () => {
    if (!institute?.id) return;
    setIsLoading(true);
    const { data, success } = await listExams(institute.id);
    if (success && data) {
      setExams(data.items);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExams();
  }, [institute?.id]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    const { success } = await deleteExam(id);
    if (success) {
      toast.success("Exam deleted successfully");
      fetchExams();
    } else {
      toast.error("Failed to delete exam");
    }
  };

  const handlePublish = async (exam: Exam) => {
    const { success } = await updateExam(exam.id, { status: "published" });
    if (success) {
      toast.success("Exam published successfully");
      fetchExams();
    } else {
      toast.error("Failed to publish exam");
    }
  };

  const columns: DataTableColumn<Exam>[] = [
    {
      key: "title",
      header: "Test Title",
      render: (exam) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{exam.title}</span>
          <span className="text-xs text-muted-foreground line-clamp-1">{exam.description || "No description"}</span>
        </div>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (exam) => <span>{exam.duration_mins} mins</span>,
    },
    {
      key: "marks",
      header: "Total Marks",
      render: (exam) => <span>{exam.total_marks}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (exam) => <ExamStatusBadge status={exam.status} />,
    },
    {
      key: "stats",
      header: "Stats",
      render: (exam: any) => (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span title="Assignments" className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {exam.assignments_count || 0}
          </span>
          <span title="Attempts" className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {exam.attempts_count || 0}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-10",
      render: (exam) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate({ to: `/dashboard/admin/exams/${exam.id}` })}>
              <Edit className="mr-2 h-4 w-4" /> Manage
            </DropdownMenuItem>
            {exam.status === "draft" && (
              <DropdownMenuItem onClick={() => handlePublish(exam)}>
                <Send className="mr-2 h-4 w-4" /> Publish
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(exam.id)}>
              <Trash className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="MCQ Test Management"
        subtitle="Create and manage online assessments for students"
        actions={
          <Button onClick={() => navigate({ to: "/dashboard/admin/exams/create" })}>
            <Plus className="mr-2 h-4 w-4" /> Create Test
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={exams}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No tests found"
            description="Start by creating your first MCQ test."
            action={
              <Button variant="outline" onClick={() => navigate({ to: "/dashboard/admin/exams/create" })}>
                <Plus className="mr-2 h-4 w-4" /> Create Test
              </Button>
            }
          />
        }
      />
    </div>
  );
}
