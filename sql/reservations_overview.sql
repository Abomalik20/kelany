-- Aggregated reservations view for UI
DROP VIEW IF EXISTS public.reservations_overview;

CREATE OR REPLACE VIEW public.reservations_overview AS
SELECT
  r.id,
  r.guest_id,
  g.full_name AS guest_name,
  g.phone AS guest_phone,
  g.email AS guest_email,
  r.room_id,
  COALESCE(NULLIF(rm.room_number, ''), NULLIF(rm.room_code, ''), 'غرفة #' || left(rm.id::text, 8)) AS room_label,
  COALESCE(rt.name_ar, rt.name) AS room_type_name,
  rm.status::text AS room_status,
  rm.cleanliness::text AS room_cleanliness,
  r.check_in_date,
  r.check_out_date,
  (GREATEST(0, (r.check_out_date - r.check_in_date)))::int AS nights,
  r.status,
  r.guests_count,
  r.nightly_rate,
  r.total_amount,
  r.amount_paid,
  (r.total_amount - r.amount_paid) AS remaining_amount,
  r.currency,
  r.payer_type,
  r.agency_name,
  r.payment_method,
  r.special_requests,
  r.notes,
  r.created_at,
  r.updated_at,
  r.created_by,
  r.updated_by,
  su.full_name  AS created_by_name,
  su.username   AS created_by_username,
  (COALESCE(r.check_in_date, CURRENT_DATE) <= CURRENT_DATE
   AND (r.check_out_date IS NULL OR r.check_out_date >= CURRENT_DATE)) AS is_current,
  (COALESCE(r.check_in_date, CURRENT_DATE) > CURRENT_DATE) AS is_upcoming,
  (COALESCE(r.check_out_date, CURRENT_DATE) < CURRENT_DATE) AS is_past
FROM public.reservations r
LEFT JOIN public.guests g ON g.id = r.guest_id
LEFT JOIN public.rooms rm ON rm.id = r.room_id
LEFT JOIN public.room_types rt ON rt.id = rm.room_type_id
LEFT JOIN public.staff_users su ON su.id = r.created_by;
