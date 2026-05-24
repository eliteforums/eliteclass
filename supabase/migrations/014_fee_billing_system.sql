-- ============================================================================
-- EduOS Migration 014 — Fee & Billing System Expansion
-- ============================================================================
--
-- This migration upgrades the existing fee stack into a full ERP billing model:
--   - fee_structures: richer metadata for templates and batch/course scoping
--   - student_fees: parent linkage, concessions, waivers, installment metadata
--   - fee_installments: schedule rows for installment-aware billing
--   - fee_payments / fee_receipts: parent linkage for fast parent visibility
--   - RLS and helper functions for institute / parent isolation
--
-- The existing fee tables from migration 005 are preserved and expanded so
-- existing dashboards keep working while the new relations become available.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Schema expansion
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS fee_name TEXT,
  ADD COLUMN IF NOT EXISTS fee_code TEXT,
  ADD COLUMN IF NOT EXISTS fee_type TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS installment_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_type TEXT NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_id UUID,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.student_fees
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scholarship_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concession_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_due_date DATE,
  ADD COLUMN IF NOT EXISTS bill_number TEXT,
  ADD COLUMN IF NOT EXISTS fee_type TEXT;

ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL;

ALTER TABLE public.fee_receipts
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.fee_installments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id   UUID          NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  institute_id     UUID          NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  installment_no   INTEGER       NOT NULL,
  due_date         DATE          NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status           TEXT          NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(student_fee_id, installment_no)
);

-- Backfill templates and assignment rows where possible.
UPDATE public.fee_structures
SET
  fee_name = COALESCE(fee_name, name),
  fee_code = COALESCE(fee_code, UPPER(REPLACE(name, ' ', '_'))),
  fee_type = COALESCE(fee_type, COALESCE(name, 'custom')),
  recurring_type = COALESCE(recurring_type, frequency),
  installment_count = CASE
    WHEN installment_count IS NULL OR installment_count < 1 THEN 1
    WHEN frequency = 'monthly' THEN GREATEST(installment_count, 12)
    WHEN frequency = 'quarterly' THEN GREATEST(installment_count, 4)
    ELSE GREATEST(installment_count, 1)
  END;

UPDATE public.student_fees sf
SET
  fee_type = COALESCE(sf.fee_type, fs.fee_type, fs.name),
  parent_id = COALESCE(
    sf.parent_id,
    (
      SELECT sp.parent_id
      FROM public.student_parents sp
      WHERE sp.student_id = sf.student_id
      ORDER BY sp.parent_id ASC
      LIMIT 1
    )
  ),
  installment_count = COALESCE(sf.installment_count, fs.installment_count, 1),
  next_due_date = COALESCE(sf.next_due_date, sf.due_date),
  bill_number = COALESCE(sf.bill_number, 'BILL-' || substr(sf.id::text, 1, 8))
FROM public.fee_structures fs
WHERE fs.id = sf.fee_structure_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Constraints / indexes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_structures
  DROP CONSTRAINT IF EXISTS fee_structures_late_fee_nonnegative;

ALTER TABLE public.fee_structures
  ADD CONSTRAINT fee_structures_late_fee_nonnegative CHECK (late_fee >= 0);

ALTER TABLE public.student_fees
  DROP CONSTRAINT IF EXISTS student_fees_adjustments_nonnegative;

ALTER TABLE public.student_fees
  ADD CONSTRAINT student_fees_adjustments_nonnegative CHECK (
    scholarship_amount >= 0 AND concession_amount >= 0 AND waiver_amount >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_structures_institute_fee_code
  ON public.fee_structures(institute_id, fee_code)
  WHERE fee_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_structures_batch_id ON public.fee_structures(batch_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_course_id ON public.fee_structures(course_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_fee_type ON public.fee_structures(fee_type);

CREATE INDEX IF NOT EXISTS idx_student_fees_parent_id ON public.student_fees(parent_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_bill_number ON public.student_fees(bill_number);
CREATE INDEX IF NOT EXISTS idx_student_fees_next_due_date ON public.student_fees(next_due_date);
CREATE INDEX IF NOT EXISTS idx_student_fees_fee_type ON public.student_fees(fee_type);

CREATE INDEX IF NOT EXISTS idx_fee_payments_parent_id ON public.fee_payments(parent_id);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_parent_id ON public.fee_receipts(parent_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_student_fee_id ON public.fee_installments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_institute_id ON public.fee_installments(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_due_date ON public.fee_installments(due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Helper functions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_primary_parent_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.parent_id
  FROM public.student_parents sp
  WHERE sp.student_id = p_student_id
  ORDER BY sp.parent_id ASC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_primary_parent_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_fee_installment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_amount >= NEW.amount THEN
    NEW.status := 'paid';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'pending';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_installments_sync_status ON public.fee_installments;
CREATE TRIGGER fee_installments_sync_status
  BEFORE INSERT OR UPDATE ON public.fee_installments
  FOR EACH ROW EXECUTE FUNCTION public.sync_fee_installment_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Installment schedule generator
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_fee_installments(
  p_student_fee_id UUID,
  p_total_amount NUMERIC,
  p_due_date DATE,
  p_installment_count INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC := p_total_amount;
  v_installment_amount NUMERIC;
  v_i INTEGER;
  v_installments INTEGER := GREATEST(COALESCE(p_installment_count, 1), 1);
BEGIN
  DELETE FROM public.fee_installments WHERE student_fee_id = p_student_fee_id;

  IF v_installments = 1 THEN
    INSERT INTO public.fee_installments (student_fee_id, institute_id, installment_no, due_date, amount)
    SELECT id, institute_id, 1, p_due_date, p_total_amount
    FROM public.student_fees
    WHERE id = p_student_fee_id;
    RETURN;
  END IF;

  v_installment_amount := ROUND(p_total_amount / v_installments, 2);

  FOR v_i IN 1..v_installments LOOP
    IF v_i = v_installments THEN
      v_installment_amount := v_remaining;
    END IF;

    INSERT INTO public.fee_installments (student_fee_id, institute_id, installment_no, due_date, amount)
    SELECT
      sf.id,
      sf.institute_id,
      v_i,
      (p_due_date + ((v_i - 1) * INTERVAL '30 days'))::date,
      GREATEST(v_installment_amount, 0)
    FROM public.student_fees sf
    WHERE sf.id = p_student_fee_id;

    v_remaining := GREATEST(v_remaining - v_installment_amount, 0);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fee_installments(UUID, NUMERIC, DATE, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS policies for parent visibility
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "admin_institute_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "parent_read_linked_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "student_read_own_fee_installments" ON public.fee_installments;

CREATE POLICY "super_admin_all_fee_installments"
  ON public.fee_installments FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "admin_institute_fee_installments"
  ON public.fee_installments FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "student_read_own_fee_installments"
  ON public.fee_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.students s ON s.id = sf.student_id
      JOIN public.users u ON u.id = s.user_id
      WHERE sf.id = fee_installments.student_fee_id
        AND u.id = auth.uid()
    )
  );

CREATE POLICY "parent_read_linked_fee_installments"
  ON public.fee_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.student_parents sp ON sp.student_id = sf.student_id
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sf.id = fee_installments.student_fee_id
        AND u.id = auth.uid()
    )
  );

-- Parent-aware visibility for fee tables.
DROP POLICY IF EXISTS "parent_read_linked_student_fees" ON public.student_fees;
CREATE POLICY "parent_read_linked_student_fees"
  ON public.student_fees FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sp.student_id = student_fees.student_id
        AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_read_linked_fee_payments" ON public.fee_payments;
CREATE POLICY "parent_read_linked_fee_payments"
  ON public.fee_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sp.student_id = fee_payments.student_id
        AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_read_linked_fee_receipts" ON public.fee_receipts;
CREATE POLICY "parent_read_linked_fee_receipts"
  ON public.fee_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.student_parents sp ON sp.student_id = sf.student_id
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sf.id = (
        SELECT fp.student_fee_id
        FROM public.fee_payments fp
        WHERE fp.id = fee_receipts.payment_id
      )
        AND u.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Refresh install-time defaults for existing rows
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.fee_structures
SET fee_name = COALESCE(fee_name, name),
    fee_code = COALESCE(fee_code, UPPER(REPLACE(name, ' ', '_'))),
    fee_type = COALESCE(fee_type, name),
    recurring_type = COALESCE(recurring_type, frequency),
    installment_allowed = COALESCE(installment_allowed, FALSE),
    late_fee = COALESCE(late_fee, 0),
    installment_count = COALESCE(NULLIF(installment_count, 0), 1)
WHERE TRUE;

UPDATE public.student_fees
SET parent_id = COALESCE(parent_id, public.resolve_primary_parent_id(student_id)),
    scholarship_amount = COALESCE(scholarship_amount, 0),
    concession_amount = COALESCE(concession_amount, 0),
    waiver_amount = COALESCE(waiver_amount, 0),
    installment_count = COALESCE(NULLIF(installment_count, 0), 1),
    next_due_date = COALESCE(next_due_date, due_date),
    bill_number = COALESCE(bill_number, 'BILL-' || substr(id::text, 1, 8)),
    fee_type = COALESCE(fee_type, 'custom')
WHERE TRUE;
