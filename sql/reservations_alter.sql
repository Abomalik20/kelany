-- Extend reservations table to support booking workflow
-- Safe to run multiple times due to IF NOT EXISTS where possible

-- Core fields
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS guests_count smallint DEFAULT 1;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS special_requests text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS notes text;

-- Pricing & payments
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS nightly_rate numeric(12,2);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payer_type text; -- 'guest' | 'agency'
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS agency_name text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payment_method text; -- 'cash'|'card'|'transfer'|'other'

-- Updated at trigger
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_reservation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_updated_at ON public.reservations;
CREATE TRIGGER trg_reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.set_reservation_updated_at();

-- Overlap protection: prevent overlapping active reservations for the same room
CREATE OR REPLACE FUNCTION public.raise_if_overlapping_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_cnt int;
BEGIN
  IF NEW.room_id IS NULL OR NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION 'check_out_date must be after check_in_date';
  END IF;

  SELECT count(*) INTO v_cnt
  FROM public.reservations r
  WHERE r.room_id = NEW.room_id
    AND (NEW.id IS NULL OR r.id <> NEW.id)
    AND COALESCE(r.status, 'confirmed') NOT IN ('cancelled','no_show')
    AND COALESCE(NEW.status, 'confirmed') NOT IN ('cancelled','no_show')
    -- استخدم مدى نصف مفتوح [check_in, check_out) بحيث يكون يوم الخروج متاحًا لحجز جديد
    AND daterange(r.check_in_date, r.check_out_date, '[)') && daterange(NEW.check_in_date, NEW.check_out_date, '[)');

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Overlapping reservation exists for room % in selected dates', NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_overlap ON public.reservations;
CREATE TRIGGER trg_reservations_overlap
BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.raise_if_overlapping_reservation();
