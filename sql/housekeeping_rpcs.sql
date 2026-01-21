-- Housekeeping & laundry helper RPCs

-- Overview for housekeeping dashboard: one row per room for today
CREATE OR REPLACE FUNCTION public.housekeeping_overview(p_date date DEFAULT current_date)
RETURNS TABLE (
  room_id uuid,
  room_code text,
  building_name text,
  floor_name text,
  status text,
  cleanliness text,
  current_reservation_id uuid,
  current_guest_name text,
  task_id uuid,
  task_type text,
  task_status text,
  task_priority int,
  assigned_to_id uuid,
  assigned_to_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT rm.id AS room_id,
           COALESCE(NULLIF(rm.room_number,''), NULLIF(rm.room_code,''), 'غرفة #' || left(rm.id::text,8)) AS room_code,
           b.name AS building_name,
           COALESCE(f.name, 'طابق') AS floor_name,
           rm.status::text,
           rm.cleanliness::text,
           r.id AS res_id,
           COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) AS guest_name
      FROM public.rooms rm
      LEFT JOIN public.buildings b ON b.id = rm.building_id
      LEFT JOIN public.floors f ON f.id = rm.floor_id
      LEFT JOIN public.reservations r
             ON r.room_id = rm.id
            AND r.status IN ('checked_in','confirmed','pending')
            AND p_date >= r.check_in_date AND p_date < r.check_out_date
      LEFT JOIN public.guests g ON g.id = r.guest_id
  ), tasks AS (
    SELECT
      ht.id,
      ht.room_id,
      ht.task_type,
      ht.status,
      ht.priority,
      ht.assigned_to,
      su.full_name AS staff_name
      FROM public.housekeeping_tasks ht
      LEFT JOIN public.staff_users su ON su.id = ht.assigned_to
     WHERE ht.task_date = p_date
  )
  SELECT b.room_id,
         b.room_code,
         b.building_name,
         b.floor_name,
         b.status,
         b.cleanliness,
         b.res_id AS current_reservation_id,
         b.guest_name AS current_guest_name,
         t.id AS task_id,
         t.task_type,
         t.status AS task_status,
         t.priority AS task_priority,
         t.assigned_to AS assigned_to_id,
         t.staff_name AS assigned_to_name
    FROM base b
    LEFT JOIN tasks t ON t.room_id = b.room_id
   ORDER BY b.building_name, b.floor_name, b.room_code;
$$;

GRANT EXECUTE ON FUNCTION public.housekeeping_overview(date) TO anon, authenticated;

-- Allow staff to update housekeeping task status (start / finish)
CREATE OR REPLACE FUNCTION public.set_housekeeping_task_status(
  p_task_id uuid,
  p_status text,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  started_at timestamptz,
  finished_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_started timestamptz;
  v_finished timestamptz;
  v_now timestamptz := now();
BEGIN
  IF p_status NOT IN ('pending','in_progress','done','cancelled') THEN
    RAISE EXCEPTION 'حالة مهمة تنظيف غير صالحة';
  END IF;

  UPDATE public.housekeeping_tasks ht
     SET status = p_status,
         started_at = CASE
                        WHEN p_status = 'in_progress' AND ht.started_at IS NULL THEN v_now
                        WHEN p_status IN ('pending') THEN NULL
                        ELSE ht.started_at
                      END,
         finished_at = CASE
                          WHEN p_status = 'done' THEN v_now
                          WHEN p_status IN ('pending','in_progress') THEN NULL
                          ELSE ht.finished_at
                        END,
         assigned_to = COALESCE(ht.assigned_to, p_staff_user_id)
   WHERE ht.id = p_task_id
   RETURNING ht.id, ht.status, ht.started_at, ht.finished_at
    INTO v_id, v_status, v_started, v_finished;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'مهمة التنظيف غير موجودة';
  END IF;

  RETURN QUERY SELECT v_id, v_status, v_started, v_finished;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_housekeeping_task_status(uuid, text, uuid) TO anon, authenticated;

-- Simple RPC to create or update a housekeeping task for a room/date/type
-- Ensure no duplicate (room_id, task_date, task_type)
ALTER TABLE public.housekeeping_tasks
  DROP CONSTRAINT IF EXISTS housekeeping_tasks_room_date_type_uniq;
ALTER TABLE public.housekeeping_tasks
  ADD CONSTRAINT housekeeping_tasks_room_date_type_uniq
  UNIQUE (room_id, task_date, task_type);

CREATE OR REPLACE FUNCTION public.upsert_housekeeping_task(
  p_room_id uuid,
  p_task_date date,
  p_task_type text,
  p_priority int DEFAULT 2,
  p_notes text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  task_date date,
  task_type text,
  status text,
  priority int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.housekeeping_tasks (
    room_id, task_date, task_type, priority, notes, assigned_to, created_by
  )
  VALUES (p_room_id, p_task_date, p_task_type, p_priority, p_notes, p_assigned_to, p_created_by)
  ON CONFLICT (room_id, task_date, task_type) DO UPDATE
    SET priority = EXCLUDED.priority,
        notes = EXCLUDED.notes,
        assigned_to = EXCLUDED.assigned_to
  RETURNING id, room_id, task_date, task_type, status, priority;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_housekeeping_task(uuid, date, text, int, text, uuid, uuid) TO anon, authenticated;

-- Laundry items high-level overview: stock + today's in/out
CREATE OR REPLACE FUNCTION public.laundry_items_overview(
  p_date date DEFAULT current_date
)
RETURNS TABLE (
  item_id uuid,
  code text,
  name text,
  unit text,
  stock_quantity int,
  out_today int,
  in_today int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT li.id AS item_id,
         li.code,
         li.name,
         li.unit,
         COALESCE(ls.quantity, 0) AS stock_quantity,
         COALESCE(SUM(CASE WHEN lm.direction = 'out' AND lm.created_at::date = p_date THEN lm.quantity ELSE 0 END), 0) AS out_today,
         COALESCE(SUM(CASE WHEN lm.direction = 'in'  AND lm.created_at::date = p_date THEN lm.quantity ELSE 0 END), 0) AS in_today
    FROM public.laundry_items li
    LEFT JOIN public.laundry_stock ls ON ls.item_id = li.id
    LEFT JOIN public.laundry_movements lm ON lm.item_id = li.id
   GROUP BY li.id, li.code, li.name, li.unit, ls.quantity
   ORDER BY li.name;
$$;

GRANT EXECUTE ON FUNCTION public.laundry_items_overview(date) TO anon, authenticated;

-- Laundry movements overview with joins for UI
CREATE OR REPLACE FUNCTION public.laundry_movements_overview(
  p_from date,
  p_to date,
  p_item_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  created_at timestamp,
  direction text,
  quantity int,
  note text,
  item_code text,
  item_name text,
  room_code text,
  reservation_id uuid,
  staff_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT lm.id,
         lm.created_at,
         lm.direction,
         lm.quantity,
         lm.note,
         li.code AS item_code,
         li.name AS item_name,
         COALESCE(NULLIF(rm.room_number,''), NULLIF(rm.room_code,''), 'غرفة #' || left(rm.id::text,8)) AS room_code,
         lm.reservation_id,
         su.full_name AS staff_name
    FROM public.laundry_movements lm
    LEFT JOIN public.laundry_items li ON li.id = lm.item_id
    LEFT JOIN public.rooms rm ON rm.id = lm.room_id
    LEFT JOIN public.staff_users su ON su.id = lm.created_by
   WHERE lm.created_at::date BETWEEN p_from AND p_to
     AND (p_item_id IS NULL OR lm.item_id = p_item_id)
   ORDER BY lm.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.laundry_movements_overview(date, date, uuid) TO anon, authenticated;

-- Helper to insert a laundry movement (and update stock via trigger)
CREATE OR REPLACE FUNCTION public.create_laundry_movement(
  p_item_id uuid,
  p_direction text,
  p_quantity int,
  p_room_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
  END IF;

  IF p_direction NOT IN ('out','in','adjust','discard') THEN
    RAISE EXCEPTION 'اتجاه حركة غير صالح';
  END IF;

  INSERT INTO public.laundry_movements (
    item_id, direction, quantity, room_id, reservation_id, note, created_by
  )
  VALUES (p_item_id, p_direction, p_quantity, p_room_id, p_reservation_id, p_note, p_staff_user_id)
  RETURNING laundry_movements.id INTO id;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_laundry_movement(uuid, text, int, uuid, uuid, text, uuid) TO anon, authenticated;
