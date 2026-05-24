import { useState } from "react";
import { 
  FileText, 
  Calendar, 
  Award, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter,
  ArrowRight,
  ChevronRight,
  FileIcon,
  Download,
  Upload,
  Loader2,
  Trash2
} from "lucide-react";
import { format, isAfter } from "date-fns";
import { 
  useStudentAssignments, 
  useStudentAssignmentDetail,
  useSubmitAssignment 
} from "@/modules/assignments/hooks/useAssignments";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadAssignmentFile } from "@/modules/assignments/services/assignment.service";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import type { Assignment, AssignmentSubmission, AssignmentResourceSchema } from "@/types";

export function StudentAssignmentDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const { data, isLoading } = useStudentAssignments();
  const { user } = useAuthStore();

  const assignments = data?.data ?? [];
  
  const filteredAssignments = assignments.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === "all") return true;
    if (activeTab === "pending") return !a.submission || a.submission.status === 'pending';
    if (activeTab === "submitted") return a.submission && (a.submission.status === 'submitted' || a.submission.status === 'late');
    if (activeTab === "graded") return a.submission && (a.submission.status === 'graded' || a.submission.status === 'reviewed');
    
    return true;
  });

  const pendingAssignments = assignments.filter(a => !a.submission || a.submission.status === 'pending');
  const submittedAssignments = assignments.filter(a => a.submission && (a.submission.status === 'submitted' || a.submission.status === 'late'));
  const gradedAssignments = assignments.filter(a => a.submission && (a.submission.status === 'graded' || a.submission.status === 'reviewed'));

  if (selectedAssignmentId) {
    return (
      <AssignmentDetailView 
        assignmentId={selectedAssignmentId} 
        onBack={() => setSelectedAssignmentId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My Assignments</h1>
        <p className="text-muted-foreground text-sm">View and manage your standalone assignments.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard 
          title="Pending" 
          value={pendingAssignments.length} 
          icon={Clock} 
          color="text-orange-500" 
          bgColor="bg-orange-500/10" 
        />
        <StatsCard 
          title="Submitted" 
          value={submittedAssignments.length} 
          icon={CheckCircle2} 
          color="text-blue-500" 
          bgColor="bg-blue-500/10" 
        />
        <StatsCard 
          title="Graded" 
          value={gradedAssignments.length} 
          icon={Award} 
          color="text-green-500" 
          bgColor="bg-green-500/10" 
        />
      </div>

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-4 sm:w-[400px]">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="submitted">Done</TabsTrigger>
            <TabsTrigger value="graded">Graded</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-[200px] bg-muted/20" />
          ))}
        </div>
      ) : filteredAssignments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssignments.map((assignment) => (
            <StudentAssignmentCard 
              key={assignment.id} 
              assignment={assignment} 
              onClick={() => setSelectedAssignmentId(assignment.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText />}
          title="No assignments found"
          description="You don't have any assignments assigned to you yet."
        />
      )}
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, color, bgColor }: any) {
  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${bgColor} ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold">{value}</h3>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentAssignmentCard({ assignment, onClick }: { assignment: any; onClick: () => void }) {
  const submission = assignment.submission;
  const isOverdue = assignment.due_date && isAfter(new Date(), new Date(assignment.due_date)) && !submission;
  
  const getStatusBadge = () => {
    if (submission?.status === 'graded') return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-none">Graded</Badge>;
    if (submission?.status === 'submitted') return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-none">Submitted</Badge>;
    if (submission?.status === 'late') return <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-none">Late Submission</Badge>;
    if (isOverdue) return <Badge variant="destructive" className="border-none">Overdue</Badge>;
    return <Badge variant="secondary" className="border-none">Pending</Badge>;
  };

  return (
    <Card 
      className="group hover:shadow-md transition-all duration-300 border-border/50 cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-2">
          {getStatusBadge()}
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {assignment.total_marks} Marks
          </span>
        </div>
        <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">
          {assignment.title}
        </CardTitle>
        <CardDescription className="line-clamp-2 text-xs min-h-[32px]">
          {assignment.description || "No description provided."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Due {assignment.due_date ? format(new Date(assignment.due_date), "MMM d, h:mm a") : "No due date"}</span>
            </div>
          </div>
          
          <div className="pt-3 border-t flex items-center justify-between">
            {submission?.grade !== null && submission?.grade !== undefined ? (
              <div className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-green-500" />
                <span className="text-sm font-bold text-green-600">
                  {submission.grade} / {assignment.total_marks}
                </span>
              </div>
            ) : (
              <div className="text-xs font-medium text-muted-foreground italic">
                {submission ? "Awaiting Grade" : "Not Submitted"}
              </div>
            )}
            <div className="flex items-center gap-1 text-primary font-bold text-xs">
              View Details <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentDetailView({ assignmentId, onBack }: { assignmentId: string; onBack: () => void }) {
  const { data, isLoading } = useStudentAssignmentDetail(assignmentId);
  const submitMutation = useSubmitAssignment();
  const { user } = useAuthStore();
  const [submissionFiles, setSubmissionFiles] = useState<AssignmentResourceSchema[]>([]);
  const [uploading, setUploading] = useState(false);

  if (isLoading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  const assignment = data?.data;
  if (!assignment) return <div>Assignment not found</div>;

  const submission = assignment.submission;
  const isOverdue = assignment.due_date && isAfter(new Date(), new Date(assignment.due_date));
  const canSubmit = !submission || (assignment.allow_late && submission.status === 'pending');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user?.institute_id) return;

    setUploading(true);
    const newFiles = [...submissionFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await uploadAssignmentFile(user.institute_id, "assignment-submissions", file, `submissions/${assignmentId}`);
      if (res.success && res.data) {
        newFiles.push({
          file_name: file.name,
          file_url: res.data.url,
          storage_path: res.data.path,
          file_type: file.type,
          file_size: file.size,
        });
      } else {
        toast.error(`Failed to upload ${file.name}: ${res.error}`);
      }
    }

    setSubmissionFiles(newFiles);
    setUploading(false);
  };

  const handleFinalSubmit = async () => {
    if (submissionFiles.length === 0) {
      toast.error("Please upload at least one file");
      return;
    }

    try {
      const res = await submitMutation.mutateAsync({
        assignmentId,
        files: submissionFiles
      });

      if (res.success) {
        toast.success("Assignment submitted successfully!");
      } else {
        toast.error(res.error || "Failed to submit assignment");
      }
    } catch (err) {
      toast.error("An error occurred during submission");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <Button variant="ghost" onClick={onBack} className="mb-2 -ml-2 group">
        <ArrowRight className="h-4 w-4 mr-2 rotate-180 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-2xl">{assignment.title}</CardTitle>
                  <CardDescription className="text-sm">
                    Posted on {format(new Date(assignment.created_at), "MMM d, yyyy")}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">{assignment.total_marks}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Marks</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Instructions</h3>
                <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
                  {assignment.instructions || assignment.description || "No instructions provided."}
                </div>
              </div>

              {assignment.resources && assignment.resources.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Reference Materials</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {assignment.resources.map((res: any) => (
                      <a 
                        key={res.id} 
                        href={res.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 border border-border/50 rounded-xl hover:bg-muted/50 hover:border-primary/30 transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                            <FileIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{res.file_name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{Math.round((res.file_size || 0) / 1024)} KB</p>
                          </div>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {submission && (
            <Card className="border-border/50 shadow-sm overflow-hidden border-l-4 border-l-green-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Your Submission
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {submission.files?.map((file: any) => (
                    <div key={file.id} className="flex items-center gap-3 p-3 border border-border/50 rounded-xl bg-muted/20">
                      <FileIcon className="h-4 w-4 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                        <p className="text-[10px] text-muted-foreground italic">Submitted {format(new Date(submission.submitted_at), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {submission.feedback && (
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      Instructor Feedback
                    </h4>
                    <p className="text-sm italic text-foreground/80 leading-relaxed">"{submission.feedback}"</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Status & Deadlines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Due Date</p>
                <p className={`text-sm font-bold ${isOverdue && !submission ? 'text-destructive' : 'text-foreground'}`}>
                  {assignment.due_date ? format(new Date(assignment.due_date), "EEEE, MMM d, yyyy") : "No due date"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {assignment.due_date ? format(new Date(assignment.due_date), "h:mm a") : ""}
                </p>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-xs text-muted-foreground font-medium">Submission Status</p>
                <div className="flex items-center gap-2">
                  {submission ? (
                    <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-none">Submitted</Badge>
                  ) : isOverdue ? (
                    <Badge variant="destructive" className="border-none">Overdue</Badge>
                  ) : (
                    <Badge variant="secondary" className="border-none">Pending</Badge>
                  )}
                  {submission?.is_late && <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50">Late</Badge>}
                </div>
              </div>

              {submission?.grade !== null && submission?.grade !== undefined && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs text-muted-foreground font-medium">Grade</p>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-green-600">{submission.grade}</span>
                    <span className="text-sm font-medium text-muted-foreground mb-1">/ {assignment.total_marks}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {canSubmit && (
            <Card className="border-primary/20 shadow-lg border-t-4 border-t-primary">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Submit Work</CardTitle>
                <CardDescription className="text-xs">Upload your final files for grading.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {submissionFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 border rounded-lg bg-muted/30 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate font-medium">{file.file_name}</span>
                      </div>
                      <button onClick={() => setSubmissionFiles(f => f.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <label className={`
                    flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all
                    ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:bg-primary/5'}
                  `}>
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Upload className="h-6 w-6 mb-2 text-muted-foreground" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Files</span>
                      </>
                    )}
                    <input type="file" className="hidden" multiple onChange={handleFileUpload} disabled={uploading} />
                  </label>
                </div>

                <Button 
                  className="w-full font-bold shadow-md shadow-primary/20 py-6" 
                  disabled={submissionFiles.length === 0 || submitMutation.isPending}
                  onClick={handleFinalSubmit}
                >
                  {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Assignment
                </Button>
                {isOverdue && (
                  <p className="text-[10px] text-center text-orange-600 font-medium">
                    This assignment is past the due date. Submission will be marked as late.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
