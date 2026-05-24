// ---------------------------------------------------------------------------
// EduOS — Billing Service
//
// Aggregated billing and analytics helpers used by dashboards and admin UI.
// The implementation delegates to fee.service.ts so fee logic remains in one
// place while the public service boundary stays ergonomic.
// ---------------------------------------------------------------------------

export {
  getInstituteRevenueAnalytics,
  getParentFeeSummary,
  getStudentFees,
  getPendingDues,
  getInstituteStudentFees,
  getFeeInstallments,
  getFeeStructures,
} from "./fee.service";
