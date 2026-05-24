import { 
  FileText, 
  Search, 
  Filter, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MoreVertical,
  ChevronRight,
  Download,
  User,
  GraduationCap,
  Calendar
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { 
  useSubmissions, 
  useAssignmentDetail 
} from "@/modules/assignments/hooks/useAssignments";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubmissionReviewModal } from "./SubmissionReviewModal";
import type { Assignment, AssignmentSubmission } from "@/types";

interface SubmissionListProps {
  assignmentId: string;
  onBack: () => void;
}

export function SubmissionList({ assignmentId, onBack }: SubmissionListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<AssignmentSubmission | null>(null);
  
  const { data: assignmentData, isLoading: isLoadingAssignment } = useAssignmentDetail(assignmentId);
  const { data: submissionsData, isLoading: isLoadingSubmissions } = useSubmissions(assignmentId);

  const assignment = assignmentData?.data;
  const submissions = submissionsData?.data ?? [];

  const filteredSubmissions = submissions.filter((s) =>
    s.student?.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.student?.admission_no?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoadingAssignment || isLoadingSubmissions) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!assignment) return <div>Assignment not found</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" onClick={onBack} className="mb-2 -ml-2 group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Assignments
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">{assignment.title}</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Due {assignment.due_date ? format(new Date(assignment.due_date), "MMM d, yyyy") : "No due date"}
            </div>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              {submissions.length} Submissions
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard 
          label="Total Assigned" 
          value={assignment.assignees_count ?? 0} 
          icon={User} 
          className="bg-primary/5 text-primary border-primary/10"
        />
        <StatsCard 
          label="Submitted" 
          value={submissions.length} 
          icon={CheckCircle2} 
          className="bg-green-500/5 text-green-600 border-green-500/10"
        />
        <StatsCard 
          label="Pending" 
          value={(assignment.assignees_count ?? 0) - submissions.length} 
          icon={Clock} 
          className="bg-orange-500/5 text-orange-600 border-orange-500/10"
        />
        <StatsCard 
          label="Graded" 
          value={submissions.filter(s => s.status === 'graded').length} 
          icon={FileText} 
          className="bg-blue-500/5 text-blue-600 border-blue-500/10"
        />
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-0 border-b border-border/50 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
            <CardTitle className="text-lg">Submissions</CardTitle>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search students..."
                className="pl-9 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSubmissions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Student</TableHead>
                    <TableHead className="font-bold text-center">Submitted At</TableHead>
                    <TableHead className="font-bold text-center">Status</TableHead>
                    <TableHead className="font-bold text-center">Score</TableHead>
                    <TableHead className="text-right font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((submission) => (
                    <TableRow key={submission.id} className="hover:bg-muted/10 group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {submission.student?.user?.name?.[0] || <User className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{submission.student?.user?.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{submission.student?.admission_no}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {format(new Date(submission.submitted_at), "MMM d, yyyy")}
                        <p className="text-[10px] text-muted-foreground">{format(new Date(submission.submitted_at), "h:mm a")}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline" 
                          className={`
                            text-[10px] font-bold uppercase tracking-wider
                            ${submission.status === 'graded' ? 'bg-green-50 text-green-600 border-green-200' : 
                              submission.is_late ? 'bg-destructive/5 text-destructive border-destructive/20' : 
                              'bg-blue-50 text-blue-600 border-blue-200'}
                          `}
                        >
                          {submission.status} {submission.is_late && "(LATE)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {submission.grade !== null ? (
                          <span className="font-bold text-sm">{submission.grade} / {assignment.total_marks}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Ungraded</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 font-bold text-xs border-primary/20 hover:bg-primary/5 hover:text-primary hover:border-primary/50"
                          onClick={() => setSelectedSubmission(submission)}
                        >
                          Review & Grade
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-20">
              <EmptyState
                icon={<FileText />}
                title="No submissions found"
                description={searchTerm ? "Try adjusting your search filters." : "No students have submitted this assignment yet."}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSubmission && (
        <SubmissionReviewModal
          isOpen={!!selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          submission={selectedSubmission}
          assignment={assignment}
        />
      )}
    </div>
  );
}

function StatsCard({ label, value, icon: Icon, className }: any) {
  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between ${className}`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
        <p className="text-2xl font-black">{value}</p>
      </div>
      <div className="p-2 rounded-lg bg-current/10">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}
