-- Migration: add to_staff_user_id to reception_shift_handovers
-- Usage: paste & run in Supabase SQL editor or psql

alter table public.reception_shift_handovers
add column if not exists to_staff_user_id uuid;

-- إزالة القيد إن وُجد ثم إضافته بشكل آمن (Postgres لا يدعم IF NOT EXISTS مع ADD CONSTRAINT)
alter table public.reception_shift_handovers
  drop constraint if exists reception_shift_handovers_to_staff_fkey;
alter table public.reception_shift_handovers
  add constraint reception_shift_handovers_to_staff_fkey
  foreign key (to_staff_user_id) references public.staff_users(id) on delete set null;

-- optional: create an index for quick lookups of pending handovers by staff
create index if not exists idx_reception_shift_handovers_to_staff_txdate on public.reception_shift_handovers(to_staff_user_id, tx_date);

-- Note: this migration only adds the column; existing code should be updated to use this column
