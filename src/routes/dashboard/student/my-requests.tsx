import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getStudentBatchRequests, cancelBatchJoinRequest } from "@/services/batchRequest.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle, Ban, Loader2 } from "lucide-react";
import type { BatchJoinRequest } from "@/types";

export const Route = createFileRoute("/dashboard/student/my-requests")({
  head: () => ({ meta: [{ title: "My Batch Requests — EliteClass" }] }),
  component: MyRequestsPage,
});

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="outline" className="border-green-500/30 text-green-700 dark:text-green-300">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="border-red-500/30 text-red-700 dark:text-red-300">
          <XCircle className="mr-1 h-3 w-3" />
          Rejected
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary">
          <Ban className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function MyRequestsPage() {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<BatchJoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !supabase) {
      setIsLoading(false);
      return;
    }

    async function loadRequests() {
      setIsLoading(true);
      setError(null);

      try {
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

        const result = await getStudentBatchRequests(student.id);
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

  async function handleCancel(requestId: string) {
    setCancellingId(requestId);
    try {
      const result = await cancelBatchJoinRequest(requestId);
      if (result.success) {
        toast.success("Request cancelled.");
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId ? { ...r, status: "cancelled" as const } : r,
          ),
        );
      } else {
        toast.error(result.error ?? "Failed to cancel request.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Batch Requests</h1>
          <p className="text-muted-foreground mt-1">
            Track the status of your batch join requests.
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
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              You haven't made any batch join requests yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {request.batch?.name ?? "Unknown Batch"}
                      </span>
                      {getStatusBadge(request.status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {request.batch?.academic_year && (
                        <span>{request.batch.academic_year}</span>
                      )}
                      <span>
                        Requested {new Date(request.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {request.status === "rejected" && request.reason && (
                      <p className="text-xs text-destructive mt-1">
                        Reason: {request.reason}
                      </p>
                    )}
                  </div>
                  {request.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancel(request.id)}
                      disabled={cancellingId === request.id}
                    >
                      {cancellingId === request.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Cancel"
                      )}
                    </Button>
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
