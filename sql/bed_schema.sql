-- Bed-level schema for Option B
-- Run in Supabase SQL editor

-- Required for EXCLUDE constraint on overlapping date ranges
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Beds inside each room
CREATE TABLE IF NOT EXISTS public.room_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  bed_code text NOT NULL,
  status text DEFAULT 'available' CHECK (status IN ('available','maintenance','blocked')),
  created_at timestamp DEFAULT NOW(),
  UNIQUE (room_id, bed_code)
);

CREATE INDEX IF NOT EXISTS idx_room_beds_room_id ON public.room_beds(room_id);

-- Assignments of beds to reservations and guests over a date range
CREATE TABLE IF NOT EXISTS public.bed_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  room_bed_id uuid NOT NULL REFERENCES public.room_beds(id) ON DELETE CASCADE,
  guest_id uuid NULL REFERENCES public.guests(id) ON DELETE SET NULL,
  date_range daterange NOT NULL,
  assigned_at timestamp DEFAULT NOW()
);

-- Prevent overlapping assignments on the same bed
ALTER TABLE public.bed_assignments
  DROP CONSTRAINT IF EXISTS bed_assignments_no_overlap;
ALTER TABLE public.bed_assignments
  ADD CONSTRAINT bed_assignments_no_overlap
  EXCLUDE USING gist (
    room_bed_id WITH =,
    date_range WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_bed_assignments_bed ON public.bed_assignments(room_bed_id);
CREATE INDEX IF NOT EXISTS idx_bed_assignments_res ON public.bed_assignments(reservation_id);

-- Validation trigger: assignment must be within reservation range and same room
CREATE OR REPLACE FUNCTION public.bed_assignments_validate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_check_in date;
  v_check_out date;
  v_res_room uuid;
  v_bed_room uuid;
  v_guest_allowed boolean;
BEGIN
  SELECT r.check_in_date, r.check_out_date, r.room_id INTO v_check_in, v_check_out, v_res_room
    FROM public.reservations r WHERE r.id = NEW.reservation_id;
  IF v_check_in IS NULL OR v_check_out IS NULL THEN
    RAISE EXCEPTION 'الحجز بلا تواريخ صالحة';
  END IF;
  IF lower(NEW.date_range) < v_check_in OR upper(NEW.date_range) > v_check_out THEN
    RAISE EXCEPTION 'نطاق السرير خارج نطاق الحجز';
  END IF;
  SELECT b.room_id INTO v_bed_room FROM public.room_beds b WHERE b.id = NEW.room_bed_id;
  IF v_bed_room IS NULL THEN
    RAISE EXCEPTION 'سرير غير موجود';
  END IF;
  IF v_bed_room <> v_res_room THEN
    RAISE EXCEPTION 'السرير لا ينتمي لنفس غرفة الحجز';
  END IF;
  -- If guest specified, ensure he belongs to the reservation (primary or additional)
  IF NEW.guest_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.id = NEW.reservation_id AND r.guest_id = NEW.guest_id
    ) OR EXISTS (
      SELECT 1 FROM public.reservation_guests rg WHERE rg.reservation_id = NEW.reservation_id AND rg.guest_id = NEW.guest_id
    ) INTO v_guest_allowed;
    IF NOT COALESCE(v_guest_allowed, false) THEN
      RAISE EXCEPTION 'الضيف غير مرتبط بهذا الحجز';
    END IF;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_bed_assignments_validate ON public.bed_assignments;
CREATE TRIGGER trg_bed_assignments_validate
BEFORE INSERT OR UPDATE ON public.bed_assignments
FOR EACH ROW EXECUTE FUNCTION public.bed_assignments_validate();
