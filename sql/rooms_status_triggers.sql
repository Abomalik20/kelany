-- Auto-sync room status and cleanliness with reservations

-- Recalculate a single room's status based on current date and reservations
CREATE OR REPLACE FUNCTION public.refresh_room_status(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status text;
  v_is_maintenance boolean;
  v_now date := current_date;
  v_has_checked_in boolean;
  v_has_reserved_today boolean;
BEGIN
  SELECT status = 'maintenance' INTO v_is_maintenance FROM public.rooms WHERE id = p_room_id;
  IF v_is_maintenance THEN
    RETURN; -- do not override maintenance
  END IF;

  -- occupied if a checked_in reservation overlaps today
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.room_id = p_room_id
      AND r.status = 'checked_in'
      AND v_now >= r.check_in_date AND v_now < r.check_out_date
  ) INTO v_has_checked_in;

  IF v_has_checked_in THEN
    v_current_status := 'occupied';
  ELSE
    -- reserved if there is a pending/confirmed that overlaps today or starts today
    SELECT EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.room_id = p_room_id
        AND r.status IN ('pending','confirmed')
        AND (v_now >= r.check_in_date AND v_now < r.check_out_date OR v_now = r.check_in_date)
    ) INTO v_has_reserved_today;

    IF v_has_reserved_today THEN
      v_current_status := 'reserved';
    ELSE
      v_current_status := 'available';
    END IF;
  END IF;

  UPDATE public.rooms SET status = v_current_status WHERE id = p_room_id;
END;
$$;

-- When reservations change, refresh related room(s)
CREATE OR REPLACE FUNCTION public.on_reservation_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_room_status(NEW.room_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.room_id IS DISTINCT FROM OLD.room_id THEN
      PERFORM public.refresh_room_status(OLD.room_id);
    END IF;
    PERFORM public.refresh_room_status(NEW.room_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_room_status(OLD.room_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_change_refresh_room ON public.reservations;
CREATE TRIGGER trg_reservation_change_refresh_room
AFTER INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.on_reservation_change();

-- When a reservation checks out, mark room as needs_cleaning
CREATE OR REPLACE FUNCTION public.on_reservation_checked_out_set_dirty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'checked_out' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      UPDATE public.rooms SET cleanliness = 'needs_cleaning' WHERE id = NEW.room_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_checkout_dirty ON public.reservations;
CREATE TRIGGER trg_reservation_checkout_dirty
AFTER UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.on_reservation_checked_out_set_dirty();
