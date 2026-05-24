// ---------------------------------------------------------------------------
// EduOS — RecordPaymentModal
//
// A focused modal for recording a payment against a student fee assignment.
// Delegates persistence to the `recordPayment` service which calls the
// `record_fee_payment` Postgres RPC — the server updates paid_so_far,
// recalculates the fee status, and generates a sequential receipt number.
//
// Sections:
//  1. Fee summary card  — original amount, discount, final, paid, remaining
//  2. Payment form      — amount, method, date, ref, notes
//  3. Success state     — receipt number confirmation in green
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  X,
  Loader2,
  CheckCircle2,
  IndianRupee,
  CreditCard,
  CalendarDays,
  FileText,
} from "lucide-react";

import { recordPaymentSchema, type RecordPaymentSchema } from "@/modules/fees/validations";
import { recordPayment } from "@/services/fee.service";
import type { StudentFee, RecordPaymentResult } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number as Indian rupees: ₹1,00,000 */
function inr(amount?: number | null) {
  const n = Number(amount ?? 0) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Return today's date as YYYY-MM-DD for the date input's default value. */
function todayIso() {
  return new Date().toISOString().split("T")[0];
}

// ── Shared input style ────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

// ── Props ─────────────────────────────────────────────────────────────────────

interface RecordPaymentModalProps {
  /** The student fee assignment to pay against. */
  studentFee: StudentFee;
  /** Controls modal open/close. */
  isOpen: boolean;
  /** Called when the modal should close. */
  onClose: () => void;
  /** Called with the RPC result after a successful payment. */
  onSuccess: (result: RecordPaymentResult) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `RecordPaymentModal` — dialog to record an incoming fee payment.
 *
 * Shows a fee summary card at the top so the staff member can confirm the
 * amounts before submitting.  On success it reveals a green confirmation
 * panel with the generated receipt number.
 */
export function RecordPaymentModal({
  studentFee,
  isOpen,
  onClose,
  onSuccess,
}: RecordPaymentModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<RecordPaymentResult | null>(null);

  const finalAmt = Number(studentFee.final_amount ?? 0);
  const paidSoFar = Number(studentFee.paid_so_far ?? 0);
  const remainingDue = Math.max(0, finalAmt - paidSoFar);
  const feeName = studentFee.fee_structure?.fee_name ?? studentFee.fee_structure?.name ?? "Fee";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentSchema>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: remainingDue,
      payment_method: "cash",
      payment_date: todayIso(),
      transaction_ref: "",
      notes: "",
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function onSubmit(values: RecordPaymentSchema) {
    setServerError(null);

    const result = await recordPayment({
      student_fee_id: studentFee.id,
      amount: values.amount,
      payment_method: values.payment_method,
      payment_date: values.payment_date,
      transaction_ref: values.transaction_ref || undefined,
      notes: values.notes || undefined,
    });

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to record payment. Please try again.");
      return;
    }

    setReceipt(result.data);
    onSuccess(result.data);
  }

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setReceipt(null);
    setServerError(null);
    onClose();
  }

  // ── Guard ────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card border border-border shadow-xl overflow-hidden"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="record-payment-title" className="text-sm font-semibold text-foreground">
                Record Payment
              </h2>
              <p className="text-xs text-muted-foreground truncate max-w-60">{feeName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-5 space-y-5">
          {/* ── Success state ────────────────────────────────────────────── */}
          {receipt ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2
                  className="h-7 w-7 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Payment Recorded!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receipt number generated successfully.
                </p>
              </div>
              {/* Receipt number chip */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="font-mono text-sm font-semibold text-foreground">
                  {receipt.receipt_number}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>
                  Remaining due:{" "}
                  <span
                    className={
                      Number(receipt.remaining_amount ?? 0) > 0
                        ? "font-medium text-destructive"
                        : "font-medium text-green-600 dark:text-green-400"
                    }
                  >
                    {inr(receipt.remaining_amount)}
                  </span>
                </p>
                <p>
                  New status:{" "}
                  <span className="font-medium capitalize text-foreground">
                    {receipt.new_status}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Fee summary card ────────────────────────────────────── */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fee Summary
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Fee Type</span>
                  <span className="font-medium text-foreground text-right">{feeName}</span>

                  <span className="text-muted-foreground">Original Amount</span>
                  <span className="font-medium text-foreground text-right">
                    {inr(studentFee.original_amount)}
                  </span>

                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-foreground text-right">
                    {inr(studentFee.discount_amount)}
                  </span>

                  <span className="text-muted-foreground">Final Amount</span>
                  <span className="font-medium text-foreground text-right">
                    {inr(studentFee.final_amount)}
                  </span>

                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="font-medium text-green-600 dark:text-green-400 text-right">
                    {inr(studentFee.paid_so_far)}
                  </span>

                  <span className="font-semibold text-foreground">Remaining Due</span>
                  <span
                    className={`font-bold text-right ${
                      remainingDue > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {inr(remainingDue)}
                  </span>
                </div>
              </div>

              {/* ── Server error ─────────────────────────────────────────── */}
              {serverError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {serverError}
                </div>
              )}

              {/* ── Payment form ─────────────────────────────────────────── */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {/* Amount */}
                <div>
                  <label htmlFor="pay-amount" className={LABEL_CLASS}>
                    Amount
                    <span className="text-destructive ml-1" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <div className="relative">
                    <IndianRupee
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={remainingDue}
                      placeholder="Enter amount"
                      {...register("amount", { valueAsNumber: true })}
                      className={`${INPUT_CLASS} pl-9`}
                    />
                  </div>
                  {errors.amount && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.amount.message}
                    </p>
                  )}
                </div>

                {/* Payment Method */}
                <div>
                  <label htmlFor="pay-method" className={LABEL_CLASS}>
                    Payment Method
                    <span className="text-destructive ml-1" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <select id="pay-method" {...register("payment_method")} className={INPUT_CLASS}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                  {errors.payment_method && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.payment_method.message}
                    </p>
                  )}
                </div>

                {/* Payment Date */}
                <div>
                  <label htmlFor="pay-date" className={LABEL_CLASS}>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      Payment Date
                    </span>
                    <span className="text-destructive ml-1" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="pay-date"
                    type="date"
                    {...register("payment_date")}
                    className={INPUT_CLASS}
                  />
                  {errors.payment_date && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.payment_date.message}
                    </p>
                  )}
                </div>

                {/* Transaction Reference (optional) */}
                <div>
                  <label htmlFor="pay-ref" className={LABEL_CLASS}>
                    Transaction Reference
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="pay-ref"
                    type="text"
                    placeholder="UPI ID, cheque number, etc."
                    {...register("transaction_ref")}
                    className={INPUT_CLASS}
                  />
                  {errors.transaction_ref && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.transaction_ref.message}
                    </p>
                  )}
                </div>

                {/* Notes (optional) */}
                <div>
                  <label htmlFor="pay-notes" className={LABEL_CLASS}>
                    Notes
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="pay-notes"
                    rows={3}
                    placeholder="Any additional notes about this payment…"
                    {...register("notes")}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                  {errors.notes && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errors.notes.message}
                    </p>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || remainingDue === 0}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    {isSubmitting ? "Recording…" : "Record Payment"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
