-- ============================================================
-- EduOS Migration 035 — Fix fee receipt number race condition
-- ============================================================
--
-- Purpose:
--   Make fee receipt generation concurrency-safe without changing the
--   existing UI or payment flow.
--
-- What it does:
--   1. Replaces generate_receipt_number() with a PostgreSQL sequence-
--      backed, atomic generator.
--   2. Replaces record_fee_payment() with a small retry loop so a rare
--      duplicate-key failure is regenerated automatically.
--
-- Notes:
--   - Preserves the existing receipt format: RCP-YYYYMM-000001
--   - Keeps the unique constraint on fee_payments.receipt_number intact
--   - Repairs only missing receipt numbers, without changing valid existing ones
-- ============================================================

-- Helper state: single PostgreSQL sequence for global uniqueness.
CREATE SEQUENCE IF NOT EXISTS public.fee_receipt_sequence
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

-- Backfill sequence to the highest existing receipt suffix so old data is
-- preserved and the next generated receipt never reuses a value.
DO $$
DECLARE
  v_max_receipt_no BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(receipt_number, '^RCP-[0-9]{6}-([0-9]+)$'))[1]::BIGINT),
    0
  )
  INTO v_max_receipt_no
  FROM public.fee_payments
  WHERE receipt_number ~ '^RCP-[0-9]{6}-[0-9]+$';

  IF v_max_receipt_no > 0 THEN
    PERFORM setval('public.fee_receipt_sequence', v_max_receipt_no, true);
  ELSE
    PERFORM setval('public.fee_receipt_sequence', 1, false);
  END IF;
END $$;

-- Helper: generate the next available receipt number for an institute.
-- Uses a PostgreSQL sequence, which is atomic and safe under concurrency.
CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_institute_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_value BIGINT;
  v_receipt_no     TEXT;
BEGIN
  v_sequence_value := nextval('public.fee_receipt_sequence');
  v_receipt_no := 'RCP-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(v_sequence_value::text, 6, '0');
  RAISE NOTICE 'Generated receipt number %, sequence %, institute %', v_receipt_no, v_sequence_value, p_institute_id;
  RETURN v_receipt_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID) TO authenticated;

-- Backfill any missing receipt numbers safely before enforcing NOT NULL.
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT id, institute_id
    FROM public.fee_payments
    WHERE receipt_number IS NULL OR btrim(receipt_number) = ''
    ORDER BY created_at, id
  LOOP
    UPDATE public.fee_payments
    SET receipt_number = public.generate_receipt_number(v_row.institute_id)
    WHERE id = v_row.id;
  END LOOP;
END $$;

-- Enforce non-null receipt numbers for all future and existing payments.
ALTER TABLE public.fee_payments
  ALTER COLUMN receipt_number SET NOT NULL;

-- Atomic fee payment processing with retry protection for receipt collisions.
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_fee_id  UUID,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_date    DATE,
  p_transaction_ref TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  user_role;
  v_institute_id UUID;
  v_student_id   UUID;
  v_final_amount NUMERIC;
  v_paid_so_far  NUMERIC;
  v_remaining    NUMERIC;
  v_new_status   TEXT;
  v_receipt_no   TEXT;
  v_sequence_no  BIGINT;
  v_payment_id   UUID;
  v_attempt      INTEGER;
BEGIN
  -- 1) Verify caller is allowed to record payments.
  SELECT role, institute_id
  INTO   v_caller_role, v_institute_id
  FROM   public.users
  WHERE  id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'PAYMENT_FORBIDDEN: Only admins can record payments.';
  END IF;

  -- 2) Retrieve fee details and confirm institute ownership.
  SELECT final_amount, student_id
  INTO   v_final_amount, v_student_id
  FROM   public.student_fees
  WHERE  id = p_student_fee_id
    AND  institute_id = v_institute_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Fee record not found or does not belong to your institute.';
  END IF;

  -- 3) Calculate amount already paid.
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_paid_so_far
  FROM   public.fee_payments
  WHERE  student_fee_id = p_student_fee_id;

  v_remaining := v_final_amount - v_paid_so_far;

  -- 4) Reject over-payments.
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'PAYMENT_OVERFLOW: Payment amount (%) exceeds remaining due (%).',
      p_amount, v_remaining;
  END IF;

  -- 5-10) Generate receipt and write payment/receipt with retry.
  FOR v_attempt IN 1..3 LOOP
    BEGIN
    v_receipt_no := public.generate_receipt_number(v_institute_id);
    v_sequence_no := split_part(v_receipt_no, '-', 3)::BIGINT;

    INSERT INTO public.fee_payments (
      student_fee_id,
      student_id,
      institute_id,
      collected_by,
      amount,
      payment_method,
      payment_date,
      transaction_ref,
      notes,
      receipt_number
    ) VALUES (
      p_student_fee_id,
      v_student_id,
      v_institute_id,
      auth.uid(),
      p_amount,
      p_payment_method,
      p_payment_date,
      p_transaction_ref,
      p_notes,
      v_receipt_no
    )
    RETURNING id INTO v_payment_id;

    v_new_status := CASE
      WHEN (v_paid_so_far + p_amount) >= v_final_amount THEN 'paid'
      ELSE 'partial'
    END;

    UPDATE public.student_fees
    SET    status     = v_new_status,
           updated_at = NOW()
    WHERE  id = p_student_fee_id;

    INSERT INTO public.fee_receipts (
      payment_id,
      institute_id,
      receipt_number,
      receipt_data,
      generated_by
    ) VALUES (
      v_payment_id,
      v_institute_id,
      v_receipt_no,
      jsonb_build_object(
        'receipt_number', v_receipt_no,
        'payment_id',     v_payment_id,
        'amount',         p_amount,
        'payment_method', p_payment_method,
        'payment_date',   p_payment_date,
        'transaction_ref', p_transaction_ref,
        'student_fee_id', p_student_fee_id
      ),
      auth.uid()
    );

      EXIT;

    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 3 THEN
          RAISE EXCEPTION 'RECEIPT_NUMBER_CONFLICT: Failed to generate a unique receipt number after % attempts (last tried %).',
            v_attempt,
            v_receipt_no;
        END IF;

        RAISE NOTICE 'Receipt collision detected for institute %, receipt %, sequence %, retrying (attempt %)'
          , v_institute_id, v_receipt_no, v_sequence_no, v_attempt;
        PERFORM pg_sleep(0.05 * v_attempt);
    END;
  END LOOP;

  -- 9) Activity log (logging failure must never abort the payment)
  BEGIN
    INSERT INTO public.activity_logs (
      institute_id,
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_institute_id,
      auth.uid(),
      'fee.payment_recorded',
      'fee_payment',
      v_payment_id,
      jsonb_build_object(
        'amount',  p_amount,
        'receipt', v_receipt_no
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 10) Return success payload.
  RETURN json_build_object(
    'payment_id',     v_payment_id,
    'receipt_number', v_receipt_no,
    'new_status',     v_new_status,
    'remaining_due',  GREATEST(0, v_remaining - p_amount)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT) TO authenticated;
