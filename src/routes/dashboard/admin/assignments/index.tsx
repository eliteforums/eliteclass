import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Plus, Search, Filter, MoreVertical, Edit2, UserPlus, FileText, CheckCircle2, Clock, AlertCircle, Calendar, Award, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { 
  useAssignments, 
  useCreateAssignment, 
  useUpdateAssignment, 
  useDeleteAssignment, 
  useAssignToStudents 
} from "@/modules/assignments/hooks/useAssignments";
import { AssignmentFormModal } from "@/modules/assignments/components/admin/AssignmentFormModal";
import CanvasModal from "@/modules/assignments/components/admin/CanvasModal";
import { AssigneeSelector } from "@/modules/assignments/components/admin/AssigneeSelector";
import { SubmissionList } from "@/modules/assignments/components/admin/SubmissionList";
import type { Assignment, AssignmentSchema, AssignmentResourceSchema } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

export const Route = createFileRoute("/dashboard/admin/assignments/")({
  component: AdminAssignmentsPage,
});

function AdminAssignmentsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssigneeSelectorOpen, setIsAssigneeSelectorOpen] = useState(false);
  const [viewingSubmissionsId, setViewingSubmissionsId] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuthStore();
  
  const { data, isLoading } = useAssignments({ status: "all" });
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const assignToStudents = useAssignToStudents();

  const handleCreateOrUpdate = async (data: AssignmentSchema, resources?: AssignmentResourceSchema[]) => {
    try {
      if (selectedAssignment) {
        const res = await updateAssignment.mutateAsync({ 
          id: selectedAssignment.id, 
          payload: data 
        });
        if (res.success) {
          toast.success("Assignment updated successfully");
        } else {
          toast.error(res.error || "Failed to update assignment");
        }
      } else {
        const res = await createAssignment.mutateAsync({ 
          payload: data, 
          resources 
        });
        if (res.success) {
          toast.success("Assignment created successfully");
        } else {
          toast.error(res.error || "Failed to create assignment");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) return;
    try {
      const res = await deleteAssignment.mutateAsync(id);
      if (res.success) {
        toast.success("Assignment deleted successfully");
      } else {
        toast.error(res.error || "Failed to delete assignment");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  const handleAssign = async (studentIds: string[]) => {
    if (!selectedAssignment) return;
    try {
      const res = await assignToStudents.mutateAsync({
        assignmentId: selectedAssignment.id,
        studentIds
      });
      if (res.success) {
        toast.success("Students assigned successfully");
      } else {
        toast.error(res.error || "Failed to assign students");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  };

  const openCreateModal = () => {
    setSelectedAssignment(null);
    setIsModalOpen(true);
  };

  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadCanvas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      const res = await fetch('/api/assignments/upload-pdf', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      toast.success('Canvas uploaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload canvas');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openEditModal = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setIsModalOpen(true);
  };

  const openAssigneeSelector = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setIsAssigneeSelectorOpen(true);
  };

  const openSubmissionsView = (assignmentId: string) => {
    setViewingSubmissionsId(assignmentId);
  };

  const assignments = data?.data?.items ?? [];
  const filteredAssignments = assignments.filter((a) =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (viewingSubmissionsId) {
    return (
      <ProtectedRoute allowedRoles={["admin", "staff"]}>
        <SubmissionList 
          assignmentId={viewingSubmissionsId} 
          onBack={() => setViewingSubmissionsId(null)} 
        />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="space-y-6">
        <PageHeader
          title="Assignments"
          subtitle="Manage standalone assignments and student submissions"
          actions={
            <div className="flex items-center gap-2">
              <Button onClick={openCreateModal}>
                <Plus className="mr-2 h-4 w-4" />
                New Assignment
              </Button>
              <Button variant="outline" onClick={() => setIsCanvasOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Create Canvas
              </Button>
              <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Canvas
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/*" onChange={handleUploadCanvas} />
            </div>
          }
        />

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border/50 shadow-sm">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assignments..."
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-muted/20" />
                <CardContent className="h-24" />
              </Card>
            ))}
          </div>
        ) : filteredAssignments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment) => (
              <AssignmentCard 
                key={assignment.id} 
                assignment={assignment} 
                onEdit={() => openEditModal(assignment)}
                onDelete={() => handleDelete(assignment.id)}
                onAssign={() => openAssigneeSelector(assignment)}
                onViewSubmissions={() => openSubmissionsView(assignment.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText />}
            title="No assignments found"
            description="Create your first standalone assignment to get started."
            action={
              <Button onClick={openCreateModal}>
                <Plus className="mr-2 h-4 w-4" />
                Create Assignment
              </Button>
            }
          />
        )}

        <AssignmentFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreateOrUpdate}
          initialData={selectedAssignment}
          mode={selectedAssignment ? "edit" : "create"}
        />

        <CanvasModal isOpen={isCanvasOpen} onClose={() => setIsCanvasOpen(false)} />

        {selectedAssignment && (
          <AssigneeSelector
            isOpen={isAssigneeSelectorOpen}
            onClose={() => setIsAssigneeSelectorOpen(false)}
            assignmentId={selectedAssignment.id}
            instituteId={user?.institute_id ?? ""}
            onAssign={handleAssign}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}

interface AssignmentCardProps {
  assignment: Assignment;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onViewSubmissions: () => void;
}

function AssignmentCard({ assignment, onEdit, onDelete, onAssign, onViewSubmissions }: AssignmentCardProps) {
  const isDraft = assignment.status === "draft";
  const isPublished = assignment.status === "published";

  return (
    <Card 
      className="group hover:shadow-md transition-all duration-300 border-border/50 overflow-hidden cursor-pointer"
      onClick={onViewSubmissions}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2">
          <Badge
            variant={isDraft ? "secondary" : isPublished ? "default" : "outline"}
            className="capitalize"
          >
            {assignment.status}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssign(); }}>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign Students
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewSubmissions(); }}>
                <FileText className="mr-2 h-4 w-4" />
                View Submissions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle className="text-xl line-clamp-1 group-hover:text-primary transition-colors">
          {assignment.title}
        </CardTitle>
        <CardDescription className="line-clamp-2 min-h-[40px]">
          {assignment.description || "No description provided."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{assignment.due_date ? format(new Date(assignment.due_date), "MMM d") : "No due date"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="h-4 w-4" />
            <span>{assignment.total_marks} Marks</span>
          </div>
        </div>

        <div className="pt-4 border-t flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              <span>{assignment.assignees_count ?? 0} Assigned</span>
            </div>
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{assignment.submissions_count ?? 0} Submissions</span>
            </div>
          </div>
          <Button 
            variant="link" 
            className="h-auto p-0 text-xs font-bold text-primary"
            onClick={(e) => { e.stopPropagation(); onViewSubmissions(); }}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
