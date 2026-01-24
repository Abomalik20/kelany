-- Apply percentage discount to a company's/group reservations for a specific period
-- If p_room_ids is provided, apply only to those rooms within the group
CREATE OR REPLACE FUNCTION public.apply_group_discount(
  p_agency_name text,
  p_check_in date,
  p_check_out date,
  p_percent numeric,
  p_room_ids uuid[] DEFAULT NULL,
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  reservation_id uuid,
  old_nightly_rate numeric,
  new_nightly_rate numeric,
  old_total numeric,
  new_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  v_base numeric;
  v_nights int;
  v_new_rate numeric;
  v_old_total numeric;
BEGIN
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RAISE EXCEPTION 'Invalid percent value';
  END IF;

  FOR rec IN
    SELECT r.*
    FROM public.reservations r
    WHERE r.payer_type = 'agency'
      AND r.agency_name = p_agency_name
      AND r.check_in_date = p_check_in
      AND r.check_out_date = p_check_out
      AND (p_room_ids IS NULL OR r.room_id = ANY(p_room_ids))
    FOR UPDATE
  LOOP
    -- compute nights
    v_nights := GREATEST(0, (rec.check_out_date - rec.check_in_date));

    -- determine base nightly rate (snapshot if present, otherwise room_type base)
    SELECT COALESCE(rec.nightly_rate, rt.base_price) INTO v_base
    FROM public.rooms rm
    LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
    WHERE rm.id = rec.room_id
    LIMIT 1;

    IF v_base IS NULL THEN
      v_base := 0;
    END IF;

    v_old_total := COALESCE(rec.total_amount, 0);

    v_new_rate := ROUND((v_base * (1 - (p_percent::numeric / 100)))::numeric, 2);
    -- ensure non-negative
    IF v_new_rate < 0 THEN v_new_rate := 0; END IF;

    UPDATE public.reservations rr
       SET nightly_rate = v_new_rate,
           total_amount = COALESCE(v_new_rate, 0) * GREATEST(0, (rr.check_out_date - rr.check_in_date)),
           updated_at = NOW(),
           updated_by = COALESCE(p_staff_user_id, rr.updated_by)
     WHERE rr.id = rec.id
     RETURNING rr.id, COALESCE(rec.nightly_rate, 0), v_new_rate, v_old_total, COALESCE(v_new_rate,0) * v_nights
     INTO reservation_id, old_nightly_rate, new_nightly_rate, old_total, new_total;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_group_discount(text, date, date, numeric, uuid[], uuid) TO authenticated, anon;
