-- Migration: add opening_cash column to reception_shifts
-- Usage: paste & run in Supabase SQL editor or psql

alter table public.reception_shifts
  add column if not exists opening_cash numeric(12,2) default 0;

-- ensure indexes used by shift queries
create index if not exists idx_reception_shifts_staff_date on public.reception_shifts(staff_user_id, shift_date desc);
