// ---------------------------------------------------------------------------
// EduOS — Receipt Service
//
// Dedicated entrypoint for receipt retrieval and printable receipt data.
// Delegates to fee.service.ts to avoid duplicating the underlying queries.
// ---------------------------------------------------------------------------

export { generateReceipt, getPaymentHistory } from "./fee.service";
