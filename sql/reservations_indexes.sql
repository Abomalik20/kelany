-- Useful indexes for reservations performance
CREATE INDEX IF NOT EXISTS idx_reservations_room_dates ON public.reservations (room_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_guest ON public.reservations (guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_created ON public.reservations (created_at);
