import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  getPendingBatchRequests,
  approveBatchJoinRequest,
  rejectBatchJoinRequest,
} from "@/services/batchRequest.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Users, AlertCircle } from "lucide-react";
import type { BatchJoinRequest } from "@/types";

export const Route = createFileRoute("/dashboard/admin/batch-requests")({
  head: () => ({ meta: [{ title: "Batch Join Requests — EliteClass" }] }),
  component: BatchRequestsPage,
});

function BatchRequestsPage() {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<BatchJoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!user?.institute_id || !supabase) {
      setIsLoading(false);
      return;
    }

    async function loadRequests() {
      setIsLoading(true);
      setError(null);

      try {
        let staffBatchIds: string[] | undefined;

        // If staff role, get their assigned batch IDs
        if (user!.role === "staff") {
          const { data: staffRecord } = await supabase!
            .from("staff")
            .select("id")
            .eq("user_id", user!.id)
            .single();

          if (staffRecord) {
            const { data: assignments } = await supabase!
              .from("staff_batch_assignments")
              .select("batch_id")
              .eq("staff_id", staffRecord.id);

            staffBatchIds = (assignments ?? []).map((a) => a.batch_id);
          }
        }

        const result = await getPendingBatchRequests(user!.institute_id, staffBatchIds);
        if (result.success && result.data) {
          setRequests(result.data);
        } else {
          setError(result.error ?? "Failed to load requests.");
        }
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    loadRequests();
  }, [user]);

  async function handleApprove(requestId: string) {
    if (!user) return;
    setProcessingId(requestId);

    try {
      const result = await approveBatchJoinRequest(requestId, user.id);
      if (result.success) {
        toast.success("Request approved. Student has been assigned to the batch.");
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      } else {
        toast.error(result.error ?? "Failed to approve request.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(requestId: string) {
    if (!user) return;
    setProcessingId(requestId);

    try {
      const result = await rejectBatchJoinRequest(requestId, user.id, rejectReason || undefined);
      if (result.success) {
        toast.success("Request rejected.");
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        setRejectDialogId(null);
        setRejectReason("");
      } else {
        toast.error(result.error ?? "Failed to reject request.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Join Requests</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage student requests to join batches.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-6 w-6" />
              {error}
            </CardContent>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="mx-auto mb-2 h-6 w-6" />
              No pending batch join requests.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {request.student?.user?.name ?? "Unknown Student"}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {request.student?.admission_no ?? "N/A"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>
                          Batch: <span className="font-medium text-foreground">{request.batch?.name ?? "Unknown"}</span>
                        </span>
                        {request.batch?.academic_year && (
                          <span>Year: {request.batch.academic_year}</span>
                        )}
                        <span>
                          Requested {new Date(request.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {request.student?.user?.email && (
                        <p className="text-xs text-muted-foreground">
                          {request.student.user.email}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-500/30 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950/20"
                        onClick={() => handleApprove(request.id)}
                        disabled={processingId === request.id}
                      >
                        {processingId === request.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/20"
                        onClick={() => setRejectDialogId(request.id)}
                        disabled={processingId === request.id}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>

                  {/* Reject reason dialog (inline) */}
                  {rejectDialogId === request.id && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-sm font-medium">Reject this request?</p>
                      <div>
                        <label htmlFor={`reason-${request.id}`} className="block text-xs text-muted-foreground mb-1">
                          Reason (optional)
                        </label>
                        <textarea
                          id={`reason-${request.id}`}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          placeholder="Provide a reason for rejection..."
                          rows={2}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(request.id)}
                          disabled={processingId === request.id}
                        >
                          {processingId === request.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Confirm Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejectDialogId(null);
                            setRejectReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
