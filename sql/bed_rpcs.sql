-- RPCs and helpers for bed-level assignments
-- Run in Supabase SQL editor

-- Create beds per room based on room type capacity
CREATE OR REPLACE FUNCTION public.ensure_beds_for_all_rooms()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_max int;
  v_rt_id uuid;
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT r.id AS room_id, r.room_code, rt.max_guests
      FROM public.rooms r
      LEFT JOIN public.room_types rt ON rt.id = r.room_type_id
  LOOP
    v_max := COALESCE(rec.max_guests, 0);
    IF v_max <= 0 THEN
      CONTINUE;
    END IF;
    FOR i IN 1..v_max LOOP
      INSERT INTO public.room_beds (room_id, bed_code, status)
      VALUES (rec.room_id, CONCAT('BED-', LPAD(i::text, 2, '0')), 'available')
      ON CONFLICT (room_id, bed_code) DO NOTHING;
    END LOOP;
  END LOOP;
END;$$;

-- Get bed status for a room and date
CREATE OR REPLACE FUNCTION public.get_room_beds_status(
  p_room_id uuid,
  p_date date
)
RETURNS TABLE (
  bed_id uuid,
  bed_code text,
  status text,
  assignment_id uuid,
  reservation_id uuid,
  guest_id uuid,
  guest_name text
) LANGUAGE sql AS $$
  SELECT b.id AS bed_id,
         b.bed_code,
         b.status,
         a.id AS assignment_id,
         a.reservation_id,
         a.guest_id,
         COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) AS guest_name
    FROM public.room_beds b
    LEFT JOIN public.bed_assignments a ON a.room_bed_id = b.id AND (p_date <@ a.date_range)
    LEFT JOIN public.guests g ON g.id = a.guest_id
   WHERE b.room_id = p_room_id
   ORDER BY b.bed_code
$$;

-- Assign a bed for entire reservation range (or provided range)
CREATE OR REPLACE FUNCTION public.assign_bed_for_reservation(
  p_reservation_id uuid,
  p_room_bed_id uuid,
  p_guest_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_bed_id uuid,
  reservation_id uuid,
  guest_id uuid,
  date_from date,
  date_to date
) LANGUAGE plpgsql AS $$
DECLARE
  v_check_in date;
  v_check_out date;
  v_start date;
  v_end date;
BEGIN
  SELECT r.check_in_date, r.check_out_date INTO v_check_in, v_check_out FROM public.reservations r WHERE r.id = p_reservation_id;
  IF v_check_in IS NULL OR v_check_out IS NULL THEN RAISE EXCEPTION 'حجز غير صالح'; END IF;
  v_start := COALESCE(p_start, v_check_in);
  v_end := COALESCE(p_end, v_check_out);
  IF v_end <= v_start THEN RAISE EXCEPTION 'نطاق غير صالح'; END IF;
  INSERT INTO public.bed_assignments (reservation_id, room_bed_id, guest_id, date_range)
  VALUES (p_reservation_id, p_room_bed_id, p_guest_id, daterange(v_start, v_end, '[]'))
  RETURNING id, room_bed_id, reservation_id, guest_id, lower(date_range), upper(date_range)
  INTO id, room_bed_id, reservation_id, guest_id, date_from, date_to;
  RETURN NEXT;
  RETURN;
END;$$;

-- Unassign bed by assignment id
CREATE OR REPLACE FUNCTION public.unassign_bed(
  p_assignment_id uuid
)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.bed_assignments WHERE id = p_assignment_id;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_beds_for_all_rooms() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_beds_status(uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_bed_for_reservation(uuid, uuid, uuid, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_bed(uuid) TO anon, authenticated;

-- Optional: list all assignments for a reservation (debug/UX)
CREATE OR REPLACE FUNCTION public.list_bed_assignments_for_reservation(
  p_reservation_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  bed_id uuid,
  bed_code text,
  room_id uuid,
  guest_id uuid,
  guest_name text,
  date_from date,
  date_to date
) LANGUAGE sql AS $$
  SELECT a.id,
         b.id AS bed_id,
         b.bed_code,
         b.room_id,
         a.guest_id,
         COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) AS guest_name,
         lower(a.date_range) AS date_from,
         upper(a.date_range) AS date_to
    FROM public.bed_assignments a
    JOIN public.room_beds b ON b.id = a.room_bed_id
    LEFT JOIN public.guests g ON g.id = a.guest_id
   WHERE a.reservation_id = p_reservation_id
   ORDER BY b.bed_code
$$;

GRANT EXECUTE ON FUNCTION public.list_bed_assignments_for_reservation(uuid) TO anon, authenticated;
