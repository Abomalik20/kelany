-- Reservation guests linking table and helpers
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.reservation_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'additional' CHECK (role IN ('primary','additional')),
  created_at timestamp DEFAULT NOW(),
  UNIQUE (reservation_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_guests_res ON public.reservation_guests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_guests_guest ON public.reservation_guests(guest_id);

-- Keep reservations.guests_count in sync: primary guest (on reservations.guest_id) + additional rows
CREATE OR REPLACE FUNCTION public.sync_reservation_guest_count(p_reservation_id uuid)
RETURNS void LANGUAGE sql AS $$
  WITH base AS (
    SELECT (CASE WHEN r.guest_id IS NULL THEN 0 ELSE 1 END) AS primary_cnt
      FROM public.reservations r WHERE r.id = p_reservation_id
  ), extra AS (
    SELECT COUNT(*)::int AS extra_cnt FROM public.reservation_guests g WHERE g.reservation_id = p_reservation_id
  )
  UPDATE public.reservations r
     SET guests_count = GREATEST(1, (SELECT primary_cnt FROM base) + (SELECT extra_cnt FROM extra)),
         updated_at = NOW()
   WHERE r.id = p_reservation_id;
$$;

CREATE OR REPLACE FUNCTION public.trg_reservation_guests_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.sync_reservation_guest_count(COALESCE(NEW.reservation_id, OLD.reservation_id));
  RETURN COALESCE(NEW, OLD);
END;$$;

DROP TRIGGER IF EXISTS trg_reservation_guests_sync_ins ON public.reservation_guests;
CREATE TRIGGER trg_reservation_guests_sync_ins
AFTER INSERT ON public.reservation_guests
FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_guests_sync();

DROP TRIGGER IF EXISTS trg_reservation_guests_sync_del ON public.reservation_guests;
CREATE TRIGGER trg_reservation_guests_sync_del
AFTER DELETE ON public.reservation_guests
FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_guests_sync();

-- RPCs to manage reservation guests
-- Drop previous version to allow changing return type
DROP FUNCTION IF EXISTS public.add_reservation_guest(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.add_reservation_guest(
  p_reservation_id uuid,
  p_guest_id uuid,
  p_role text DEFAULT 'additional'
)
RETURNS TABLE (out_id uuid, out_reservation_id uuid, out_guest_id uuid, out_role text)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_role NOT IN ('primary','additional') THEN
    RAISE EXCEPTION 'دور غير صالح';
  END IF;
  INSERT INTO public.reservation_guests (reservation_id, guest_id, role)
  VALUES (p_reservation_id, p_guest_id, p_role)
  ON CONFLICT (reservation_id, guest_id) DO NOTHING
  RETURNING id, reservation_id, guest_id, role INTO out_id, out_reservation_id, out_guest_id, out_role;
  RETURN NEXT;
  RETURN;
END;$$;

CREATE OR REPLACE FUNCTION public.remove_reservation_guest(
  p_reservation_guest_id uuid
)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.reservation_guests WHERE id = p_reservation_guest_id;
$$;

CREATE OR REPLACE FUNCTION public.list_reservation_guests(
  p_reservation_id uuid
)
RETURNS TABLE (
  reservation_guest_id uuid,
  guest_id uuid,
  full_name text,
  phone text,
  email text,
  role text
) LANGUAGE sql AS $$
  SELECT rg.id, g.id, COALESCE(g.full_name, (g.first_name || ' ' || g.last_name)) AS full_name, g.phone, g.email, rg.role
    FROM public.reservation_guests rg
    LEFT JOIN public.guests g ON g.id = rg.guest_id
   WHERE rg.reservation_id = p_reservation_id
   ORDER BY rg.created_at
$$;

GRANT EXECUTE ON FUNCTION public.add_reservation_guest(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_reservation_guest(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_reservation_guests(uuid) TO anon, authenticated;
