-- Dev-only permissive RLS policies for guests and reservations
-- Apply in Supabase SQL editor during development, remove later for production

-- Ensure RLS is enabled so policies take effect
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Guests: allow all operations for anon and authenticated users
DROP POLICY IF EXISTS dev_select_guests ON public.guests;
CREATE POLICY dev_select_guests ON public.guests
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS dev_insert_guests ON public.guests;
CREATE POLICY dev_insert_guests ON public.guests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS dev_update_guests ON public.guests;
CREATE POLICY dev_update_guests ON public.guests
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS dev_delete_guests ON public.guests;
CREATE POLICY dev_delete_guests ON public.guests
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS dev_select_reservations ON public.reservations;
CREATE POLICY dev_select_reservations ON public.reservations
FOR SELECT
TO anon, authenticated
USING (true);
DROP POLICY IF EXISTS dev_insert_reservations ON public.reservations;
CREATE POLICY dev_insert_reservations ON public.reservations
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS dev_update_reservations ON public.reservations;
CREATE POLICY dev_update_reservations ON public.reservations
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS dev_delete_reservations ON public.reservations;
CREATE POLICY dev_delete_reservations ON public.reservations
FOR DELETE
TO anon, authenticated
USING (true);

-- Rooms: allow read in development so views and RPCs work
DROP POLICY IF EXISTS dev_select_rooms ON public.rooms;
CREATE POLICY dev_select_rooms ON public.rooms
FOR SELECT
TO anon, authenticated
USING (true);

-- Optional: temporarily disable RLS entirely (not recommended long-term)
-- ALTER TABLE public.guests DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.reservations DISABLE ROW LEVEL SECURITY;

-- To revert later:
-- DROP POLICY IF EXISTS dev_select_guests ON public.guests;
-- DROP POLICY IF EXISTS dev_insert_guests ON public.guests;
-- DROP POLICY IF EXISTS dev_update_guests ON public.guests;
-- DROP POLICY IF EXISTS dev_delete_guests ON public.guests;
-- DROP POLICY IF EXISTS dev_select_reservations ON public.reservations;