-- Basic accounting schema for single-hotel setup
-- Run this in Supabase SQL editor after core hotel schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------
-- Categories: simple income / expense types
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income','expense')),
  name text NOT NULL,
  color text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  UNIQUE (type, name)
);

-- Seed a few basic categories (safe to run multiple times)
INSERT INTO public.accounting_categories (type, name, color)
VALUES
  ('income',  'إيرادات الغرف',        '#16a34a'),
  ('income',  'إيرادات أخرى',         '#22c55e'),
  ('expense', 'الرواتب والأجور',      '#f97316'),
  ('expense', 'الصيانة',              '#ef4444'),
  ('expense', 'التنظيف',              '#3b82f6'),
  ('expense', 'مصروفات أخرى',         '#6b7280'),
  ('expense', 'استرداد حجوزات',       '#0ea5e9')
ON CONFLICT (type, name) DO NOTHING;

-- --------------------------------------------------------
-- Bank accounts used for payments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  iban text NULL,
  swift_code text NULL,
  currency text NOT NULL DEFAULT 'EGP',
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  created_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(active);

-- --------------------------------------------------------
-- Simple transaction table: any money in/out
-- تريجر يمنع أي عملية محاسبية لأي موظف استقبال إذا لم تكن له وردية مفتوحة
CREATE OR REPLACE FUNCTION prevent_transaction_without_open_shift()
RETURNS trigger AS $$
DECLARE
  v_has_open_shift boolean;
BEGIN
  -- تحقق هل المستخدم مدير
  IF EXISTS (
    SELECT 1 FROM public.staff_users WHERE id = NEW.created_by AND role = 'manager'
  ) THEN
    RETURN NEW;
  END IF;

  -- تحقق هل للموظف وردية مفتوحة
  SELECT EXISTS (
    SELECT 1 FROM public.reception_shifts
    WHERE staff_user_id = NEW.created_by AND status = 'open'
  ) INTO v_has_open_shift;

  IF NOT v_has_open_shift THEN
    RAISE EXCEPTION 'ممنوع تنفيذ أي عملية محاسبية لموظف استقبال بدون وجود وردية مفتوحة.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_transaction_without_open_shift ON public.accounting_transactions;
CREATE TRIGGER trg_prevent_transaction_without_open_shift
BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_without_open_shift();
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date date NOT NULL DEFAULT current_date,
  direction text NOT NULL CHECK (direction IN ('income','expense')),
  category_id uuid NULL REFERENCES public.accounting_categories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  -- طرق الدفع المدعومة: خزنة نقدية، حسابات بنكية، إنستاباي، محفظة إلكترونية عامة
  payment_method text NOT NULL CHECK (
    payment_method IN (
      'cash',      -- خزنة نقدية
      'bank',      -- حساب بنكي عادي (قيد تطوير لربطه بالتفاصيل البنكية)
      'instapay',  -- إنستاباي / تحويل / بطاقة بنكية
      'other'      -- محفظة إلكترونية (فودافون/اتصالات/محافظ أخرى)
    )
  ),
  bank_account_id uuid NULL REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','reservation')),
  reservation_id uuid NULL REFERENCES public.reservations(id) ON DELETE SET NULL,
  description text NULL,
  created_at timestamp DEFAULT now(),
  created_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date ON public.accounting_transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_direction ON public.accounting_transactions(direction);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_category ON public.accounting_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_bank ON public.accounting_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_accounting_transactions_reservation ON public.accounting_transactions(reservation_id);

-- Ensure source_type supports internal transfers as a distinct source
ALTER TABLE public.accounting_transactions
  DROP CONSTRAINT IF EXISTS accounting_transactions_source_type_check;

ALTER TABLE public.accounting_transactions
  ADD CONSTRAINT accounting_transactions_source_type_check
  CHECK (source_type IN ('manual','reservation','transfer'));

-- -----------------------------------------------------------------
-- Status / confirmation tracking for accounting_transactions
-- -----------------------------------------------------------------

-- Basic status (pending / confirmed)
ALTER TABLE public.accounting_transactions
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- For older rows (أنشئت قبل إضافة العمود) اعتبرها مؤكَّدة
UPDATE public.accounting_transactions
SET status = 'confirmed'
WHERE status IS NULL;

ALTER TABLE public.accounting_transactions
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.accounting_transactions
  DROP CONSTRAINT IF EXISTS accounting_transactions_status_check;

ALTER TABLE public.accounting_transactions
  ADD CONSTRAINT accounting_transactions_status_check
  CHECK (status IN ('pending','confirmed','rejected'));

-- من قام بالتأكيد ومتى
ALTER TABLE public.accounting_transactions
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_transactions_status ON public.accounting_transactions(status);

-- -----------------------------------------------------------------
-- Activity log for accounting transactions (expenses & income)
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_accounting_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_staff  uuid;
  v_id     uuid;
  v_dir    text;
  v_amt    numeric;
  v_status_old text;
  v_status_new text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_staff  := NEW.created_by;
    v_id     := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_staff  := COALESCE(NEW.confirmed_by, NEW.created_by, OLD.confirmed_by, OLD.created_by);
    v_id     := NEW.id;
    v_status_old := COALESCE(OLD.status::text, '');
    v_status_new := COALESCE(NEW.status::text, '');
    IF v_status_old IS DISTINCT FROM v_status_new THEN
      v_action := 'status_change';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_staff  := COALESCE(OLD.confirmed_by, OLD.created_by);
    v_id     := OLD.id;
  END IF;

  v_dir := COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.direction ELSE NEW.direction END, '');
  v_amt := COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.amount ELSE NEW.amount END, 0);

  INSERT INTO public.staff_activity_log (staff_user_id, entity_type, entity_id, action, details, metadata)
  VALUES (
    v_staff,
    'accounting_transaction',
    v_id,
    v_action,
    CASE
      WHEN v_action = 'create' THEN
        format('إضافة معاملة محاسبية (%s) بمبلغ %s', v_dir, v_amt)
      WHEN v_action = 'delete' THEN
        format('حذف معاملة محاسبية (%s) بمبلغ %s', v_dir, v_amt)
      WHEN v_action = 'status_change' THEN
        format('تغيير حالة معاملة محاسبية (%s) بمبلغ %s من %s إلى %s', v_dir, v_amt, COALESCE(v_status_old, '-'), COALESCE(v_status_new, '-'))
      ELSE
        format('تعديل معاملة محاسبية (%s) بمبلغ %s', v_dir, v_amt)
    END,
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_accounting_activity ON public.accounting_transactions;
CREATE TRIGGER trg_accounting_activity
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_transactions
FOR EACH ROW EXECUTE FUNCTION public.log_accounting_activity();

-- --------------------------------------------------------
-- Helper views & functions for balances
-- --------------------------------------------------------

-- Current cashbox balance = sum of all cash transactions (income - expense)
CREATE OR REPLACE FUNCTION public.get_cashbox_balance()
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE direction WHEN 'income' THEN amount ELSE -amount END
  ), 0)
  FROM public.accounting_transactions
  WHERE payment_method = 'cash'
    AND status = 'confirmed';
$$;

-- Bank accounts overview with live balance (opening + transactions)
CREATE OR REPLACE VIEW public.bank_accounts_overview AS
SELECT
  b.id,
  b.bank_name,
  b.account_name,
  b.account_number,
  b.iban,
  b.swift_code,
  b.currency,
  b.opening_balance,
  b.notes,
  b.active,
  b.created_at,
  b.created_by,
  (
    b.opening_balance +
    COALESCE((
      SELECT SUM(
        CASE t.direction WHEN 'income' THEN t.amount ELSE -t.amount END
      )
      FROM public.accounting_transactions t
      WHERE t.bank_account_id = b.id
        AND t.status = 'confirmed'
    ), 0)
  ) AS current_balance
FROM public.bank_accounts b;

-- -----------------------------------------------------------------
-- Reception shifts: per-receptionist cash collection sessions
-- تريجر يمنع فتح أكثر من وردية استقبال واحدة في نفس الوقت
-- تريجر يمنع تسجيل دخول أي مستخدم استقبال إذا كانت هناك وردية استقبال مفتوحة
-- تعديل التريجر ليسمح للمدير فقط بفتح وردية استقبال حتى لو هناك وردية استقبال مفتوحة
CREATE OR REPLACE FUNCTION prevent_any_login_for_reception_except_manager()
RETURNS trigger AS $$
DECLARE
  v_is_manager boolean;
BEGIN
  -- تحقق هل المستخدم مدير
  SELECT EXISTS (
    SELECT 1 FROM public.staff_users
    WHERE id = NEW.staff_user_id AND role = 'manager'
  ) INTO v_is_manager;

  IF NOT v_is_manager THEN
    IF EXISTS (
      SELECT 1 FROM public.reception_shifts
      WHERE status = 'open'
    ) THEN
      RAISE EXCEPTION 'ممنوع تسجيل دخول لأي موظف استقبال طالما هناك وردية استقبال مفتوحة.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_any_login_for_reception_except_manager ON public.reception_shifts;
CREATE TRIGGER trg_prevent_any_login_for_reception_except_manager
BEFORE INSERT ON public.reception_shifts
FOR EACH ROW EXECUTE FUNCTION prevent_any_login_for_reception_except_manager();
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reception_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date date NOT NULL DEFAULT current_date,
  staff_user_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','approved')),
  -- لا يمكن فتح وردية جديدة إذا كانت هناك وردية مفتوحة لأي موظف
  -- تحقق عبر تريجر أو منطق التطبيق: يجب أن تكون جميع الورديات مغلقة قبل فتح وردية جديدة
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  expected_cash numeric(12,2) NULL,
  counted_cash numeric(12,2) NULL,
  difference numeric(12,2) NULL,
  opening_note text NULL,
  closing_note text NULL,
  approved_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  approved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_reception_shifts_staff_date
  ON public.reception_shifts(staff_user_id, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_reception_shifts_status
  ON public.reception_shifts(status);

-- Optional link from accounting transactions to a reception shift
ALTER TABLE public.accounting_transactions
  ADD COLUMN IF NOT EXISTS reception_shift_id uuid NULL
    REFERENCES public.reception_shifts(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------
-- Simple key/value system settings (for global toggles)
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL
);

INSERT INTO public.system_settings (key, value)
VALUES ('auto_reception_shifts', jsonb_build_object('enabled', false))
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------
-- Reception shift handovers (cash handoff between shifts or to manager)
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reception_shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_shift_id uuid NOT NULL REFERENCES public.reception_shifts(id) ON DELETE CASCADE,
  to_shift_id uuid NULL REFERENCES public.reception_shifts(id) ON DELETE SET NULL,
  to_manager_id uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  tx_date date NOT NULL DEFAULT current_date,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  CHECK (
    (to_shift_id IS NOT NULL AND to_manager_id IS NULL)
    OR (to_shift_id IS NULL AND to_manager_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shift_handovers_from ON public.reception_shift_handovers(from_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_to_shift ON public.reception_shift_handovers(to_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_to_manager ON public.reception_shift_handovers(to_manager_id);


