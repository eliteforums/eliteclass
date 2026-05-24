// ---------------------------------------------------------------------------
// EduOS — Services barrel
//
// Import services like:
//   import { signIn, signOut } from '@/services';
//   import { getStudentsByInstitute } from '@/services';
//
// Or import directly from the specific module when tree-shaking matters:
//   import { signIn } from '@/services/auth.service';
//
// NOTE: getBatchesByInstitute is defined in batch.service and re-exported by
// student.service.  To avoid a duplicate-export TS error, only batch.service
// is included here for that function.
// ---------------------------------------------------------------------------

export * from "./attendance.service";
export * from "./auth.service";
export * from "./batch.service";
export * from "./fee.service";
export * from "./billing.service";
export * from "./receipt.service";
export * from "./institute.service";
export * from "./parent.service";
export * from "./security.service";
export * from "./staff.service";
export * from "./schedule.service";
export * from "./analytics.service";
export * from "./teacherStudents.service";
// student.service re-exports getBatchesByInstitute from batch.service.
// Export only the unique symbols from student.service to avoid collision.
export {
  getStudentsByInstitute,
  getStudentById,
  getStudentByUserId,
  getStudentsByParentId,
  searchStudents,
  getStudentHistory,
  getStudentWithParents,
  getCurrentStudentDashboard,
  createStudent,
  updateStudent,
  archiveStudent,
  restoreStudent,
  admitStudent,
  resetStudentPassword,
  addStudentRemark,
  performLifecycleAction,
  getStudentPromotions,
  getStudentDocuments,
  deleteStudentDocument,
} from "./student.service";
