import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getAvailableBatchesForStudent, createBatchJoinRequest } from "@/services/batchRequest.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BookOpen, Users, Clock, CheckCircle2, Loader2 } from "lucide-react";
import type { AvailableBatch } from "@/types";

export const Route = createFileRoute("/dashboard/student/batches")({
  head: () => ({ meta: [{ title: "Browse Batches — EliteClass" }] }),
  component: BrowseBatchesPage,
});

function BrowseBatchesPage() {
  const { user } = useAuthStore();
  const [batches, setBatches] = useState<AvailableBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingBatchId, setRequestingBatchId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.institute_id || !supabase) {
      setIsLoading(false);
      return;
    }

    async function loadBatches() {
      setIsLoading(true);
      setError(null);

      try {
        // Get student ID first
        const { data: student } = await supabase!
          .from("students")
          .select("id")
          .eq("user_id", user!.id)
          .single();

        if (!student) {
          setError("Student record not found.");
          setIsLoading(false);
          return;
        }

        setStudentId(student.id);

        const result = await getAvailableBatchesForStudent(user!.institute_id, student.id);
        if (result.success && result.data) {
          setBatches(result.data);
        } else {
          setError(result.error ?? "Failed to load batches.");
        }
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    loadBatches();
  }, [user]);

  async function handleRequestJoin(batchId: string) {
    if (!studentId || !user?.institute_id) return;

    setRequestingBatchId(batchId);
    try {
      const result = await createBatchJoinRequest({
        student_id: studentId,
        batch_id: batchId,
        institute_id: user.institute_id,
      });

      if (result.success) {
        toast.success("Join request submitted successfully!");
        // Update local state
        setBatches((prev) =>
          prev.map((b) =>
            b.id === batchId ? { ...b, has_pending_request: true } : b,
          ),
        );
      } else {
        toast.error(result.error ?? "Failed to submit request.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setRequestingBatchId(null);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Browse Batches</h1>
          <p className="text-muted-foreground mt-1">
            Find and request to join available batches at your institute.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {error}
            </CardContent>
          </Card>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No batches available at this time.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => (
              <Card key={batch.id} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-tight">
                      {batch.name}
                    </CardTitle>
                    {batch.is_already_member && (
                      <Badge variant="secondary" className="shrink-0">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Joined
                      </Badge>
                    )}
                    {batch.has_pending_request && !batch.is_already_member && (
                      <Badge variant="outline" className="shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-300">
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                    )}
                    {batch.is_full && !batch.is_already_member && !batch.has_pending_request && (
                      <Badge variant="destructive" className="shrink-0">Full</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {batch.academic_year}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {batch.student_count} students
                    </span>
                  </div>
                  {batch.course_name && (
                    <p className="text-xs text-muted-foreground">
                      Course: {batch.course_name}
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={
                      batch.is_already_member ||
                      batch.has_pending_request ||
                      batch.is_full ||
                      requestingBatchId === batch.id
                    }
                    onClick={() => handleRequestJoin(batch.id)}
                  >
                    {requestingBatchId === batch.id ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Requesting...
                      </>
                    ) : batch.is_already_member ? (
                      "Already a Member"
                    ) : batch.has_pending_request ? (
                      "Request Pending"
                    ) : batch.is_full ? (
                      "Batch Full"
                    ) : (
                      "Request to Join"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
