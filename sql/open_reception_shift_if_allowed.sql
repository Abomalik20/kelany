-- RPC to open a reception shift only if no other open shift exists for the same date
-- Paste & run this in Supabase SQL editor (or psql) to create the function.

create or replace function public.open_reception_shift_if_allowed(p_shift_date date, p_staff_user_id uuid)
returns table(id uuid, shift_date date, staff_user_id uuid, status text) as $$
declare
  existing_open_count int;
  new_row public.reception_shifts%rowtype;
begin
  -- تحقق فقط أنه لا توجد وردية مفتوحة حالياً لهذا الموظف
  select count(*) into existing_open_count
  from public.reception_shifts rs
  where rs.staff_user_id = p_staff_user_id
    and rs.status = 'open';

  if existing_open_count > 0 then
    RAISE EXCEPTION 'لا يمكن فتح وردية جديدة الآن، يوجد وردية قائمة لم تُغلق بعد. برجاء إغلاق الوردية الحالية أولًا ثم إعادة المحاولة.' USING ERRCODE = 'P0001';
  end if;

  insert into public.reception_shifts(shift_date, staff_user_id, status)
  values (p_shift_date, p_staff_user_id, 'open')
  returning * into new_row;

  return query select new_row.id, new_row.shift_date, new_row.staff_user_id, new_row.status;
end;
$$ language plpgsql security definer;
