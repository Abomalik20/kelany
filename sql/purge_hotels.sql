-- Full purge: remove ALL reservations, rooms, floors, and buildings
-- Run in Supabase SQL editor. Irreversible, use with care.

DO $$
BEGIN
  -- Try fast TRUNCATE with CASCADE
  BEGIN
    TRUNCATE TABLE public.reservations, public.rooms, public.floors, public.buildings RESTART IDENTITY CASCADE;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback ordered DELETEs to satisfy FKs without CASCADE
    DELETE FROM public.reservations;
    DELETE FROM public.rooms;
    DELETE FROM public.floors;
    DELETE FROM public.buildings;
  END;

  -- Optional: wipe room types as well (uncomment if desired)
  -- DELETE FROM public.room_types;
END;
$$;
