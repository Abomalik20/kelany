-- RPCs for reservations: availability check and available rooms list

-- Check if a room is available for a given date range.
-- Returns true when no conflicting reservations exist (excluding a given reservation id for edits).
CREATE OR REPLACE FUNCTION public.check_room_availability(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.room_id = p_room_id
      AND r.status IN ('pending','confirmed','checked_in')
      -- استخدم مدى نصف مفتوح [check_in, check_out) حتى يكون يوم الخروج متاحًا لحجز جديد
      AND daterange(r.check_in_date, r.check_out_date, '[)') && daterange(p_check_in, p_check_out, '[)')
      AND (p_reservation_id IS NULL OR r.id <> p_reservation_id)
  );
END;
$$;

-- Drop older version first to allow return type changes
DROP FUNCTION IF EXISTS public.get_available_rooms(date, date, uuid);

-- Get all rooms available for a given date range.
-- Excludes rooms with overlapping reservations and rooms in maintenance.
CREATE OR REPLACE FUNCTION public.get_available_rooms(
  p_check_in date,
  p_check_out date,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_label text,
  status text,
  cleanliness text,
  room_type_id uuid,
  room_type_name text,
  base_price numeric,
  max_guests int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT r.id,
         COALESCE(NULLIF(r.room_number, ''), NULLIF(r.room_code, ''), 'غرفة #' || left(r.id::text, 8)) AS room_label,
         r.status::text,
         r.cleanliness::text,
         r.room_type_id,
         COALESCE(rt.name_ar, rt.name) AS room_type_name,
         rt.base_price::numeric AS base_price,
         rt.max_guests::int AS max_guests
  FROM public.rooms r
  LEFT JOIN public.room_types rt ON rt.id = r.room_type_id
  WHERE (r.status IS NULL OR r.status NOT IN ('maintenance'))
    AND NOT EXISTS (
      SELECT 1
      FROM public.reservations res
      WHERE res.room_id = r.id
        AND res.status IN ('pending','confirmed','checked_in')
        -- نفس مبدأ [check_in, check_out): يوم الخروج لا يُعتبر مشغولاً
        AND daterange(res.check_in_date, res.check_out_date, '[)') && daterange(p_check_in, p_check_out, '[)')
        AND (p_reservation_id IS NULL OR res.id <> p_reservation_id)
    )
  ORDER BY room_label
$$;

-- Grant execute to anon/authenticated for development convenience (adjust for prod)
GRANT EXECUTE ON FUNCTION public.check_room_availability(uuid, date, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_rooms(date, date, uuid) TO anon, authenticated;

-- Extend a reservation: safely update check_out and recompute amounts
-- Returns updated basics for UI: dates, nights, nightly_rate, total_amount
DROP FUNCTION IF EXISTS public.extend_reservation(uuid, date);
CREATE OR REPLACE FUNCTION public.extend_reservation(
  p_reservation_id uuid,
  p_new_check_out date,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  check_in_date date,
  check_out_date date,
  nights int,
  nightly_rate numeric,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
  v_check_in date;
  v_rate numeric;
  v_nights int;
  v_available boolean;
BEGIN
  -- Load current reservation essentials
  SELECT r.room_id, r.check_in_date, COALESCE(r.nightly_rate, rt.base_price)
    INTO v_room_id, v_check_in, v_rate
  FROM public.reservations r
  LEFT JOIN public.rooms rm ON rm.id = r.room_id
  LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
  WHERE r.id = p_reservation_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'الحجز غير موجود';
  END IF;

  IF p_new_check_out IS NULL OR p_new_check_out <= v_check_in THEN
    RAISE EXCEPTION 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول';
  END IF;

  -- Check conflicts including edits exclusion
  v_available := public.check_room_availability(v_room_id, v_check_in, p_new_check_out, p_reservation_id);
  IF NOT v_available THEN
    RAISE EXCEPTION 'تعارض مع حجز آخر في نفس الفترة';
  END IF;

  v_nights := GREATEST(0, (p_new_check_out - v_check_in));

  UPDATE public.reservations r
     SET check_out_date = p_new_check_out,
         total_amount = COALESCE(v_rate, 0) * v_nights,
       updated_at = NOW(),
       updated_by = COALESCE(p_staff_user_id, updated_by)
   WHERE r.id = p_reservation_id
   RETURNING r.id, r.room_id, r.check_in_date, r.check_out_date, v_nights, COALESCE(v_rate, 0), (COALESCE(v_rate, 0) * v_nights)
   INTO id, room_id, check_in_date, check_out_date, nights, nightly_rate, total_amount;

  RETURN NEXT;
  RETURN;
END;
$$;

-- Calculate invoice snapshot: subtotal, taxes, deposit, remaining, cancellation fee
-- Parameters allow flexible tax/deposit/policy without schema changes
CREATE OR REPLACE FUNCTION public.calculate_invoice(
  p_reservation_id uuid,
  p_tax_rate numeric DEFAULT 0.14,
  p_deposit numeric DEFAULT 0,
  p_cancellation_policy text DEFAULT NULL,
  p_cancellation_time timestamp DEFAULT NULL
)
RETURNS TABLE (
  nights int,
  nightly_rate numeric,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  deposit numeric,
  total numeric,
  paid_amount numeric,
  remaining numeric,
  cancellation_fee numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT r.id,
           GREATEST(0, (r.check_out_date - r.check_in_date))::int         AS nights,
           COALESCE(r.nightly_rate, rt.base_price)::numeric               AS nightly_rate,
           COALESCE(r.amount_paid, 0)::numeric                            AS paid_amount,
           r.check_in_date,
           r.status
      FROM public.reservations r
      LEFT JOIN public.rooms rm ON rm.id = r.room_id
      LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
     WHERE r.id = p_reservation_id
  ), amounts AS (
    SELECT nights,
           nightly_rate,
           (nights * nightly_rate)                              AS subtotal,
           p_tax_rate                                            AS tax_rate,
           (nights * nightly_rate) * p_tax_rate                  AS tax_amount,
           p_deposit                                             AS deposit,
           (nights * nightly_rate) * (1 + p_tax_rate)            AS total,
           paid_amount,
           ((nights * nightly_rate) * (1 + p_tax_rate)) - paid_amount - p_deposit AS remaining
      FROM base
  ), cancel AS (
    SELECT CASE
             WHEN p_cancellation_policy IS NULL OR p_cancellation_time IS NULL THEN 0::numeric
             WHEN p_cancellation_policy = 'flexible' AND p_cancellation_time <= (b.check_in_date - interval '24 hours') THEN 0::numeric
             WHEN p_cancellation_policy = 'moderate' AND p_cancellation_time <= (b.check_in_date - interval '48 hours') THEN 0::numeric
             WHEN p_cancellation_policy = 'strict'   AND p_cancellation_time <= (b.check_in_date - interval '72 hours') THEN 0::numeric
             ELSE (b.nightly_rate)::numeric
           END AS cancellation_fee
      FROM base b
  )
  SELECT a.nights, a.nightly_rate, a.subtotal, a.tax_rate, a.tax_amount, a.deposit,
         a.total, a.paid_amount, GREATEST(a.remaining, 0), c.cancellation_fee
    FROM amounts a CROSS JOIN cancel c
$$;

-- Suggest split-stay segments for alternative rooms covering parts of the desired period
-- Returns contiguous available intervals inside [p_check_in, p_check_out)
CREATE OR REPLACE FUNCTION public.suggest_split_stay(
  p_check_in date,
  p_check_out date,
  p_room_type_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id uuid,
  room_label text,
  available_from date,
  available_to date,
  nights int,
  room_type_id uuid,
  room_type_name text,
  base_price numeric,
  max_guests int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH rooms AS (
    SELECT r.id AS room_id,
           COALESCE(NULLIF(r.room_number, ''), NULLIF(r.room_code, ''), 'غرفة #' || left(r.id::text, 8)) AS room_label,
           r.room_type_id,
           COALESCE(rt.name_ar, rt.name) AS room_type_name,
           rt.base_price::numeric AS base_price,
           rt.max_guests::int AS max_guests
      FROM public.rooms r
      LEFT JOIN public.room_types rt ON rt.id = r.room_type_id
     WHERE (r.status IS NULL OR r.status NOT IN ('maintenance'))
       AND (p_room_type_id IS NULL OR r.room_type_id = p_room_type_id)
  ),
  days AS (
    SELECT room_id, room_label, room_type_id, room_type_name, base_price, max_guests,
           d::date AS d
      FROM rooms
      CROSS JOIN generate_series(
        p_check_in::timestamp,
        (p_check_out - interval '1 day')::timestamp,
        interval '1 day'
      ) AS d
  ),
  conflicts AS (
    SELECT res.room_id, daterange(res.check_in_date, res.check_out_date, '[]') AS rng
      FROM public.reservations res
     WHERE res.status IN ('pending','confirmed','checked_in')
       AND daterange(res.check_in_date, res.check_out_date, '[]') && daterange(p_check_in, p_check_out, '[]')
  ),
  available_days AS (
    SELECT d.room_id, d.room_label, d.room_type_id, d.room_type_name, d.base_price, d.max_guests, d.d
      FROM days d
      LEFT JOIN conflicts c ON c.room_id = d.room_id AND d.d <@ c.rng
     WHERE c.room_id IS NULL
  ),
  grouped AS (
    SELECT ad.*, 
           -- group contiguous days per room using gaps
           (ad.d - (ROW_NUMBER() OVER (PARTITION BY ad.room_id ORDER BY ad.d))::int) AS grp_key
      FROM available_days ad
  )
  SELECT room_id,
         room_label,
         MIN(d) AS available_from,
         (MAX(d) + 1) AS available_to,
         (MAX(d) - MIN(d) + 1) AS nights,
         room_type_id,
         room_type_name,
         base_price,
         max_guests
    FROM grouped
   GROUP BY room_id, room_label, room_type_id, room_type_name, base_price, max_guests, grp_key
   HAVING MIN(d) < (p_check_out) AND MAX(d) >= p_check_in
   ORDER BY room_label, available_from
$$;

-- Drop older version first to allow return type changes
DROP FUNCTION IF EXISTS public.get_calendar_reservations(date, date);

-- Calendar-friendly reservations list with status color hints
CREATE OR REPLACE FUNCTION public.get_calendar_reservations(
  p_start date,
  p_end date
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  room_label text,
  guest_id uuid,
  guest_name text,
  guest_names text,
  start_date date,
  end_date date,
  status text,
  status_color text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT r.id,
         r.room_id,
         COALESCE(NULLIF(rm.room_number, ''), NULLIF(rm.room_code, ''), 'غرفة #' || left(rm.id::text, 8)) AS room_label,
         r.guest_id,
         COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) AS guest_name,
         (
           COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) ||
           COALESCE(
             CASE WHEN eg.names IS NOT NULL AND eg.names <> '' THEN '، ' || eg.names ELSE '' END,
             ''
           )
         ) AS guest_names,
         r.check_in_date AS start_date,
         r.check_out_date AS end_date,
         r.status::text,
         CASE r.status
           WHEN 'pending'     THEN '#f59e0b'  -- amber
           WHEN 'confirmed'   THEN '#10b981'  -- emerald
           WHEN 'checked_in'  THEN '#3b82f6'  -- blue
           WHEN 'checked_out' THEN '#6b7280'  -- gray
           WHEN 'canceled'    THEN '#ef4444'  -- red
           ELSE '#9ca3af'     -- neutral
         END AS status_color
    FROM public.reservations r
    LEFT JOIN public.rooms rm   ON rm.id = r.room_id
    LEFT JOIN public.guests g   ON g.id = r.guest_id
    LEFT JOIN LATERAL (
       SELECT string_agg(COALESCE(gg.full_name, (gg.first_name || ' ' || gg.last_name)), '، ') AS names
         FROM public.reservation_guests rg
         LEFT JOIN public.guests gg ON gg.id = rg.guest_id
        WHERE rg.reservation_id = r.id
    ) eg ON TRUE
   WHERE daterange(r.check_in_date, r.check_out_date, '[]') && daterange(p_start, p_end, '[]')
   ORDER BY start_date, room_label
$$;

-- Grants for new helper functions (development)
GRANT EXECUTE ON FUNCTION public.extend_reservation(uuid, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_invoice(uuid, numeric, numeric, text, timestamp) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_split_stay(date, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_reservations(date, date) TO anon, authenticated;

-- Move a reservation to another room and/or dates with conflict check
CREATE OR REPLACE FUNCTION public.move_reservation(
  p_reservation_id uuid,
  p_new_room_id uuid,
  p_new_check_in date,
  p_new_check_out date
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  check_in_date date,
  check_out_date date,
  nights int,
  nightly_rate numeric,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate numeric;
  v_nights int;
  v_available boolean;
BEGIN
  IF p_new_check_out IS NULL OR p_new_check_in IS NULL OR p_new_check_out <= p_new_check_in THEN
    RAISE EXCEPTION 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول';
  END IF;

  -- Determine nightly rate: keep snapshot if exists else use base price of new room type
  SELECT COALESCE(r.nightly_rate, rt.base_price)
    INTO v_rate
  FROM public.reservations r
  LEFT JOIN public.rooms rm ON rm.id = p_new_room_id
  LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
  WHERE r.id = p_reservation_id;

  v_available := public.check_room_availability(p_new_room_id, p_new_check_in, p_new_check_out, p_reservation_id);
  IF NOT v_available THEN
    RAISE EXCEPTION 'تعارض مع حجز آخر في نفس الفترة';
  END IF;

  v_nights := GREATEST(0, (p_new_check_out - p_new_check_in));

  UPDATE public.reservations r
     SET room_id = p_new_room_id,
         check_in_date = p_new_check_in,
         check_out_date = p_new_check_out,
         total_amount = COALESCE(v_rate, 0) * v_nights,
         updated_at = NOW()
   WHERE r.id = p_reservation_id
   RETURNING r.id, r.room_id, r.check_in_date, r.check_out_date, v_nights, COALESCE(v_rate, 0), (COALESCE(v_rate, 0) * v_nights)
   INTO id, room_id, check_in_date, check_out_date, nights, nightly_rate, total_amount;

  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_reservation(uuid, uuid, date, date) TO anon, authenticated;

-- Swap rooms between two reservations (for the same period) to ease room assignment
CREATE OR REPLACE FUNCTION public.swap_room_reservations(
  p_reservation_id1 uuid,
  p_reservation_id2 uuid,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room1 uuid;
  v_room2 uuid;
BEGIN
  SELECT room_id INTO v_room1 FROM public.reservations WHERE id = p_reservation_id1;
  SELECT room_id INTO v_room2 FROM public.reservations WHERE id = p_reservation_id2;

  IF v_room1 IS NULL OR v_room2 IS NULL THEN
    RAISE EXCEPTION 'الحجز غير موجود أو لا يحتوي على غرفة';
  END IF;

  -- Temporarily clear the first reservation room to avoid overlap trigger, then swap
  UPDATE public.reservations
     SET room_id   = NULL,
         updated_at = NOW(),
         updated_by = COALESCE(p_staff_user_id, updated_by)
   WHERE id = p_reservation_id1;

  UPDATE public.reservations
     SET room_id   = v_room1,
         updated_at = NOW(),
         updated_by = COALESCE(p_staff_user_id, updated_by)
   WHERE id = p_reservation_id2;

  UPDATE public.reservations
     SET room_id   = v_room2,
         updated_at = NOW(),
         updated_by = COALESCE(p_staff_user_id, updated_by)
   WHERE id = p_reservation_id1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_room_reservations(uuid, uuid, uuid) TO anon, authenticated;

-- Split a reservation into segments and move one segment to another room
-- This supports scenarios like maintenance days or moving remaining nights
-- The segment [p_segment_start, p_segment_end) must be fully inside the original stay
CREATE OR REPLACE FUNCTION public.split_and_move_reservation(
  p_reservation_id uuid,
  p_segment_start date,
  p_segment_end date,
  p_target_room_id uuid,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  check_in_date date,
  check_out_date date,
  segment_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
  v_check_in date;
  v_check_out date;
  v_status text;
  v_guest_id uuid;
  v_nightly_rate numeric;
  v_base_rate numeric;
  v_nights int;
BEGIN
  -- Load base reservation
  SELECT r.room_id,
         r.check_in_date,
         r.check_out_date,
         r.status::text,
         r.guest_id,
         COALESCE(r.nightly_rate, rt.base_price) AS nightly_rate,
         rt.base_price::numeric AS base_rate
    INTO v_room_id, v_check_in, v_check_out, v_status, v_guest_id, v_nightly_rate, v_base_rate
  FROM public.reservations r
  LEFT JOIN public.rooms rm ON rm.id = r.room_id
  LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
  WHERE r.id = p_reservation_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'الحجز غير موجود';
  END IF;

  IF p_segment_start IS NULL OR p_segment_end IS NULL OR p_segment_end <= p_segment_start THEN
    RAISE EXCEPTION 'نطاق التقسيم غير صالح';
  END IF;

  IF p_segment_start < v_check_in OR p_segment_end > v_check_out THEN
    RAISE EXCEPTION 'نطاق التقسيم يجب أن يكون داخل فترة الحجز الأصلية';
  END IF;

  -- Check availability for the target room only for the moved segment
  IF NOT public.check_room_availability(p_target_room_id, p_segment_start, p_segment_end, NULL) THEN
    RAISE EXCEPTION 'تعارض مع حجز آخر في نفس الفترة للغرفة المستهدفة';
  END IF;

  -- Case 1: move the whole stay as a single segment
  IF p_segment_start = v_check_in AND p_segment_end = v_check_out THEN
    v_nights := GREATEST(0, (v_check_out - v_check_in));

    UPDATE public.reservations r
       SET room_id       = p_target_room_id,
           check_in_date = v_check_in,
           check_out_date = v_check_out,
           total_amount  = COALESCE(v_nightly_rate, v_base_rate, 0) * v_nights,
           updated_at    = NOW(),
           updated_by    = COALESCE(p_staff_user_id, updated_by)
     WHERE r.id = p_reservation_id;

    RETURN QUERY
      SELECT r.id, r.room_id, r.check_in_date, r.check_out_date, 'moved_full'::text AS segment_role
        FROM public.reservations r
       WHERE r.id = p_reservation_id;

    RETURN;
  END IF;

  -- Case 2: move a segment at the start [v_check_in, p_segment_end)
  IF p_segment_start = v_check_in AND p_segment_end < v_check_out THEN
    -- After part stays in original room
    v_nights := GREATEST(0, (v_check_out - p_segment_end));

    UPDATE public.reservations r
       SET check_in_date = p_segment_end,
           check_out_date = v_check_out,
           total_amount  = COALESCE(v_nightly_rate, v_base_rate, 0) * v_nights,
           updated_at    = NOW(),
           updated_by    = COALESCE(p_staff_user_id, updated_by)
     WHERE r.id = p_reservation_id;

    RETURN QUERY
      SELECT r.id, r.room_id, r.check_in_date, r.check_out_date, 'after'::text AS segment_role
        FROM public.reservations r
       WHERE r.id = p_reservation_id;

    -- Moved part goes to target room
    v_nights := GREATEST(0, (p_segment_end - v_check_in));

    RETURN QUERY
      INSERT INTO public.reservations AS new (
        room_id,
        guest_id,
        check_in_date,
        check_out_date,
        status,
        nightly_rate,
        total_amount,
        guests_count,
        special_requests,
        notes,
        currency,
        payer_type,
        agency_name,
        payment_method,
        created_by,
        updated_by
      )
      SELECT
        p_target_room_id,
        r.guest_id,
        v_check_in,
        p_segment_end,
        r.status,
        COALESCE(r.nightly_rate, v_base_rate),
        COALESCE(r.nightly_rate, v_base_rate, 0) * v_nights,
        r.guests_count,
        r.special_requests,
        COALESCE(r.notes, '') || ' [جزء من حجز مقسوم]',
        r.currency,
        r.payer_type,
        r.agency_name,
        r.payment_method,
        COALESCE(p_staff_user_id, r.created_by),
        COALESCE(p_staff_user_id, r.updated_by)
      FROM public.reservations r
      WHERE r.id = p_reservation_id
      RETURNING new.id, new.room_id, new.check_in_date, new.check_out_date, 'moved'::text;

    RETURN;
  END IF;

  -- Case 3: move a segment at the end [p_segment_start, v_check_out)
  IF p_segment_start > v_check_in AND p_segment_end = v_check_out THEN
    -- Before part stays in original room
    v_nights := GREATEST(0, (p_segment_start - v_check_in));

    UPDATE public.reservations r
       SET check_in_date = v_check_in,
           check_out_date = p_segment_start,
           total_amount  = COALESCE(v_nightly_rate, v_base_rate, 0) * v_nights,
           updated_at    = NOW(),
           updated_by    = COALESCE(p_staff_user_id, updated_by)
     WHERE r.id = p_reservation_id;

    RETURN QUERY
      SELECT r.id, r.room_id, r.check_in_date, r.check_out_date, 'before'::text AS segment_role
        FROM public.reservations r
       WHERE r.id = p_reservation_id;

    -- Moved part goes to target room
    v_nights := GREATEST(0, (v_check_out - p_segment_start));

    RETURN QUERY
      INSERT INTO public.reservations AS new (
        room_id,
        guest_id,
        check_in_date,
        check_out_date,
        status,
        nightly_rate,
        total_amount,
        guests_count,
        special_requests,
        notes,
        currency,
        payer_type,
        agency_name,
        payment_method,
        created_by,
        updated_by
      )
      SELECT
        p_target_room_id,
        r.guest_id,
        p_segment_start,
        v_check_out,
        r.status,
        COALESCE(r.nightly_rate, v_base_rate),
        COALESCE(r.nightly_rate, v_base_rate, 0) * v_nights,
        r.guests_count,
        r.special_requests,
        COALESCE(r.notes, '') || ' [جزء من حجز مقسوم]',
        r.currency,
        r.payer_type,
        r.agency_name,
        r.payment_method,
        COALESCE(p_staff_user_id, r.created_by),
        COALESCE(p_staff_user_id, r.updated_by)
      FROM public.reservations r
      WHERE r.id = p_reservation_id
      RETURNING new.id, new.room_id, new.check_in_date, new.check_out_date, 'moved'::text;

    RETURN;
  END IF;

  -- Case 4: move a middle segment [p_segment_start, p_segment_end)
  -- Before part: [v_check_in, p_segment_start)
  v_nights := GREATEST(0, (p_segment_start - v_check_in));

  UPDATE public.reservations r
     SET check_in_date = v_check_in,
         check_out_date = p_segment_start,
         total_amount  = COALESCE(v_nightly_rate, v_base_rate, 0) * v_nights,
         updated_at    = NOW(),
         updated_by    = COALESCE(p_staff_user_id, updated_by)
   WHERE r.id = p_reservation_id;

  RETURN QUERY
    SELECT r.id, r.room_id, r.check_in_date, r.check_out_date, 'before'::text AS segment_role
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

  -- Moved middle part to target room
  v_nights := GREATEST(0, (p_segment_end - p_segment_start));

  RETURN QUERY
    INSERT INTO public.reservations AS new (
      room_id,
      guest_id,
      check_in_date,
      check_out_date,
      status,
      nightly_rate,
      total_amount,
      guests_count,
      special_requests,
      notes,
      currency,
      payer_type,
      agency_name,
      payment_method,
      created_by,
      updated_by
    )
    SELECT
      p_target_room_id,
      r.guest_id,
      p_segment_start,
      p_segment_end,
      r.status,
      COALESCE(r.nightly_rate, v_base_rate),
      COALESCE(r.nightly_rate, v_base_rate, 0) * v_nights,
      r.guests_count,
      r.special_requests,
      COALESCE(r.notes, '') || ' [جزء من حجز مقسوم]',
      r.currency,
      r.payer_type,
      r.agency_name,
      r.payment_method,
      COALESCE(p_staff_user_id, r.created_by),
      COALESCE(p_staff_user_id, r.updated_by)
    FROM public.reservations r
    WHERE r.id = p_reservation_id
    RETURNING new.id, new.room_id, new.check_in_date, new.check_out_date, 'moved'::text;

  -- After part: [p_segment_end, v_check_out)
  v_nights := GREATEST(0, (v_check_out - p_segment_end));

  RETURN QUERY
    INSERT INTO public.reservations AS new (
      room_id,
      guest_id,
      check_in_date,
      check_out_date,
      status,
      nightly_rate,
      total_amount,
      guests_count,
      special_requests,
      notes,
      currency,
      payer_type,
      agency_name,
      payment_method,
      created_by,
      updated_by
    )
    SELECT
      v_room_id,
      r.guest_id,
      p_segment_end,
      v_check_out,
      r.status,
      COALESCE(r.nightly_rate, v_base_rate),
      COALESCE(r.nightly_rate, v_base_rate, 0) * v_nights,
      r.guests_count,
      r.special_requests,
      COALESCE(r.notes, '') || ' [جزء من حجز مقسوم]',
      r.currency,
      r.payer_type,
      r.agency_name,
      r.payment_method,
      COALESCE(p_staff_user_id, r.created_by),
      COALESCE(p_staff_user_id, r.updated_by)
    FROM public.reservations r
    WHERE r.id = p_reservation_id
    RETURNING new.id, new.room_id, new.check_in_date, new.check_out_date, 'after'::text;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_and_move_reservation(uuid, date, date, uuid, uuid) TO anon, authenticated;

-- Convenience helper: move all remaining nights from a given date to another room
CREATE OR REPLACE FUNCTION public.move_reservation_remaining_from_date(
  p_reservation_id uuid,
  p_from_date date,
  p_target_room_id uuid,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  check_in_date date,
  check_out_date date,
  segment_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_check_in date;
  v_check_out date;
BEGIN
  SELECT check_in_date, check_out_date
    INTO v_check_in, v_check_out
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF v_check_in IS NULL OR v_check_out IS NULL THEN
    RAISE EXCEPTION 'الحجز غير موجود';
  END IF;

  IF p_from_date <= v_check_in OR p_from_date >= v_check_out THEN
    RAISE EXCEPTION 'تاريخ بداية نقل الباقي يجب أن يكون داخل فترة الحجز';
  END IF;

  RETURN QUERY
    SELECT *
      FROM public.split_and_move_reservation(
        p_reservation_id,
        p_from_date,
        v_check_out,
        p_target_room_id,
        p_staff_user_id
      );

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_reservation_remaining_from_date(uuid, date, uuid, uuid) TO anon, authenticated;
