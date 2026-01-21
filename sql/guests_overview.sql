-- Create aggregated guests overview view
-- Notes:
-- - Assumes tables: public.guests, public.reservations
-- - Uses only date-based logic (no status/amount fields required).
-- - total_spent is set to 0 for now (add a payments/amount column later to compute it).

DROP VIEW IF EXISTS public.guests_overview;

CREATE OR REPLACE VIEW public.guests_overview AS
WITH res AS (
  SELECT
    r.guest_id,
    MAX(COALESCE(r.check_out_date, r.check_in_date)) AS last_visit_at,
    COUNT(*) AS visits_count,
    0::numeric AS total_spent,
    bool_or(
      COALESCE(r.check_in_date, CURRENT_DATE) <= CURRENT_DATE
      AND (r.check_out_date IS NULL OR r.check_out_date >= CURRENT_DATE)
    ) AS has_current_stay,
    bool_or(
      COALESCE(r.check_in_date, CURRENT_DATE) > CURRENT_DATE
    ) AS has_upcoming_reservation
  FROM public.reservations r
  GROUP BY r.guest_id
)
SELECT
  g.id,
  g.first_name,
  g.last_name,
  g.full_name,
  g.phone,
  g.avatar_url,
  g.id_doc_type,
  g.id_doc_number,
  g.id_doc_url,
  g.id_doc_uploaded_at,
  g.email,
  g.nationality,
  g.national_id,
  g.address,
  g.city,
  g.country,
  COALESCE(g.is_vip, false) AS is_vip,
  g.notes,
  g.created_at,
  g.created_by,
  su.full_name  AS created_by_name,
  su.username   AS created_by_username,
  COALESCE(res.last_visit_at, NULL) AS last_visit_at,
  COALESCE(res.visits_count, 0) AS visits_count,
  COALESCE(res.total_spent, 0) AS total_spent,
  COALESCE(res.has_current_stay, FALSE) AS has_current_stay,
  COALESCE(res.has_upcoming_reservation, FALSE) AS has_upcoming_reservation,
  (
    NOT COALESCE(res.has_current_stay, FALSE)
    AND NOT COALESCE(res.has_upcoming_reservation, FALSE)
    AND g.created_at::date < CURRENT_DATE
  ) AS is_inactive
FROM public.guests g
LEFT JOIN res ON res.guest_id = g.id
LEFT JOIN public.staff_users su ON su.id = g.created_by;


-- Recommended indexes to support the view efficiently
-- Run these once (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_reservations_guest_id ON public.reservations (guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON public.reservations (check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests (phone);
