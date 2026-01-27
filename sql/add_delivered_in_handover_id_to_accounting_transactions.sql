-- Migration: add delivered_in_handover_id to accounting_transactions to track aggregated deliveries
-- Usage: run in Supabase SQL editor or psql

alter table public.accounting_transactions
  add column if not exists delivered_in_handover_id uuid null references public.reception_shift_handovers(id) on delete set null;

create index if not exists idx_accounting_tx_delivered_handover on public.accounting_transactions(delivered_in_handover_id);
