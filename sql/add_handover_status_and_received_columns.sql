-- Migration: add status, received_by and received_at to reception_shift_handovers
-- Usage: paste & run in Supabase SQL editor or psql

alter table public.reception_shift_handovers
  add column if not exists status text default 'pending';

alter table public.reception_shift_handovers
  add column if not exists received_by uuid null references public.staff_users(id) on delete set null;

alter table public.reception_shift_handovers
  add column if not exists received_at timestamptz null;

-- Optional: ensure status values are limited (basic check)
alter table public.reception_shift_handovers
  drop constraint if exists reception_shift_handovers_status_check;
alter table public.reception_shift_handovers
  add constraint reception_shift_handovers_status_check check (status in ('pending','received_by_staff','completed','received_by_manager'));
