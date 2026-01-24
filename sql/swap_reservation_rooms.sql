-- SQL RPC to atomically swap room assignments between two reservations
-- Usage: SELECT swap_reservation_rooms('reservation-a-uuid', 'reservation-b-uuid');

CREATE OR REPLACE FUNCTION public.swap_reservation_rooms(p_a uuid, p_b uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  a_room_id integer;
  b_room_id integer;
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RAISE EXCEPTION 'reservation ids required';
  END IF;
  -- lock both reservations
  SELECT room_id INTO a_room_id FROM public.reservations WHERE id = p_a FOR UPDATE;
  SELECT room_id INTO b_room_id FROM public.reservations WHERE id = p_b FOR UPDATE;

  IF a_room_id IS NULL OR b_room_id IS NULL THEN
    RAISE EXCEPTION 'one of the reservations has no room assigned';
  END IF;

  IF p_a = p_b THEN
    RETURN;
  END IF;

  -- To avoid the overlap trigger detecting a conflict when we temporarily assign
  -- the same room to both reservations, do a 3-step swap using NULL as a temporary value.
  -- This must run inside the same transaction (it does by default in a function).
  UPDATE public.reservations SET room_id = NULL WHERE id = p_a;
  UPDATE public.reservations SET room_id = a_room_id WHERE id = p_b;
  UPDATE public.reservations SET room_id = b_room_id WHERE id = p_a;
END;
$$;
