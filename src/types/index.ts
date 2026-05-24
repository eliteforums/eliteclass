// ---------------------------------------------------------------------------
// EduOS — Shared Domain Types
// Every Supabase table row and every shared enum lives here.
// Services, stores, and components all import from '@/types'.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

// ── Primitives ──────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin" // Platform owner — cross-institute visibility
  | "admin" // Institute administrator
  | "staff" // Staff member with teaching duties
  | "student" // Enrolled learner
  | "parent"; // Guardian linked to one or more students

export type SubscriptionPlan = "free" | "basic" | "pro" | "enterprise";

export type StudentStatus = "active" | "inactive" | "graduated" | "suspended";

export type BatchStatus = "active" | "inactive" | "archived";

export type RelationType = "father" | "mother" | "guardian" | "sibling" | "other";

// ── Generic API envelope ────────────────────────────────────────────────────

/**
 * Unified response wrapper used by every service function.
 * Consumers check `success` before accessing `data`.
 *
 * @template T  The shape of a successful payload.
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

// ── Core entities ───────────────────────────────────────────────────────────

/** Row in the `users` table (mirrors Supabase auth.users via a trigger). */
export interface User {
  id: string;
  institute_id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row in the `institutes` table. */
export interface Institute {
  id: string;
  name: string;
  /** Short code used as prefix for student login IDs (e.g. 224). */
  institute_code?: string;
  logo: string | null;
  subscription_plan: SubscriptionPlan;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentBatchAssignment {
  id: string;
  student_id: string;
  batch_id: string;
  course_id: string;
  institute_id: string;
  is_active: boolean;
  assigned_at: string;
  batch?: Batch;
  course?: Course;
}

/** Row in the `students` table. */
export interface Student {
  id: string;
  institute_id: string;
  /** Same as Supabase auth.users.id */
  user_id: string;
  admission_no: string;
  batch_id: string | null;
  status: StudentStatus;
  /** Institute-scoped login handle (e.g. 224sarvesh4831). */
  login_id?: string | null;
  /** Virtual auth email (e.g. 224sarvesh4831@eduos.student). */
  generated_email?: string | null;
  /** Optional real contact email; not used for sign-in. */
  contact_email?: string | null;
  emergency_contact?: EmergencyContact | null;
  created_at: string;
  updated_at: string;

  // Joined relations (populated when select includes `user:users(*)`)
  user?: User;
  batch?: Batch;
  assignments?: StudentBatchAssignment[];
}

/** Row in the `parents` table. */
export interface Parent {
  id: string;
  institute_id: string;
  user_id: string;
  occupation: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  user?: User;
}

/**
 * Row in the `student_parents` join table.
 * Tracks which parent is linked to which student and the relationship type.
 */
export interface StudentParent {
  id: string;
  student_id: string;
  parent_id: string;
  relation_type: RelationType;
  created_at: string;

  // Joined relations
  student?: Student;
  parent?: Parent;
}

/** Same junction semantics as `StudentParent`; use for strict admission / ERP payloads. */
export type StudentParentRelation = Pick<
  StudentParent,
  "student_id" | "parent_id" | "relation_type"
>;

/** Row in the `staff` table. */
export interface Staff {
  id: string;
  institute_id: string;
  user_id: string;
  designation: string;
  department: string | null;
  phone?: string | null;
  qualification?: string | null;
  joining_date?: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;

  // Joined relations
  user?: User;
  assignments?: StaffAssignment[];
  assigned_courses?: StaffCourseAssignment[];
}

export interface StaffRole {
  id: string;
  institute_id: string;
  role_name: string;
  permissions: string[];
  created_at: string;
}

export interface StaffAssignment {
  id: string;
  institute_id: string;
  staff_id: string;
  batch_id: string | null;
  course_name: string | null;
  subject_name: string | null;
  created_at: string;
  
  // Joined
  batch?: Batch;
}

export interface StaffBatchAssignment {
  id: string;
  institute_id: string;
  staff_id: string;
  batch_id: string;
  assigned_at: string;
  assigned_by: string | null;
  batch?: Batch;
}

export interface StaffCourseAssignment {
  id: string;
  institute_id: string;
  staff_id: string;
  course_id: string;
  assigned_at: string;
  assigned_by: string | null;
  course?: LmsCourse;
}

export interface StaffBatchOption {
  id: string;
  name: string;
  academic_year: string;
  course_name: string | null;
  label: string;
}

export interface StaffCourseOption {
  id: string;
  name: string;
  code: string | null;
  status?: LmsCourseStatus;
  label: string;
}

export interface AdmitStaffPayload {
  institute_id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  qualification: string;
  joining_date: string;
  role_name: string;
  assigned_course_ids?: string[];
  assignments?: {
    batch_id?: string;
    course_name?: string;
    subject_name?: string;
  }[];
}

export interface AdmitStaffResult {
  staff_id: string;
  user_id: string;
  email: string;
  temporary_password: string;
  name: string;
  role_name: string;
  assigned_course_ids?: string[];
  assignments?: {
    batch_id?: string;
    course_name?: string;
    subject_name?: string;
  }[];
}

export interface UpdateStaffPayload {
  fullName: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  qualification: string;
  joining_date: string;
  is_active?: boolean;
  assigned_course_ids?: string[];
}

/** Row in the `staff_assignments` table. */
export interface StaffAssignment {
  id: string;
  institute_id: string;
  staff_id: string;
  batch_id: string | null;
  course_name: string | null;
  subject_name: string | null;
  assigned_at: string;
  assigned_by: string | null;
  created_at?: string;

  // Joined relations
  batch?: Batch;
  assigned_by_user?: Pick<User, "id" | "name" | "role">;
}

/** Batch-specific staff assignment row. */
export interface StaffBatchAssignment extends StaffAssignment {
  batch_id: string;
  batch?: Batch;
}

export interface StaffCourseAssignment {
  id: string;
  institute_id: string;
  staff_id: string;
  course_id: string;
  assigned_at: string;
  assigned_by: string | null;
  course?: Course;
}

/** Batch option used by the staff management UI. */
export type StaffBatchOption = Batch;

/** Payload accepted when admitting a new staff member. */
export interface AdmitStaffPayload {
  institute_id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  qualification: string;
  joining_date: string;
  role_name: string;
  assigned_course_ids?: string[];
  assignments?: Array<{
    batch_id?: string;
    course_name?: string;
    subject_name?: string;
  }>;
}

/** Result returned after admitting or resetting a staff credential. */
export interface AdmitStaffResult {
  staff_id: string;
  user_id: string;
  email: string;
  temporary_password: string;
  role_name: string;
  assigned_course_ids?: string[];
  assignments?: Array<{
    batch_id?: string;
    course_name?: string;
    subject_name?: string;
  }>;
}

// ── Auth ───────────────────────────────────────────────────────────────────

/** Shape of global authentication state (used in Zustand + context). */
export interface AuthSession {
  user: User | null;
  institute: Institute | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ── Route Guards ────────────────────────────────────────────────────────────

/** Props accepted by ProtectedRoute / RoleGuard components. */
export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: ReactNode;
}

// ── Form Data (consumed by React Hook Form + Zod) ────────────────────────────

export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  /** Required when self-registering into an existing institute */
  institute_id?: string;
}

export interface PasswordResetFormData {
  email: string;
}

export interface PasswordUpdateFormData {
  password: string;
  confirmPassword: string;
}

// ── Batches ──────────────────────────────────────────────────────────────────

/** Row in the `batches` table. */
export interface Batch {
  id: string;
  institute_id: string;
  course_id?: string | null;
  name: string;
  academic_year: string;
  description: string | null;
  batch_code: string | null;
  course_name: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  is_active: boolean;
  status?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  student_count?: number;
  course?: Course;
}

export interface CreateBatchPayload {
  institute_id: string;
  course_id?: string | null;
  name: string;
  academic_year: string;
  description?: string;
  batch_code?: string;
  course_name?: string;
  start_date?: string;
  end_date?: string;
  capacity?: number;
  status?: BatchStatus;
}

export interface UpdateBatchPayload {
  course_id?: string | null;
  name?: string;
  academic_year?: string;
  description?: string;
  batch_code?: string;
  course_name?: string;
  start_date?: string;
  end_date?: string;
  capacity?: number;
  is_active?: boolean;
  status?: BatchStatus;
}

// ── Extended / Derived Types ─────────────────────────────────────────────────

/**
 * Emergency contact details stored alongside a student record.
 * Collected at admission and kept for urgent communication.
 */
export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

/**
 * Row in the `student_history` audit table.
 * Every change to a student record appends an immutable history entry.
 */
export interface StudentHistory {
  id: string;
  student_id: string;
  institute_id: string;
  changed_by: string;
  /** Discriminator: 'status_changed' | 'batch_updated' | 'remark_added' | 'admitted' */
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  remark: string | null;
  created_at: string;

  // Joined
  changed_by_user?: Pick<User, "id" | "name" | "role">;
}

/**
 * Row in the `activity_logs` table.
 * Records every significant user action platform-wide for auditing.
 */
export interface ActivityLog {
  id: string;
  institute_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;

  // Joined
  user?: Pick<User, "id" | "name" | "role">;
}

// ── Pagination ───────────────────────────────────────────────────────────────

/** Metadata returned alongside any paginated list response. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Generic paginated response envelope.
 * Use `PaginatedResponse<Student>`, `PaginatedResponse<Parent>`, etc.
 */
export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

// ── Student Feature Types ────────────────────────────────────────────────────

/**
 * Filter criteria accepted by `searchStudents`.
 * All fields are optional — omitting them returns unfiltered results.
 */
export interface StudentFilters {
  status?: StudentStatus;
  batchId?: string;
  /** Case-insensitive substring match against name, email, and admission_no. */
  search?: string;
}

/**
 * Full admission envelope for `admit_student` RPC.
 * Student and parent fields are logically separated; the RPC enforces the same split.
 */
export interface AdmitStudentPayload {
  institute_id: string;
  /** Institute display name — used to build the login ID prefix (not stored). */
  institute_name?: string;
  student_name: string;
  /** Optional contact email; auth uses auto-generated @eduos.student address. */
  student_email: string | null;
  phone: string;
  admission_number: string;
  batch_id: string | null;
  /** Last four digits only; optional legacy field for the RPC. */
  aadhaar_last4: string | null;
  emergency_contact: EmergencyContact | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  parent_occupation: string | null;
  parent_relation_type: RelationType | null;
}

/**
 * Student-only slice of admission (no parent PII).
 */
export type StudentAdmissionPayload = Pick<
  AdmitStudentPayload,
  | "institute_id"
  | "student_name"
  | "student_email"
  | "phone"
  | "admission_number"
  | "batch_id"
  | "aadhaar_last4"
  | "emergency_contact"
>;

/**
 * Parent-only slice for admission.
 */
export type ParentAdmissionPayload = Pick<
  AdmitStudentPayload,
  "parent_name" | "parent_email" | "parent_phone" | "parent_occupation" | "parent_relation_type"
>;

/** Student profile plus how this parent is related (admin parent panel). */
export type StudentLinkedForParent = Student & { relation_type: RelationType };

/**
 * Shape returned by the `admit_student` RPC on success.
 * Callers can use these IDs to navigate to the new student's profile.
 */
/** One-time credentials returned by admit_student (password never persisted). */
export interface StudentAdmissionCredentials {
  student_id: string;
  user_id: string;
  admission_no: string;
  login_id: string;
  generated_email: string;
  temporary_password: string;
}

// ── Bulk import types ───────────────────────────────────────────────────────
/** Row parsed from the XML import file (one student). */
export interface BulkImportRow {
  rowNumber: number;
  full_name: string;
  contact_email?: string | null;
  phone?: string | null;
  admission_number: string;
  batch?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_relationship?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  occupation?: string | null;
  relationship_type?: RelationType | null;
}

export interface BulkImportErrorRow {
  rowNumber: number;
  studentName?: string | null;
  admissionNumber?: string | null;
  errorMessage: string;
}

export type ParentAccountStatus = "not_provided" | "existing_linked" | "created";
export type ParentEmailDeliveryStatus = "not_applicable" | "sent" | "failed";

export interface AdmitStudentResult extends StudentAdmissionCredentials {
  parent_account_status: ParentAccountStatus;
  parent_email_delivery_status: ParentEmailDeliveryStatus;
  parent_email: string | null;
  parent_temporary_password: string | null;
  parent_user_id: string | null;
  parent_first_login_change_required: boolean;
}

// ── Lifecycle Management ─────────────────────────────────────────────────────

/**
 * Discriminated union of all student lifecycle actions.
 * Drives both the `student_promotions.action` column and the
 * `LifecycleActionModal` UI.
 */
export type LifecycleAction =
  | "promoted"
  | "graduated"
  | "suspended"
  | "reactivated"
  | "transferred";

/**
 * Row in the `student_promotions` table.
 * Recorded whenever a lifecycle action is performed on a student.
 * Complements `StudentHistory` with structured before/after status data
 * and an explicit reason field.
 */
export interface StudentPromotion {
  id: string;
  student_id: string;
  institute_id: string;
  /** The lifecycle action that was performed. */
  action: LifecycleAction;
  from_status: StudentStatus;
  to_status: StudentStatus;
  from_batch_id: string | null;
  to_batch_id: string | null;
  reason: string;
  notes: string | null;
  effective_date: string;
  /** FK to `users.id` — the staff/admin who performed the action. */
  promoted_by: string | null;
  created_at: string;

  // Joined relations (populated when select includes the promoted_by_user join)
  promoted_by_user?: Pick<User, "id" | "name" | "role">;
}

/**
 * Row in the `student_documents` table.
 * Stores metadata for documents uploaded against a student profile.
 * Actual file bytes live in Supabase Storage; only the URL is kept here.
 */
export interface StudentDocument {
  id: string;
  student_id: string;
  institute_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;

  // Joined relations
  uploaded_by_user?: Pick<User, "id" | "name" | "role">;
}

// ── Courses ──────────────────────────────────────────────────────────────────

export type CourseEnrollmentStatus = "active" | "completed" | "dropped";

export interface Course {
  id: string;
  institute_id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentCourse {
  id: string;
  student_id: string;
  course_id: string;
  institute_id: string;
  enrolled_at: string;
  status: CourseEnrollmentStatus;
  course?: Course;
  student?: Student;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "leave";
export type AttendanceSessionType = "daily" | "lecture";

export interface AttendanceSession {
  id: string;
  institute_id: string;
  batch_id: string | null;
  course_id: string | null;
  conducted_by: string;
  session_date: string;
  session_type: AttendanceSessionType;
  topic: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  batch?: Batch;
  course?: Course;
  conductor?: Pick<User, "id" | "name">;
  record_count?: number;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  institute_id: string;
  batch_id?: string | null;
  status: AttendanceStatus;
  notes: string | null;
  marked_by: string;
  marked_at: string;
  student?: Student;
  marker?: Pick<User, "id" | "name">;
}

export interface StudentAttendanceRecord extends AttendanceRecord {
  session?: AttendanceSession & { batch?: Batch };
}

export interface AttendanceTrendPoint {
  label: string;
  period: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  percentage: number;
}

// ── Daily Study Logs ──────────────────────────────────────────────────────────

export interface DailyStudyLog {
  id: string;
  student_id: string;
  batch_id: string;
  institute_id: string;
  title: string;
  description: string;
  attachment_url: string | null;
  log_date: string;
  submitted_at: string;
  status: string;
  is_late: boolean;
  is_locked: boolean;
  created_at: string;
}

export interface StudentStudyLogReport {
  student_id: string;
  student_name: string;
  logs: DailyStudyLog[];
}

export interface CreateStudyLogPayload {
  student_id: string;
  batch_id: string;
  institute_id: string;
  title: string;
  description: string;
  log_date: string;
  attachment_url?: string;
}

export interface UpdateStudyLogPayload {
  title?: string;
  description?: string;
  attachment_url?: string;
}

export interface StudentAttendanceStats {
  student_id: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
  present_percentage: number;
  absent_percentage: number;
  late_percentage: number;
  leave_percentage: number;
  monthly_trend: AttendanceTrendPoint[];
  weekly_trend: AttendanceTrendPoint[];
}

/** Full batch info as used in student-facing views. Extends Batch with optional computed fields. */
export type StudentBatchInfo = Batch;

/** Dropdown option shape for the attendance session batch selector. */
export interface AttendanceBatchOption {
  id: string;
  name: string;
  course_name: string | null;
  label: string;
}

export interface StudentDashboardData {
  student: Student;
  batch: StudentBatchInfo | null;
  stats: StudentAttendanceStats;
  history: StudentAttendanceRecord[];
}

export interface ParentPortalChildSnapshot {
  student: Student;
  batch: StudentBatchInfo | null;
  stats: StudentAttendanceStats;
  history: StudentAttendanceRecord[];
  fees: StudentFee[];
  student_history: StudentHistory[];
  documents: StudentDocument[];
  courses: StudentCourse[];
  generated_at: string;
}

export interface ParentPortalChildSummary {
  student: Student;
  batch: StudentBatchInfo | null;
  attendance_percentage: number;
  total_sessions: number;
  pending_fees: number;
  courses_count: number;
  documents_count: number;
  remark_count: number;
  next_due_date: string | null;
}

export interface ParentPortalBootstrap {
  parent: Parent;
  children: Student[];
}

export interface AttendanceSummary {
  student_id: string;
  student_name: string;
  admission_no: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
}

export interface BulkAttendanceEntry {
  student_id: string;
  status: AttendanceStatus;
  notes?: string;
}

// ── Fee Management ────────────────────────────────────────────────────────────

export type FeeFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export type FeeStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "cheque" | "card";
export type FeeType = "tuition" | "admission" | "transport" | "exam" | "hostel" | "custom";
export type RecurringType = "one_time" | "monthly" | "quarterly" | "annual";

export interface FeeCategory {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FeeStructure {
  id: string;
  institute_id: string;
  category_id: string | null;
  name: string;
  fee_name?: string | null;
  fee_code?: string | null;
  fee_type?: FeeType | string | null;
  amount: number;
  frequency: FeeFrequency;
  academic_year: string;
  due_date?: string | null;
  installment_allowed?: boolean;
  late_fee?: number;
  recurring_type?: RecurringType | string;
  batch_id?: string | null;
  course_id?: string | null;
  installment_count?: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: FeeCategory;
}

export interface StudentFee {
  id: string;
  student_id: string;
  institute_id: string;
  fee_structure_id: string;
  parent_id?: string | null;
  assigned_by: string;
  original_amount: number;
  discount_amount: number;
  discount_reason: string | null;
  scholarship_amount?: number;
  concession_amount?: number;
  waiver_amount?: number;
  final_amount: number;
  /** Running sum of all confirmed payments — updated by `record_fee_payment` RPC. */
  paid_so_far: number;
  due_date: string;
  next_due_date?: string | null;
  bill_number?: string | null;
  installment_count?: number;
  fee_type?: string | null;
  status: FeeStatus;
  academic_year: string;
  created_at: string;
  updated_at: string;
  fee_structure?: FeeStructure;
  student?: Student;
  parent?: Parent;
  payments?: FeePayment[];
  installments?: FeeInstallment[];
}

export interface FeePayment {
  id: string;
  student_fee_id: string;
  student_id: string;
  institute_id: string;
  parent_id?: string | null;
  /** User who collected / recorded the payment (FK to users.id). */
  collected_by: string;
  amount: number;
  payment_method: PaymentMethod;
  /** ISO date string YYYY-MM-DD. */
  payment_date: string;
  transaction_ref: string | null;
  notes: string | null;
  /** Generated receipt number — non-null after the `record_fee_payment` RPC. */
  receipt_number: string | null;
  created_at: string;
  collector?: Pick<User, "id" | "name">;
}

export interface FeeReceipt {
  id: string;
  payment_id: string;
  institute_id: string;
  parent_id?: string | null;
  receipt_number: string;
  receipt_data: ReceiptData;
  generated_at: string;
  generated_by: string;
}

export interface ReceiptData {
  receipt_number: string;
  payment_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_ref: string | null;
  student_fee_id: string;
  student_id?: string;
  institute_id?: string;
  parent_id?: string | null;
  student_name?: string;
  parent_name?: string | null;
  fee_name?: string;
  fee_code?: string | null;
  amount_paid?: number;
  pending_balance?: number;
}

export interface RecordPaymentResult {
  payment_id: string;
  /** Generated receipt number, e.g. RCP-202501-00001. */
  receipt_number: string;
  new_status: FeeStatus;
  /** Balance remaining after this payment (INR). */
  remaining_amount: number;
}

export interface FeeInstallment {
  id: string;
  student_fee_id: string;
  institute_id: string;
  installment_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: FeeStatus;
  created_at: string;
  updated_at: string;
}

export interface FeeSummaryItem {
  student_fee: StudentFee;
  total_due: number;
  total_paid: number;
  remaining_due: number;
  next_due_date: string | null;
}

export interface ParentFeeSummary {
  parent: Parent;
  children: Array<{
    student: Student;
    fee_items: FeeSummaryItem[];
    total_due: number;
    total_paid: number;
    remaining_due: number;
  }>;
  total_due: number;
  total_paid: number;
  remaining_due: number;
}

export interface InstituteRevenueAnalytics {
  total_collected: number;
  total_pending: number;
  total_overdue: number;
  collection_this_month: number;
  fee_status_distribution: Record<FeeStatus, number>;
  monthly_revenue: Array<{ month: string; amount: number }>;
}

export interface RevenueStats {
  total_collected: number;
  total_pending: number;
  total_overdue: number;
  collection_this_month: number;
}

// ============================================================================
// LMS — Course Management & Learning System
// All types map directly to migration 011_course_lms_full.sql
// ============================================================================

// ── LMS Primitive Enums ──────────────────────────────────────────────────────

export type LmsDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type LmsVisibility = "public" | "institutional" | "private";
export type LmsPricing = "free" | "paid";
export type LmsCourseStatus = "draft" | "published" | "archived";
export type LmsLessonType = "video" | "pdf" | "text" | "quiz" | "assignment" | "live";
export type LmsEnrollStatus = "active" | "completed" | "dropped" | "suspended";
export type LmsQuizQType = "mcq" | "true_false" | "short_answer";
export type LmsAttemptStatus = "in_progress" | "submitted" | "graded";
export type LmsSubStatus = "submitted" | "graded" | "returned" | "late";

// ── lms_categories ───────────────────────────────────────────────────────────

export interface LmsCategory {
  id: string;
  institute_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── lms_courses ───────────────────────────────────────────────────────────────

export interface LmsCourse {
  id: string;
  institute_id: string;
  created_by: string;
  category_id: string | null;
  course_id?: string | null; // Link to academic course
  title: string;
  subtitle: string | null;
  description: string | null;
  slug: string;

  thumbnail_url: string | null;
  thumbnail_storage_path: string | null;
  intro_video_url: string | null;
  intro_video_storage_path: string | null;

  difficulty: LmsDifficulty;
  language: string;
  tags: string[];
  estimated_duration_mins: number;

  visibility: LmsVisibility;
  pricing: LmsPricing;
  price: number;

  total_modules: number;
  total_lessons: number;
  total_enrollments: number;
  total_completions: number;

  status: LmsCourseStatus;
  is_featured: boolean;
  published_at: string | null;

  prerequisites: string[];
  learning_outcomes: string[];

  created_at: string;
  updated_at: string;

  // optional joins
  category?: LmsCategory;
  creator?: { id: string; name: string; profile_image?: string | null };
}

// ── lms_modules ───────────────────────────────────────────────────────────────

export interface LmsModule {
  id: string;
  course_id: string;
  institute_id: string;
  title: string;
  description: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;

  // optional join
  lessons?: LmsLesson[];
}

// ── lms_lessons ───────────────────────────────────────────────────────────────

export interface LmsLesson {
  id: string;
  module_id: string;
  course_id: string;
  institute_id: string;

  title: string;
  description: string | null;
  lesson_type: LmsLessonType;
  position: number;

  is_preview: boolean;
  is_published: boolean;

  video_url: string | null;
  video_storage_path: string | null;
  video_duration_secs: number;

  content: string | null;

  created_at: string;
  updated_at: string;

  // optional joins
  materials?: LmsLessonMaterial[];
  progress?: LmsLessonProgress; // current student's progress
}

// ── lms_lesson_materials ──────────────────────────────────────────────────────

export interface LmsLessonMaterial {
  id: string;
  lesson_id: string;
  course_id: string;
  institute_id: string;
  uploaded_by: string;

  title: string;
  file_url: string;
  storage_path: string;
  file_type: string;
  file_size_bytes: number;
  is_downloadable: boolean;

  created_at: string;
}

// ── lms_enrollments ───────────────────────────────────────────────────────────

export interface LmsEnrollment {
  id: string;
  course_id: string;
  student_id: string;
  institute_id: string;
  enrolled_by: string | null;
  batch_id: string | null;

  status: LmsEnrollStatus;
  enrolled_at: string;
  completed_at: string | null;
  dropped_at: string | null;
  expires_at: string | null;

  created_at: string;
  updated_at: string;

  // optional joins
  course?: LmsCourse;
  student?: { id: string; name: string; profile_image?: string | null; email: string };
  progress?: LmsCourseProgress;
}

// ── lms_lesson_progress ───────────────────────────────────────────────────────

export interface LmsLessonProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  student_id: string;
  course_id: string;
  institute_id: string;

  is_completed: boolean;
  watch_seconds: number;
  last_position_secs: number;
  last_accessed_at: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
}

// ── lms_course_progress ───────────────────────────────────────────────────────

export interface LmsCourseProgress {
  enrollment_id: string;
  student_id: string;
  course_id: string;
  institute_id: string;

  completed_lessons: number;
  total_lessons: number;
  completion_pct: number; // 0.00 – 100.00
  total_watch_seconds: number;
  last_lesson_id: string | null;
  last_accessed_at: string | null;
  updated_at: string;
}

// ── lms_quizzes ───────────────────────────────────────────────────────────────

export interface LmsQuiz {
  id: string;
  course_id: string;
  lesson_id: string | null;
  institute_id: string;
  created_by: string;

  title: string;
  description: string | null;
  time_limit_mins: number | null;
  passing_score: number;
  max_attempts: number;
  shuffle_questions: boolean;
  show_answers: boolean;
  is_published: boolean;

  created_at: string;
  updated_at: string;

  // optional joins
  questions?: LmsQuizQuestion[];
}

// ── lms_quiz_questions ────────────────────────────────────────────────────────

export interface LmsQuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  question_type: LmsQuizQType;
  points: number;
  position: number;
  explanation: string | null;
  created_at: string;

  // optional joins
  choices?: LmsQuizChoice[];
}

// ── lms_quiz_choices ──────────────────────────────────────────────────────────

export interface LmsQuizChoice {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  position: number;
}

// ── lms_quiz_attempts ─────────────────────────────────────────────────────────

export interface LmsQuizAttempt {
  id: string;
  quiz_id: string;
  enrollment_id: string;
  student_id: string;
  institute_id: string;

  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  attempt_no: number;

  status: LmsAttemptStatus;
  started_at: string;
  submitted_at: string | null;

  created_at: string;

  // optional joins
  answers?: LmsQuizAttemptAnswer[];
}

// ── lms_quiz_attempt_answers ──────────────────────────────────────────────────

export interface LmsQuizAttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_choice_id: string | null;
  text_answer: string | null;
  is_correct: boolean;
  points_earned: number;
}

// ── lms_assignments ───────────────────────────────────────────────────────────

export interface LmsAssignment {
  id: string;
  course_id: string;
  lesson_id: string | null;
  institute_id: string;
  created_by: string;

  title: string;
  description: string | null;
  instructions: string | null;
  attachment_urls: string[];
  due_date: string | null;
  max_score: number;
  allow_late: boolean;
  is_published: boolean;
  accepted_file_types: string[];

  created_at: string;
  updated_at: string;

  // optional joins
  submission?: LmsAssignmentSubmission; // current student's submission
}

// ── lms_assignment_submissions ────────────────────────────────────────────────

export interface LmsAssignmentSubmission {
  id: string;
  assignment_id: string;
  enrollment_id: string;
  student_id: string;
  institute_id: string;

  file_urls: string[];
  storage_paths: string[];
  text_response: string | null;

  status: LmsSubStatus;
  submitted_at: string;
  is_late: boolean;

  grade: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;

  created_at: string;
  updated_at: string;

  // optional joins
  student?: { id: string; name: string; email: string };
}

// ── lms_certificates ──────────────────────────────────────────────────────────

export interface LmsCertificate {
  id: string;
  enrollment_id: string;
  student_id: string;
  course_id: string;
  institute_id: string;

  certificate_no: string;
  certificate_url: string | null;
  certificate_data: Record<string, unknown>;

  issued_at: string;
  expires_at: string | null;
}

// ── Compound / view types ─────────────────────────────────────────────────────

/** Full course with modules + lessons (used in player & editor) */
export interface LmsCourseWithCurriculum extends LmsCourse {
  modules: (LmsModule & { lessons: LmsLesson[] })[];
}

/** Enrollment with nested course + progress (used in student My-Learning) */
export interface LmsEnrollmentWithProgress extends Omit<LmsEnrollment, "progress"> {
  course: LmsCourse;
  progress: LmsCourseProgress | null;
}

/** Admin/staff analytics summary (returned by get_lms_course_analytics RPC) */
export interface LmsCourseAnalytics {
  total_enrollments: number;
  active_enrollments: number;
  completions: number;
  avg_completion_pct: number;
  avg_quiz_score: number;
  total_submissions: number;
}

// ── Payload types (used by forms / wizard) ────────────────────────────────────

export interface CreateCoursePayload {
  title: string;
  subtitle?: string;
  description?: string;
  category_id?: string;
  difficulty: LmsDifficulty;
  language: string;
  tags: string[];
  estimated_duration_mins: number;
  visibility: LmsVisibility;
  pricing: LmsPricing;
  price: number;
  prerequisites: string[];
  learning_outcomes: string[];
}

export interface CreateModulePayload {
  course_id: string;
  title: string;
  description?: string;
  position: number;
  is_published?: boolean;
}

export interface CreateLessonPayload {
  module_id: string;
  course_id: string;
  title: string;
  description?: string;
  lesson_type: LmsLessonType;
  position: number;
  is_preview: boolean;
  is_published?: boolean;
  content?: string;
}

export interface EnrollStudentsPayload {
  course_id: string;
  student_ids: string[];
  batch_id?: string;
}

export interface UpdateProgressPayload {
  enrollment_id: string;
  lesson_id: string;
  watch_seconds?: number;
  last_position_secs?: number;
  is_completed?: boolean;
}

export interface SubmitQuizPayload {
  quiz_id: string;
  enrollment_id: string;
  answers: { question_id: string; selected_choice_id?: string; text_answer?: string }[];
}

export interface SubmitAssignmentPayload {
  assignment_id: string;
  enrollment_id: string;
  file_urls?: string[];
  storage_paths?: string[];
  text_response?: string;
}

export interface GradeSubmissionPayload {
  submission_id: string;
  grade: number;
  feedback?: string;
}

// ── Security Events ───────────────────────────────────────────────────────────

export type SecurityEventType =
  | "failed_login"
  | "permission_denied"
  | "suspicious_upload"
  | "rate_limit"
  | "invalid_token";
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export interface SecurityEvent {
  id: string;
  institute_id: string | null;
  user_id: string | null;
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Schedule / Timetable ──────────────────────────────────────────────────────

export type ScheduleType = "regular" | "exam" | "break" | "lunch" | "event";
export type ScheduleStatus = "draft" | "published" | "archived";
export type ScheduleExceptionType = "holiday" | "cancelled" | "rescheduled" | "event";

export interface Subject {
  id: string;
  institute_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  institute_id: string;
  batch_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  batch?: Batch;
}

export interface Room {
  id: string;
  institute_id: string;
  room_name: string;
  capacity: number | null;
  building: string | null;
  floor: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  institute_id: string;
  batch_id: string;
  section_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  room_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  type: ScheduleType;
  status: ScheduleStatus;
  title: string | null;
  notes: string | null;
  week_label: string | null;
  created_at: string;
  updated_at: string;
  batch?: Batch;
  section?: Section;
  subject?: Subject;
  teacher?: Staff;
  room?: Room;
}

export interface ScheduleException {
  id: string;
  institute_id: string;
  batch_id: string | null;
  schedule_id: string | null;
  exception_date: string;
  type: ScheduleExceptionType;
  title: string;
  description: string | null;
  replacement_start: string | null;
  replacement_end: string | null;
  is_all_day: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleConflict {
  type: "teacher" | "room" | "batch" | "invalid_time";
  schedule_id?: string;
  message: string;
}

export interface CreateSchedulePayload {
  institute_id: string;
  batch_id: string;
  section_id?: string | null;
  subject_id?: string | null;
  teacher_id?: string | null;
  room_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  type?: ScheduleType;
  status?: ScheduleStatus;
  title?: string | null;
  notes?: string | null;
  week_label?: string | null;
}

export interface UpdateSchedulePayload {
  batch_id?: string;
  section_id?: string | null;
  subject_id?: string | null;
  teacher_id?: string | null;
  room_id?: string | null;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  type?: ScheduleType;
  status?: ScheduleStatus;
  title?: string | null;
  notes?: string | null;
  week_label?: string | null;
}

export interface ScheduleFilters {
  batchId?: string;
  sectionId?: string;
  teacherId?: string;
  subjectId?: string;
  roomId?: string;
  dayOfWeek?: number;
  status?: ScheduleStatus;
  type?: ScheduleType;
  search?: string;
}

export interface CreateSubjectPayload {
  institute_id: string;
  name: string;
  code?: string;
  description?: string;
}

export interface CreateRoomPayload {
  institute_id: string;
  room_name: string;
  capacity?: number;
  building?: string;
  floor?: string;
}

export interface CreateSectionPayload {
  institute_id: string;
  batch_id: string;
  name: string;
}

export interface CreateScheduleExceptionPayload {
  institute_id: string;
  batch_id?: string | null;
  schedule_id?: string | null;
  exception_date: string;
  type: ScheduleExceptionType;
  title: string;
  description?: string;
  replacement_start?: string;
  replacement_end?: string;
  is_all_day?: boolean;
}

// ── Analytics & Reporting ─────────────────────────────────────────────────────

export interface AnalyticsFilters {
  instituteId: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AnalyticsCountBlock {
  total: number;
  active?: number;
}

export interface InstituteAnalyticsOverview {
  students: AnalyticsCountBlock;
  staff: AnalyticsCountBlock & { assignments?: number };
  parents: AnalyticsCountBlock;
  batches: AnalyticsCountBlock;
  attendance: {
    total_records: number;
    present_or_late: number;
    rate: number;
  };
  fees: {
    collected_in_range: number;
    pending: number;
    overdue: number;
  };
  schedules: {
    published: number;
    draft: number;
    exam_slots: number;
  };
  courses: { enrollments_active: number };
}

export interface AnalyticsTrendPoint {
  date?: string;
  period?: string;
  label: string;
  present?: number;
  absent?: number;
  late?: number;
  leave?: number;
  total?: number;
  percentage?: number;
  amount?: number;
  month?: string;
}

export interface BatchAttendanceAnalytics {
  batch_id: string;
  batch_name: string;
  total: number;
  present: number;
  rate: number;
}

export interface InstituteAttendanceAnalytics {
  daily_trend: AnalyticsTrendPoint[];
  batch_breakdown: BatchAttendanceAnalytics[];
  status_distribution: Record<string, number>;
}

export interface InstituteFeeAnalytics {
  status_distribution: Record<string, number>;
  monthly_revenue: AnalyticsTrendPoint[];
  totals: {
    collected: number;
    pending: number;
    overdue: number;
  };
}

export interface TeacherWorkloadRow {
  staff_id: string;
  name: string;
  slots: number;
}

export interface InstituteScheduleAnalytics {
  by_type: Record<string, number>;
  teacher_workload: TeacherWorkloadRow[];
}

export interface StudentCourseAnalyticsRow {
  course_name: string;
  status: string;
  enrolled_at: string;
}

export interface StudentAnalyticsBundle {
  student_id: string;
  attendance: {
    total: number;
    present_or_late: number;
    rate: number;
    weekly_trend: AnalyticsTrendPoint[];
  };
  courses: StudentCourseAnalyticsRow[];
  fees: {
    total_due: number;
    total_paid: number;
    pending_count: number;
  };
  insights: string[];
}

export interface InstituteAnalyticsBundle {
  overview: InstituteAnalyticsOverview;
  attendance: InstituteAttendanceAnalytics;
  fees: InstituteFeeAnalytics;
  schedule: InstituteScheduleAnalytics;
}

// ── Teacher students (staff portal) ───────────────────────────────────────────

export type TeacherStudentPerformanceStatus =
  | "excellent"
  | "good"
  | "needs_attention"
  | "unknown";

export interface TeacherStudentListItem {
  id: string;
  admission_no: string;
  status: StudentStatus;
  batch_id: string | null;
  batch_name: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  attendance_rate: number;
  performance_status: TeacherStudentPerformanceStatus;
  emergency_contact?: EmergencyContact | null;
  created_at: string;
}

export interface TeacherStudentsFilters {
  search?: string;
  batchId?: string | null;
  status?: StudentStatus | null;
  attendanceBand?: "all" | "high" | "medium" | "low";
  performance?: TeacherStudentPerformanceStatus | "all";
}

export interface TeacherStudentsListResponse {
  items: TeacherStudentListItem[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// ── Assignment Management System ──────────────────────────────────────────────

export type AssignmentStatus = "draft" | "published" | "archived";
export type SubmissionStatus = "pending" | "submitted" | "late" | "reviewed" | "graded";

export interface Assignment {
  id: string;
  institute_id: string;
  created_by: string;
  title: string;
  description: string | null;
  instructions: string | null;
  total_marks: number;
  due_date: string | null;
  status: AssignmentStatus;
  allow_late: boolean;
  created_at: string;
  updated_at: string;
  
  // Joined/Computed
  resources?: AssignmentResource[];
  assignees_count?: number;
  submissions_count?: number;
}

export interface AssignmentResource {
  id: string;
  assignment_id: string;
  institute_id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  institute_id: string;
  content: string | null;
  status: SubmissionStatus;
  submitted_at: string;
  is_late: boolean;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
  graded_by: string | null;
  
  // Joined
  assignment?: Assignment;
  student?: Student;
  files?: SubmissionFile[];
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  institute_id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}

export interface CreateAssignmentPayload {
  title: string;
  description?: string;
  instructions?: string;
  total_marks?: number;
  due_date?: string | null;
  status?: AssignmentStatus;
  allow_late?: boolean;
}

