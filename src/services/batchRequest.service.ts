import { supabase } from "@/lib/supabase";
import type { ApiResponse, BatchJoinRequest, CreateBatchJoinRequestPayload, AvailableBatch } from "@/types";

const SUPABASE_NOT_CONFIGURED = { data: null, error: "Supabase is not configured.", success: false } as const;

export async function createBatchJoinRequest(payload: CreateBatchJoinRequestPayload): Promise<ApiResponse<BatchJoinRequest>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  // Check for existing pending request
  const { data: existing } = await supabase
    .from("batch_join_requests")
    .select("id")
    .eq("student_id", payload.student_id)
    .eq("batch_id", payload.batch_id)
    .eq("status", "pending")
    .maybeSingle();
  
  if (existing) return { data: null, error: "You already have a pending request for this batch.", success: false };
  
  // Check if already a member
  const { data: student } = await supabase
    .from("students")
    .select("batch_id")
    .eq("id", payload.student_id)
    .single();
  
  if (student?.batch_id === payload.batch_id) {
    return { data: null, error: "You are already assigned to this batch.", success: false };
  }
  
  const { data, error } = await supabase
    .from("batch_join_requests")
    .insert(payload)
    .select("*")
    .single();
  
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as BatchJoinRequest, error: null, success: true };
}

export async function cancelBatchJoinRequest(requestId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  const { error } = await supabase
    .from("batch_join_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending");
  
  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

export async function approveBatchJoinRequest(requestId: string, approvedBy: string): Promise<ApiResponse<BatchJoinRequest>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from("batch_join_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();
  
  if (fetchError || !request) return { data: null, error: "Request not found or already processed.", success: false };
  
  // Update request status
  const { data: updated, error: updateError } = await supabase
    .from("batch_join_requests")
    .update({ status: "approved", reviewed_by: approvedBy, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("*")
    .single();
  
  if (updateError) return { data: null, error: updateError.message, success: false };
  
  // Assign student to batch
  await supabase
    .from("students")
    .update({ batch_id: request.batch_id, updated_at: new Date().toISOString() })
    .eq("id", request.student_id);
  
  return { data: updated as BatchJoinRequest, error: null, success: true };
}

export async function rejectBatchJoinRequest(requestId: string, rejectedBy: string, reason?: string): Promise<ApiResponse<BatchJoinRequest>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  const { data, error } = await supabase
    .from("batch_join_requests")
    .update({ 
      status: "rejected", 
      reason: reason || null, 
      reviewed_by: rejectedBy, 
      reviewed_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .single();
  
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as BatchJoinRequest, error: null, success: true };
}

export async function getStudentBatchRequests(studentId: string): Promise<ApiResponse<BatchJoinRequest[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  const { data, error } = await supabase
    .from("batch_join_requests")
    .select("*, batch:batches(id, name, academic_year)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  
  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as BatchJoinRequest[], error: null, success: true };
}

export async function getPendingBatchRequests(instituteId: string, staffBatchIds?: string[]): Promise<ApiResponse<BatchJoinRequest[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  let query = supabase
    .from("batch_join_requests")
    .select("*, student:students(id, admission_no, user_id, user:users(name, email)), batch:batches(id, name, academic_year)")
    .eq("institute_id", instituteId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  
  if (staffBatchIds && staffBatchIds.length > 0) {
    query = query.in("batch_id", staffBatchIds);
  }
  
  const { data, error } = await query;
  
  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as BatchJoinRequest[], error: null, success: true };
}

export async function getAvailableBatchesForStudent(instituteId: string, studentId: string): Promise<ApiResponse<AvailableBatch[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  
  // Get all active batches
  const { data: batches, error } = await supabase
    .from("batches")
    .select("*")
    .eq("institute_id", instituteId)
    .eq("is_active", true)
    .order("name");
  
  if (error) return { data: null, error: error.message, success: false };
  
  // Get student's current batch
  const { data: student } = await supabase
    .from("students")
    .select("batch_id")
    .eq("id", studentId)
    .single();
  
  // Get student's pending requests
  const { data: pendingRequests } = await supabase
    .from("batch_join_requests")
    .select("batch_id")
    .eq("student_id", studentId)
    .eq("status", "pending");
  
  const pendingBatchIds = new Set((pendingRequests ?? []).map(r => r.batch_id));
  
  // Get student counts per batch
  const { data: counts } = await supabase
    .from("students")
    .select("batch_id")
    .eq("institute_id", instituteId)
    .not("batch_id", "is", null);
  
  const batchCounts = new Map<string, number>();
  (counts ?? []).forEach(s => {
    batchCounts.set(s.batch_id, (batchCounts.get(s.batch_id) ?? 0) + 1);
  });
  
  const available: AvailableBatch[] = (batches ?? []).map(b => ({
    ...b,
    student_count: batchCounts.get(b.id) ?? 0,
    is_full: false, // No capacity field on batches table currently
    has_pending_request: pendingBatchIds.has(b.id),
    is_already_member: student?.batch_id === b.id,
  }));
  
  return { data: available, error: null, success: true };
}
