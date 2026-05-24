import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  X, 
  CheckCircle2, 
  Download, 
  FileIcon, 
  Loader2, 
  Award, 
  MessageSquare,
  User,
  Clock,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  gradingSchema, 
  type GradingSchema 
} from "@/modules/assignments/validations";
import type { Assignment, AssignmentSubmission } from "@/types";
import { useGradeSubmission } from "@/modules/assignments/hooks/useAssignments";
import { toast } from "sonner";

interface SubmissionReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: AssignmentSubmission;
  assignment: Assignment;
}

export function SubmissionReviewModal({
  isOpen,
  onClose,
  submission,
  assignment,
}: SubmissionReviewModalProps) {
  const gradeMutation = useGradeSubmission();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<GradingSchema>({
    resolver: zodResolver(gradingSchema),
    defaultValues: {
      grade: submission.grade ?? 0,
      feedback: submission.feedback ?? "",
    },
  });

  // Re-initialize form when submission changes (e.g. if the modal stays open but data refreshes)
  useEffect(() => {
    if (submission) {
      form.reset({
        grade: submission.grade ?? 0,
        feedback: submission.feedback ?? "",
      });
    }
  }, [submission, form]);

  const handleGradeSubmit = async (data: GradingSchema) => {
    setIsSubmitting(true);
    try {
      const res = await gradeMutation.mutateAsync({
        submissionId: submission.id,
        grade: data.grade,
        feedback: data.feedback,
      });

      if (res.success) {
        toast.success("Submission graded successfully");
        onClose();
      } else {
        toast.error(res.error || "Failed to grade submission");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start pr-8">
            <div>
              <DialogTitle className="text-xl">Review Submission</DialogTitle>
              <DialogDescription>
                {assignment.title}
              </DialogDescription>
            </div>
            <Badge variant={submission.is_late ? "destructive" : "secondary"}>
              {submission.status.toUpperCase()} {submission.is_late && "(LATE)"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 py-4">
          <div className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {submission.student?.user?.name?.[0] || <User className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-bold text-sm">{submission.student?.user?.name || "Unknown Student"}</p>
                  <p className="text-xs text-muted-foreground">{submission.student?.user?.email}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Submitted On</p>
                  <p className="text-xs font-medium">{format(new Date(submission.submitted_at), "MMM d, yyyy • h:mm a")}</p>
                </div>
              </div>

              {submission.content && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Text Submission</Label>
                  <div className="p-4 rounded-xl border bg-background text-sm leading-relaxed whitespace-pre-wrap">
                    {submission.content}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Submitted Files</Label>
                <div className="grid grid-cols-1 gap-3">
                  {submission.files && submission.files.length > 0 ? (
                    submission.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted/30 transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-primary/5 text-primary">
                            <FileIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{file.file_name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{Math.round((file.file_size || 0) / 1024)} KB</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-full">
                            <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-full">
                            <a href={file.file_url} download={file.file_name}>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground">
                      <p className="text-sm italic">No files attached to this submission</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <form onSubmit={form.handleSubmit(handleGradeSubmit)} className="space-y-6 p-6 rounded-2xl border bg-muted/20 sticky top-0">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <Award className="h-5 w-5" />
                  <h3 className="text-sm uppercase tracking-wider">Grading</h3>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="grade" className="text-xs font-medium">Score (Out of {assignment.total_marks})</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="grade"
                      type="number"
                      step="0.01"
                      className="text-lg font-bold h-12"
                      placeholder="0.00"
                      {...form.register("grade")}
                    />
                    <span className="text-xl font-medium text-muted-foreground">/</span>
                    <div className="flex-1 bg-background h-12 rounded-md border flex items-center px-4 font-bold text-muted-foreground">
                      {assignment.total_marks}
                    </div>
                  </div>
                  {form.formState.errors.grade && (
                    <p className="text-xs text-destructive">{form.formState.errors.grade.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedback" className="text-xs font-medium">Feedback to Student</Label>
                  <Textarea
                    id="feedback"
                    placeholder="Provide constructive feedback..."
                    className="min-h-[150px] resize-none"
                    {...form.register("feedback")}
                  />
                  {form.formState.errors.feedback && (
                    <p className="text-xs text-destructive">{form.formState.errors.feedback.message}</p>
                  )}
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-bold shadow-lg shadow-primary/20" 
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Release Grade
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
