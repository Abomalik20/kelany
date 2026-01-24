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

  SELECT room_id INTO a_room_id FROM public.reservations WHERE id = p_a FOR UPDATE;
  SELECT room_id INTO b_room_id FROM public.reservations WHERE id = p_b FOR UPDATE;

  IF a_room_id IS NULL OR b_room_id IS NULL THEN
    RAISE EXCEPTION 'one of the reservations has no room assigned';
  END IF;

  UPDATE public.reservations SET room_id = b_room_id WHERE id = p_a;
  UPDATE public.reservations SET room_id = a_room_id WHERE id = p_b;
END;
$$;
