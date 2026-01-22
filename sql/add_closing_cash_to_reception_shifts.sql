-- Migration: add closing_cash column to reception_shifts
-- Usage: paste & run in Supabase SQL editor or psql

alter table public.reception_shifts
  add column if not exists closing_cash numeric default 0;

-- If you also want a counted_cash column, uncomment below (use same type as closing_cash)
-- alter table public.reception_shifts
--   add column if not exists counted_cash numeric default 0;

create index if not exists idx_reception_shifts_shift_date_status on public.reception_shifts(shift_date, status);
