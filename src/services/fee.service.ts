// ---------------------------------------------------------------------------
// EduOS — Fee Service
//
// All database operations for fee management live here.
// Tables: fee_categories, fee_structures, student_fees, fee_payments
//
// SUPABASE NULL SAFETY
//   `supabase` is `SupabaseClient | null` (see src/lib/supabase.ts).
//   Every function starts with `if (!supabase) return SUPABASE_NOT_CONFIGURED`.
//   After that guard, TypeScript narrows the type to `SupabaseClient` for the
//   remainder of the function body — no `!` assertions needed below.
//
// Every function returns an ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  FeeStructure,
  FeeCategory,
  StudentFee,
  FeePayment,
  FeeStatus,
  RecordPaymentResult,
  RevenueStats,
  InstituteRevenueAnalytics,
  ParentFeeSummary,
  FeeReceipt,
  FeeInstallment,
  ApiResponse,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Fee Structures ───────────────────────────────────────────────────────────

/**
 * Return all fee structures for an institute, newest first.
 * Joins the optional `fee_categories` relation for display purposes.
 */
export async function getFeeStructures(instituteId: string): Promise<ApiResponse<FeeStructure[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_structures")
    .select("id, name, fee_name, fee_code, fee_type, amount, frequency, recurring_type, academic_year, due_date, category:fee_categories(id, name)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeStructure[], error: null, success: true };
}

/**
 * Insert a new fee structure record.
 * The caller is responsible for ensuring `institute_id` belongs to the
 * currently signed-in admin (enforced by RLS on the server).
 */
export async function createFeeStructure(payload: {
  institute_id: string;
  name?: string;
  fee_name?: string;
  fee_code?: string;
  fee_type?: string;
  amount: number;
  frequency?: string;
  recurring_type?: string;
  academic_year: string;
  due_date?: string;
  installment_allowed?: boolean;
  late_fee?: number;
  description?: string;
  category_id?: string;
  batch_id?: string | null;
  course_id?: string | null;
  installment_count?: number;
}): Promise<ApiResponse<FeeStructure>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const feeName = payload.fee_name ?? payload.name ?? "Untitled Fee";

  const { data, error } = await supabase
    .from("fee_structures")
    .insert({
      ...payload,
      name: feeName,
      fee_name: feeName,
      fee_code: payload.fee_code ?? feeName.toUpperCase().replace(/\s+/g, "_"),
      fee_type: payload.fee_type ?? "custom",
      recurring_type: payload.recurring_type ?? payload.frequency ?? "one_time",
      installment_allowed: payload.installment_allowed ?? false,
      late_fee: payload.late_fee ?? 0,
      batch_id: payload.batch_id ?? null,
      course_id: payload.course_id ?? null,
      installment_count: payload.installment_count ?? 1,
    })
    .select("*, category:fee_categories(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeStructure, error: null, success: true };
}

/**
 * Delete a fee structure if it has not been assigned to any students yet.
 */
export async function deleteFeeStructure(
  instituteId: string,
  feeStructureId: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { count, error: countError } = await supabase
    .from("student_fees")
    .select("id", { count: "exact", head: true })
    .eq("institute_id", instituteId)
    .eq("fee_structure_id", feeStructureId);

  if (countError) return { data: null, error: countError.message, success: false };
  if ((count ?? 0) > 0) {
    return {
      data: null,
      error: "This fee structure is already assigned to students and cannot be deleted.",
      success: false,
    };
  }

  const { error } = await supabase
    .from("fee_structures")
    .delete()
    .eq("id", feeStructureId)
    .eq("institute_id", instituteId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── Fee Categories ───────────────────────────────────────────────────────────

/**
 * Return all fee categories for an institute, sorted alphabetically.
 * Categories are used to group fee structures (e.g. Tuition, Transport).
 */
export async function getFeeCategories(instituteId: string): Promise<ApiResponse<FeeCategory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_categories")
    .select("*")
    .eq("institute_id", instituteId)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeCategory[], error: null, success: true };
}

/**
 * Create a new fee category for an institute.
 */
export async function createFeeCategory(payload: {
  institute_id: string;
  name: string;
  description?: string;
}): Promise<ApiResponse<FeeCategory>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("fee_categories").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeCategory, error: null, success: true };
}

// ── Student Fee Assignment ───────────────────────────────────────────────────

/**
 * Assign a fee structure to a specific student.
 *
 * The DB computes `final_amount = original_amount - discount_amount` and
 * initialises `paid_so_far = 0` and `status = 'pending'` automatically.
 */
export async function assignFeeToStudent(payload: {
  student_id: string;
  institute_id: string;
  fee_structure_id: string;
  assigned_by: string;
  original_amount: number;
  discount_amount: number;
  discount_reason?: string;
  due_date: string;
  academic_year: string;
  parent_id?: string | null;
  scholarship_amount?: number;
  concession_amount?: number;
  waiver_amount?: number;
  installment_count?: number;
  fee_type?: string;
  bill_number?: string;
}): Promise<ApiResponse<StudentFee>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const parentId = payload.parent_id ?? (await resolvePrimaryParentId(payload.student_id));

  const scholarshipAmount = payload.scholarship_amount ?? 0;
  const concessionAmount = payload.concession_amount ?? 0;
  const waiverAmount = payload.waiver_amount ?? 0;
  const computedDiscount =
    payload.discount_amount + scholarshipAmount + concessionAmount + waiverAmount;
  const finalAmount = Math.max(0, payload.original_amount - computedDiscount);
  const billNumber =
    payload.bill_number ?? `BILL-${payload.student_id.slice(0, 8).toUpperCase()}-${Date.now()}`;

  const { data, error } = await supabase
    .from("student_fees")
    .insert({
      student_id: payload.student_id,
      institute_id: payload.institute_id,
      fee_structure_id: payload.fee_structure_id,
      parent_id: parentId,
      assigned_by: payload.assigned_by,
      original_amount: payload.original_amount,
      discount_amount: computedDiscount,
      discount_reason: payload.discount_reason ?? null,
      scholarship_amount: scholarshipAmount,
      concession_amount: concessionAmount,
      waiver_amount: waiverAmount,
      final_amount: finalAmount,
      due_date: payload.due_date,
      next_due_date: payload.due_date,
      installment_count: payload.installment_count ?? 1,
      fee_type: payload.fee_type ?? null,
      bill_number: billNumber,
      status: waiverAmount >= payload.original_amount ? "waived" : "pending",
      academic_year: payload.academic_year,
    })
    .select("*, fee_structure:fee_structures(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  if (data && payload.installment_count && payload.installment_count > 1) {
    await supabase.rpc("create_fee_installments", {
      p_student_fee_id: data.id,
      p_total_amount: finalAmount,
      p_due_date: payload.due_date,
      p_installment_count: payload.installment_count,
    });
  }

  return { data: data as StudentFee, error: null, success: true };
}

/**
 * Assign a fee structure to multiple students or a whole batch.
 * The function resolves linked parents automatically and returns the rows
 * that were created.
 */
export async function assignFeesToStudents(payload: {
  institute_id: string;
  fee_structure_id: string;
  assigned_by: string;
  original_amount: number;
  discount_amount?: number;
  discount_reason?: string;
  due_date: string;
  academic_year: string;
  student_ids?: string[];
  batch_id?: string;
  scholarship_amount?: number;
  concession_amount?: number;
  waiver_amount?: number;
  installment_count?: number;
  fee_type?: string;
}): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const studentIds =
    Array.isArray(payload.student_ids) && payload.student_ids.length > 0
      ? payload.student_ids
      : payload.batch_id
        ? await getStudentIdsByBatch(payload.institute_id, payload.batch_id)
        : [];

  if (studentIds.length === 0) {
    return { data: [], error: null, success: true };
  }

  const created: StudentFee[] = [];
  for (const studentId of studentIds) {
    const result = await assignFeeToStudent({
      student_id: studentId,
      institute_id: payload.institute_id,
      fee_structure_id: payload.fee_structure_id,
      assigned_by: payload.assigned_by,
      original_amount: payload.original_amount,
      discount_amount: payload.discount_amount ?? 0,
      discount_reason: payload.discount_reason,
      due_date: payload.due_date,
      academic_year: payload.academic_year,
      scholarship_amount: payload.scholarship_amount,
      concession_amount: payload.concession_amount,
      waiver_amount: payload.waiver_amount,
      installment_count: payload.installment_count,
      fee_type: payload.fee_type,
    });

    if (!result.success || !result.data) {
      return { data: null, error: result.error ?? "Failed to assign fees.", success: false };
    }

    created.push(result.data);
  }

  return { data: created, error: null, success: true };
}

/**
 * Return all fee assignments for a single student.
 * Joins the fee structure template and any existing payments so callers
 * have a complete picture without extra round-trips.
 */
export async function getStudentFees(studentId: string): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_fees")
    .select(
      `
      id, student_id, fee_structure_id, final_amount, status, due_date, next_due_date, created_at,
      fee_structure:fee_structures(*),
      parent:parents(*, user:users(*)),
      payments:fee_payments(*)
    `,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };

  // Compute paid_so_far client-side for each fee
  const fees = (data ?? []).map((fee: any) => {
    const paid_so_far = (fee.payments ?? []).reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
    return { ...fee, paid_so_far };
  });

  return { data: fees as StudentFee[], error: null, success: true };
}

/**
 * Return all student fee assignments for an institute.
 *
 * Each row includes the student profile (with linked `user`) and the
 * fee structure template.  Supports optional server-side filtering by
 * `status` and `academicYear`.
 */
export async function getInstituteStudentFees(
  instituteId: string,
  filters?: { status?: FeeStatus; academicYear?: string },
): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("student_fees")
    .select(
      `
      id, student_id, fee_structure_id, original_amount, discount_amount, final_amount, status, due_date, academic_year, created_at,
      student:students(id, admission_no, user:users(id, name, email, avatar_url)),
      fee_structure:fee_structures(id, name, amount)
    `,
    )
    .eq("institute_id", instituteId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.academicYear) {
    query = query.eq("academic_year", filters.academicYear);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee[], error: null, success: true };
}

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Record a fee payment against a student fee assignment.
 *
 * Delegates to the `record_fee_payment` Postgres RPC which atomically:
 *   1. Inserts a `fee_payments` row
 *   2. Updates `student_fees.paid_so_far`
 *   3. Recalculates and sets the new `status` (partial / paid / overdue)
 *   4. Generates and returns a sequential receipt number
 *
 * Returns a `RecordPaymentResult` with the receipt number and updated status
 * so the UI can reflect changes immediately without a follow-up query.
 */
export async function recordPayment(payload: {
  student_fee_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_ref?: string;
  notes?: string;
}): Promise<ApiResponse<RecordPaymentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("record_fee_payment", {
    p_student_fee_id: payload.student_fee_id,
    p_amount: payload.amount,
    p_payment_method: payload.payment_method,
    p_payment_date: payload.payment_date,
    p_transaction_ref: payload.transaction_ref ?? null,
    p_notes: payload.notes ?? null,
  });

  if (error) return { data: null, error: error.message, success: false };
  const normalized = data as unknown as {
    payment_id: string;
    receipt_number: string;
    new_status: FeeStatus;
    remaining_due?: number;
    remaining_amount?: number;
  };
  return {
    data: {
      payment_id: normalized.payment_id,
      receipt_number: normalized.receipt_number,
      new_status: normalized.new_status,
      remaining_amount: normalized.remaining_amount ?? normalized.remaining_due ?? 0,
    },
    error: null,
    success: true,
  };
}

/**
 * Return the complete payment history for a student fee assignment.
 * Results are ordered newest-first (most recent payment at the top).
 */
export async function getPaymentHistory(studentFeeId: string): Promise<ApiResponse<FeePayment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_payments")
    .select("*, collector:users!collected_by(id, name)")
    .eq("student_fee_id", studentFeeId)
    .order("payment_date", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeePayment[], error: null, success: true };
}

// ── Revenue Analytics ─────────────────────────────────────────────────────────

/**
 * Compute aggregated revenue statistics for an institute in a given
 * academic year.
 *
 * Implemented client-side to avoid a dedicated RPC:
 *  1. Fetch all `student_fees` for the institute + year to derive
 *     pending / overdue totals from `final_amount` and `paid_so_far`.
 *  2. Fetch all `fee_payments` for those fees to derive total collected
 *     and the current-month collection figure.
 *
 * Both queries run before any JavaScript computation begins, so the two
 * network round-trips are the only latency cost.
 */
export async function getRevenueStats(
  instituteId: string,
  academicYear: string,
): Promise<ApiResponse<RevenueStats>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // ── Step 1: Fetch fee assignments ──────────────────────────────────────────
  const { data: fees, error: feesError } = await supabase
    .from("student_fees")
    .select("id, final_amount, status")
    .eq("institute_id", instituteId)
    .eq("academic_year", academicYear);

  if (feesError) return { data: null, error: feesError.message, success: false };

  const feeList = fees ?? [];
  const feeIds = feeList.map((f) => f.id as string);

  // ── Step 2: Fetch payments for these student fees ─────────────────────────
  // We need all payments to compute collected totals and monthly trends.
  const { data: payments, error: paymentsError } = await supabase
    .from("fee_payments")
    .select("student_fee_id, amount, payment_date")
    .in("student_fee_id", feeIds);

  if (paymentsError) return { data: null, error: paymentsError.message, success: false };

  // ── Step 3: Compute totals ────────────────────────────────────────────────
  // Map payments by student_fee_id for fast lookup
  const paymentsByFee = new Map<string, number>();
  for (const p of payments ?? []) {
    const current = paymentsByFee.get(p.student_fee_id) ?? 0;
    paymentsByFee.set(p.student_fee_id, current + p.amount);
  }

  let totalPending = 0;
  let totalOverdue = 0;

  for (const fee of feeList) {
    const paidSoFar = paymentsByFee.get(fee.id) ?? 0;
    const remaining = Math.max(0, (fee.final_amount ?? 0) - paidSoFar);
    if (fee.status === "pending" || fee.status === "partial") {
      totalPending += remaining;
    } else if (fee.status === "overdue") {
      totalOverdue += remaining;
    }
  }

  // ── Step 4: Compute collection totals ─────────────────────────────────────
  // ISO date prefix for the first day of the current calendar month.
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let totalCollected = 0;
  let collectionThisMonth = 0;

  for (const payment of payments ?? []) {
    const amt = payment.amount ?? 0;
    totalCollected += amt;
    // payment_date is stored as YYYY-MM-DD; string comparison works here.
    if ((payment.payment_date as string) >= firstOfMonth) {
      collectionThisMonth += amt;
    }
  }

  return {
    data: {
      total_collected: totalCollected,
      total_pending: totalPending,
      total_overdue: totalOverdue,
      collection_this_month: collectionThisMonth,
    },
    error: null,
    success: true,
  };
}

/**
 * Return all student fee assignments that still have an outstanding balance.
 *
 * Filters to `status IN ('pending', 'partial', 'overdue')` and orders by
 * `due_date ASC` so the most-urgent entries appear first.
 *
 * Each row is fully joined with:
 *  - `student → users`  (for name, admission number)
 *  - `fee_structure`    (for fee name and amount)
 *  - `payments`         (for payment history display)
 */
export async function getPendingDues(instituteId: string): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_fees")
    .select(
      `
      id, student_id, fee_structure_id, final_amount, status, due_date,
      student:students(id, admission_no, user:users(id, name, avatar_url)),
      parent:parents(id, user:users(id, name, email, phone)),
      fee_structure:fee_structures(id, name),
      payments:fee_payments(id, amount, payment_date)
    `,
    )
    .eq("institute_id", instituteId)
    .in("status", ["pending", "partial", "overdue"])
    .order("due_date", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee[], error: null, success: true };
}

/**
 * Return all fee installments for a student fee assignment.
 */
export async function getFeeInstallments(
  studentFeeId: string,
): Promise<ApiResponse<FeeInstallment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_installments")
    .select("*")
    .eq("student_fee_id", studentFeeId)
    .order("installment_no", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeInstallment[], error: null, success: true };
}

/**
 * Build a parent-centric fee summary for the parent dashboard.
 */
export async function getParentFeeSummary(
  parentId: string,
): Promise<ApiResponse<ParentFeeSummary>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: parent, error: parentError } = await supabase
    .from("parents")
    .select("*, user:users(*)")
    .eq("id", parentId)
    .maybeSingle();

  if (parentError) return { data: null, error: parentError.message, success: false };
  if (!parent) return { data: null, error: "Parent record not found.", success: false };

  const { data: studentFees, error: feesError } = await supabase
    .from("student_fees")
    .select(
      `id, student_id, final_amount, status, due_date, next_due_date, created_at, student:students(*, user:users(*)), fee_structure:fee_structures(*), payments:fee_payments(*), installments:fee_installments(*)`,
    )
    .eq("parent_id", parentId)
    .order("created_at", { ascending: false });

  if (feesError) return { data: null, error: feesError.message, success: false };

  const grouped = new Map<string, ParentFeeSummary["children"][number]>();
  let totalDue = 0;
  let totalPaid = 0;

  for (const fee of (studentFees ?? []) as StudentFee[]) {
    if (!fee.student) continue;

    // Compute paid_so_far client-side since column was removed
    const paidSoFar = (fee.payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const remaining = Math.max(0, fee.final_amount - paidSoFar);
    totalDue += fee.final_amount;
    totalPaid += paidSoFar;

    const existing = grouped.get(fee.student.id);
    if (existing) {
      existing.fee_items.push({
        student_fee: { ...fee, paid_so_far: paidSoFar },
        total_due: fee.final_amount,
        total_paid: paidSoFar,
        remaining_due: remaining,
        next_due_date: fee.next_due_date ?? fee.due_date,
      });
      existing.total_due += fee.final_amount;
      existing.total_paid += paidSoFar;
      existing.remaining_due += remaining;
      continue;
    }

    grouped.set(fee.student.id, {
      student: fee.student,
      fee_items: [
        {
          student_fee: { ...fee, paid_so_far: paidSoFar },
          total_due: fee.final_amount,
          total_paid: paidSoFar,
          remaining_due: remaining,
          next_due_date: fee.next_due_date ?? fee.due_date,
        },
      ],
      total_due: fee.final_amount,
      total_paid: paidSoFar,
      remaining_due: remaining,
    });
  }

  return {
    data: {
      parent: parent as ParentFeeSummary["parent"],
      children: Array.from(grouped.values()),
      total_due: totalDue,
      total_paid: totalPaid,
      remaining_due: Math.max(0, totalDue - totalPaid),
    },
    error: null,
    success: true,
  };
}

/**
 * Aggregate revenue analytics for the institute billing dashboard.
 */
export async function getInstituteRevenueAnalytics(
  instituteId: string,
  academicYear: string,
): Promise<ApiResponse<InstituteRevenueAnalytics>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: fees, error: feeError } = await supabase
    .from("student_fees")
    .select("id, status, final_amount, due_date")
    .eq("institute_id", instituteId)
    .eq("academic_year", academicYear);

  if (feeError) return { data: null, error: feeError.message, success: false };

  const { data: payments, error: paymentError } = await supabase
    .from("fee_payments")
    .select("student_fee_id, amount, payment_date")
    .eq("institute_id", instituteId);

  if (paymentError) return { data: null, error: paymentError.message, success: false };

  // Map payments by student_fee_id for fast lookup
  const paymentsByFee = new Map<string, number>();
  for (const p of payments ?? []) {
    const current = paymentsByFee.get(p.student_fee_id) ?? 0;
    paymentsByFee.set(p.student_fee_id, current + p.amount);
  }

  const statusDistribution: InstituteRevenueAnalytics["fee_status_distribution"] = {
    paid: 0,
    pending: 0,
    partial: 0,
    overdue: 0,
    waived: 0,
  };

  let totalPending = 0;
  let totalOverdue = 0;
  let totalCollected = 0;
  let currentMonthCollection = 0;

  for (const fee of fees ?? []) {
    statusDistribution[fee.status as FeeStatus] += 1;
    const paidSoFar = paymentsByFee.get(fee.id) ?? 0;
    const remaining = Math.max(0, fee.final_amount - paidSoFar);
    if (fee.status === "pending" || fee.status === "partial") totalPending += remaining;
    if (fee.status === "overdue") totalOverdue += remaining;
  }

  const monthBuckets = new Map<string, number>();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  for (const payment of payments ?? []) {
    totalCollected += payment.amount;
    if (payment.payment_date.startsWith(currentMonth)) {
      currentMonthCollection += payment.amount;
    }
    const month = payment.payment_date.slice(0, 7);
    monthBuckets.set(month, (monthBuckets.get(month) ?? 0) + payment.amount);
  }

  const monthlyRevenue = Array.from(monthBuckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, amount]) => ({ month, amount }));

  return {
    data: {
      total_collected: totalCollected,
      total_pending: totalPending,
      total_overdue: totalOverdue,
      collection_this_month: currentMonthCollection,
      fee_status_distribution: statusDistribution,
      monthly_revenue: monthlyRevenue,
    },
    error: null,
    success: true,
  };
}

/**
 * Return a printable receipt payload for a payment.
 */
export async function generateReceipt(paymentId: string): Promise<ApiResponse<FeeReceipt | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_receipts")
    .select("*")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data as FeeReceipt | null) ?? null, error: null, success: true };
}

async function resolvePrimaryParentId(studentId: string): Promise<string | null> {
  const { data, error } = await supabase!
    .from("student_parents")
    .select("parent_id")
    .eq("student_id", studentId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.parent_id ?? null;
}

async function getStudentIdsByBatch(instituteId: string, batchId: string): Promise<string[]> {
  const { data, error } = await supabase!
    .from("students")
    .select("id")
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId);

  if (error || !data) return [];
  return data.map((row) => row.id);
}
