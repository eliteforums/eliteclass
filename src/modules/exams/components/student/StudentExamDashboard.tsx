import React, { useEffect, useState } from "react";
import { Clock, FileText, Calendar, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { listStudentExams } from "../../services/exam.service";
import type { Exam, ExamAttempt } from "../../types";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { format } from "date-fns";
import { ExamStatusBadge } from "../shared/ExamStatusBadge";
import { cn } from "@/lib/utils";

export function StudentExamDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState<(Exam & { attempt?: ExamAttempt | null })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;
    const fetchExams = async () => {
      setIsLoading(true);
      const { data, success } = await listStudentExams(user.id);
      if (success && data) setExams(data);
      setIsLoading(false);
    };
    fetchExams();
  }, [user?.id]);

  const getExamStatus = (exam: Exam, attempt?: ExamAttempt | null) => {
    if (attempt?.status === "submitted" || attempt?.status === "graded" || attempt?.status === "auto_submitted" || attempt?.status === "expired") return "completed";
    if (attempt?.status === "in_progress") return "active";
    
    const now = new Date();
    
    // If start_time is set and is in the future, it's upcoming
    if (exam.start_time) {
      const startTime = new Date(exam.start_time);
      // Use a 5-minute grace period for "now" to handle clock skew
      if (!isNaN(startTime.getTime()) && startTime > new Date(now.getTime() + 5 * 60 * 1000)) {
        return "upcoming";
      }
    }

    // If end_time is set and has passed, it's missed
    if (exam.end_time) {
      const endTime = new Date(exam.end_time);
      if (!isNaN(endTime.getTime()) && endTime < now) {
        return "missed";
      }
    }
    
    // Default to active if published and not restricted by time
    return "active";
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="My MCQ Tests"
        subtitle="View and attempt your assigned online assessments."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.map((item) => {
          const status = getExamStatus(item, item.attempt);
          const isStarted = !!item.attempt;
          
          return (
            <Card key={item.id} className="overflow-hidden border-border/50 hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 bg-muted/20">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={status === "active" ? "default" : status === "completed" ? "secondary" : "outline"}>
                    {status.toUpperCase()}
                  </Badge>
                  {item.attempt && <ExamStatusBadge status={item.attempt.status} size="sm" />}
                </div>
                <CardTitle className="text-lg line-clamp-1">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{item.duration_mins} Minutes</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{item.total_marks} Total Marks</span>
                </div>
                {item.end_time && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Deadline: {format(new Date(item.end_time), "MMM d, h:mm a")}</span>
                  </div>
                )}
                
                {(item.attempt?.status === "submitted" || item.attempt?.status === "graded") && (
                   <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Score</span>
                        <span className="text-sm font-bold text-primary">{item.attempt.score} / {item.total_marks}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-muted-foreground">Result</span>
                        <span className={cn("text-xs font-bold", item.attempt.passed ? "text-green-600" : "text-red-600")}>
                          {item.attempt.passed ? "PASSED" : "FAILED"}
                        </span>
                      </div>
                   </div>
                )}
              </CardContent>
              <CardFooter className="bg-muted/10 border-t border-border/50">
                {status === "active" ? (
                  <Button 
                    className="w-full" 
                    onClick={() => navigate({ to: `/dashboard/student/exams/${item.id}/attempt` })}
                  >
                    {isStarted ? "Resume Test" : "Start Test"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : status === "completed" ? (
                  <Button variant="outline" className="w-full" disabled>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Completed
                  </Button>
                ) : (
                  <Button variant="ghost" className="w-full" disabled>
                    <AlertCircle className="mr-2 h-4 w-4" /> {status === "upcoming" ? "Not Started" : "Missed"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {exams.length === 0 && !isLoading && (
        <div className="bg-card rounded-xl border border-dashed p-20 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No tests assigned</h3>
          <p className="text-sm text-muted-foreground/60">When your teachers assign MCQ tests, they will appear here.</p>
        </div>
      )}
    </div>
  );
}
