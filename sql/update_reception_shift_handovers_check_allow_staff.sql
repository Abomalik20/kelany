-- Migration: update reception_shift_handovers CHECK to allow pending to_staff_user_id
-- Usage: paste & run in Supabase SQL editor or psql

-- إسقاط القيد القديم إن وُجد ثم إضافة قيد جديد يدعم ثلاث حالات:
-- 1) to_shift_id محدد (و to_manager_id/to_staff_user_id NULL)
-- 2) to_manager_id محدد (و to_shift_id/to_staff_user_id NULL)
-- 3) to_staff_user_id محدد كحالة "معلق" (و to_shift_id/to_manager_id NULL)

alter table public.reception_shift_handovers
  drop constraint if exists reception_shift_handovers_check;

alter table public.reception_shift_handovers
  add constraint reception_shift_handovers_check check (
    (to_shift_id IS NOT NULL AND to_manager_id IS NULL AND to_staff_user_id IS NULL)
    OR (to_shift_id IS NULL AND to_manager_id IS NOT NULL AND to_staff_user_id IS NULL)
    OR (to_shift_id IS NULL AND to_manager_id IS NULL AND to_staff_user_id IS NOT NULL)
  );

-- تأكد من وجود الفهارس اللازمة
create index if not exists idx_shift_handovers_to_staff on public.reception_shift_handovers(to_staff_user_id);
