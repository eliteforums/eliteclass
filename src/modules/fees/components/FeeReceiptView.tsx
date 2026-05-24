// ---------------------------------------------------------------------------
// EduOS — FeeReceiptView
//
// A printable fee payment receipt component.
// Designed for both screen display (inside a modal) and physical printing.
//
// Print behaviour:
//  - Uses Tailwind `print:` utilities to hide the action buttons and adjust
//    layout so only the receipt content appears on the printed page.
//  - Calls `window.print()` to trigger the browser's native print dialog.
//
// Layout:
//  ┌──────────────────────────────────────┐
//  │  Institute Name                      │
//  │  PAYMENT RECEIPT                     │
//  │  Receipt No: RCP-202501-00001        │
//  ├──────────────────────────────────────┤
//  │  Student: Ravi Kumar                 │
//  │  Admission No: 1001                  │
//  │  Date: 15 Jan 2025                   │
//  ├──────────────────────────────────────┤
//  │  Fee Type: Tuition Fee               │
//  │  Original Amount: ₹10,000            │
//  │  Discount: ₹0                        │
//  │  Amount Paid: ₹10,000                │
//  │  Payment Method: UPI                 │
//  │  Transaction Ref: UPI123456          │
//  ├──────────────────────────────────────┤
//  │  [Print]  [Close]                    │
//  └──────────────────────────────────────┘
// ---------------------------------------------------------------------------

import { Printer } from "lucide-react";

import type { FeePayment, StudentFee } from "@/types";
import { formatDate } from "@/utils/helpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number as Indian rupees: ₹1,00,000 */
function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

type PaymentMethod = FeePayment["payment_method"];

/** Map a payment_method enum value to a human-readable label. */
function paymentMethodLabel(method: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    cash: "Cash",
    upi: "UPI",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    card: "Card",
  };
  return map[method] ?? method;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Horizontal divider between receipt sections. */
function Divider() {
  return <hr className="border-dashed border-border my-4 print:border-gray-300" />;
}

/** A label/value row inside the receipt. */
function ReceiptRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className="text-sm text-muted-foreground print:text-gray-500 shrink-0">{label}</span>
      <span
        className={`text-sm text-right text-foreground print:text-gray-900 ${
          bold ? "font-semibold" : "font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FeeReceiptViewProps {
  /** The fee payment row to display. */
  payment: FeePayment;
  /** The parent student fee assignment — provides fee-level amounts. */
  studentFee: StudentFee;
  /** Display name of the student (e.g. from users.name). */
  studentName: string;
  /** Display name of the institute shown in the receipt header. */
  instituteName: string;
  /** Human-readable receipt number (e.g. RCP-202501-00001). */
  receiptNumber: string;
  /** Optional — called when the Close button is clicked. */
  onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `FeeReceiptView` — screen + print receipt for a single fee payment.
 *
 * Renders a styled receipt card that looks clean on screen and collapses
 * to a compact, border-framed layout when printed.
 *
 * @example
 * ```tsx
 * <FeeReceiptView
 *   payment={payment}
 *   studentFee={studentFee}
 *   studentName="Ravi Kumar"
 *   instituteName="Sunrise Academy"
 *   receiptNumber="RCP-202501-00001"
 *   onClose={() => setReceiptOpen(false)}
 * />
 * ```
 */
export function FeeReceiptView({
  payment,
  studentFee,
  studentName,
  instituteName,
  receiptNumber,
  onClose,
}: FeeReceiptViewProps) {
  const admissionNo = studentFee.student?.admission_no ?? "—";
  const feeName = studentFee.fee_structure?.fee_name ?? studentFee.fee_structure?.name ?? "Fee";

  return (
    <div className="w-full max-w-md mx-auto print:max-w-none print:mx-0">
      {/* ── Receipt card ──────────────────────────────────────────────────── */}
      <div
        className="
          rounded-2xl border border-border bg-card shadow-md overflow-hidden
          print:rounded-none print:border print:border-gray-300 print:shadow-none
        "
      >
        {/* ── Header: institute + receipt title ─────────────────────────── */}
        <div
          className="
            bg-primary px-6 py-5 text-primary-foreground
            print:bg-white print:text-gray-900 print:border-b print:border-gray-300
          "
        >
          <p className="text-lg font-bold leading-tight tracking-tight">{instituteName}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] opacity-80 print:opacity-60">
            Payment Receipt
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="
                rounded-full border border-primary-foreground/30 bg-primary-foreground/10
                px-2.5 py-0.5 font-mono text-xs font-semibold
                print:border-gray-400 print:bg-transparent print:text-gray-900
              "
            >
              {receiptNumber}
            </span>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-1">
          {/* Student info */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-2">
            Student Details
          </p>
          <ReceiptRow label="Student" value={studentName} />
          <ReceiptRow label="Admission No" value={admissionNo} />
          <ReceiptRow label="Date" value={formatDate(payment.payment_date)} />

          <Divider />

          {/* Fee info */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-2">
            Payment Details
          </p>
          <ReceiptRow label="Fee Type" value={feeName} />
          <ReceiptRow label="Original Amount" value={inr(studentFee.original_amount)} />
          <ReceiptRow label="Discount" value={inr(studentFee.discount_amount)} />

          <Divider />

          <ReceiptRow label="Amount Paid" value={inr(payment.amount)} bold />
          <ReceiptRow label="Payment Method" value={paymentMethodLabel(payment.payment_method)} />
          {payment.transaction_ref && (
            <ReceiptRow label="Transaction Ref" value={payment.transaction_ref} />
          )}
          {payment.notes && <ReceiptRow label="Notes" value={payment.notes} />}

          <Divider />

          {/* Balance info */}
          <ReceiptRow label="Total Fee" value={inr(studentFee.final_amount)} />
          <ReceiptRow label="Total Paid So Far" value={inr(studentFee.paid_so_far)} />
          <ReceiptRow
            label="Balance Remaining"
            value={inr(Math.max(0, studentFee.final_amount - studentFee.paid_so_far))}
            bold
          />
        </div>

        {/* ── Footer: print disclaimer ─────────────────────────────────────── */}
        <div className="border-t border-border px-6 py-3 bg-muted/30 print:bg-transparent print:border-gray-300">
          <p className="text-center text-xs text-muted-foreground print:text-gray-500">
            This is a computer-generated receipt and does not require a signature.
          </p>
        </div>
      </div>

      {/* ── Action buttons — hidden in print mode ─────────────────────────── */}
      <div className="mt-4 flex items-center justify-end gap-2 print:hidden">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Close
          </button>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print Receipt
        </button>
      </div>
    </div>
  );
}
