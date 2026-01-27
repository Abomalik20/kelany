-- Migration: add short_code (human-friendly shift number) to reception_shifts
-- Usage: run in Supabase SQL editor or psql

-- Create a dedicated sequence for short_code
do $$
begin
  if not exists (select 1 from pg_class where relkind = 'S' and relname = 'reception_shifts_short_code_seq') then
    create sequence public.reception_shifts_short_code_seq;
  end if;
end $$;

-- Add column if missing
alter table public.reception_shifts
  add column if not exists short_code integer;

-- Set default from the sequence
alter table public.reception_shifts
  alter column short_code set default nextval('public.reception_shifts_short_code_seq');

-- Backfill existing rows that have NULL short_code
update public.reception_shifts
   set short_code = nextval('public.reception_shifts_short_code_seq')
 where short_code is null;

-- Ensure uniqueness for display
create unique index if not exists idx_reception_shifts_short_code on public.reception_shifts(short_code);
