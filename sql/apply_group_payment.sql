-- RPC: Apply a group payment atomically across reservations
-- Usage: call from frontend with staff user, tx date, payment method, total amount, selected reservation ids

create or replace function public.apply_group_payment(
  p_staff_user_id uuid,
  p_tx_date date,
  p_payment_method text,
  p_total_amount numeric,
  p_reservation_ids uuid[],
  p_distribution text default 'per_remaining' -- 'per_remaining' | 'equal'
)
returns table(reservation_id uuid, applied_amount numeric, tx_status text) as $$
declare
  v_shift_id uuid;
  v_is_cash boolean;
  -- اجعل المبلغ الإجمالي عددًا صحيحًا (تقريب لأقرب عدد صحيح)
  v_total numeric := round(coalesce(p_total_amount, 0));
  v_count int := array_length(p_reservation_ids, 1);
  v_sum_remaining numeric := 0;
  rec record;
  v_alloc numeric;
  v_status text;
  v_desc text := 'سداد مجموعة — جزء من دفعة';
  v_distribution text := lower(coalesce(p_distribution, 'per_remaining'));
  v_role text;
  v_remaining_total numeric := 0; -- لتوزيع البواقي بعد التقريب
begin
  if v_total <= 0 then
    raise exception 'المبلغ الإجمالي غير صالح' using errcode = 'P0001';
  end if;
  if v_count is null or v_count <= 0 then
    raise exception 'لا توجد حجوزات مختارة للدفع' using errcode = 'P0001';
  end if;

  -- السماح للمدير/مساعد المدير بتجاوز شرط الوردية
  select role into v_role from public.staff_users where id = p_staff_user_id;
  if coalesce(v_role, '') not in ('manager','assistant_manager') then
    -- تحقق من وجود وردية مفتوحة لليوم للمستخدم
    select id into v_shift_id
    from public.reception_shifts
    where staff_user_id = p_staff_user_id
      and shift_date = p_tx_date
      and status = 'open'
    limit 1;
    if v_shift_id is null then
      raise exception 'لا توجد وردية مفتوحة لتاريخ الدفع المحدد' using errcode = 'P0001';
    end if;
  else
    -- المدير/مساعد المدير: لا حاجة لورديه؛ اترك v_shift_id فارغًا
    v_shift_id := null;
  end if;

  v_is_cash := lower(coalesce(p_payment_method, 'other')) = 'cash';
  v_status := case lower(coalesce(p_payment_method, 'other'))
                when 'cash' then 'confirmed'
                when 'instapay' then 'pending'
                else 'pending'
              end;

  -- حساب المتبقي لكل حجز بناءً على المعاملات المحاسبية
  create temporary table tmp_remaining(
    reservation_id uuid primary key,
    remaining numeric not null default 0
  ) on commit drop;

  insert into tmp_remaining(reservation_id, remaining)
  select r.id,
         greatest(0,
           coalesce(r.total_amount, 0) - (
             coalesce(inc.confirmed,0) + coalesce(inc.pending,0)
             - coalesce(ref.confirmed,0) - coalesce(ref.pending,0)
           )
         ) as remaining
  from public.reservations r
  left join (
    select at.reservation_id,
           sum(case when direction='income' and status='confirmed' then amount else 0 end) as confirmed,
           sum(case when direction='income' and status='pending' then amount else 0 end) as pending
    from public.accounting_transactions at
    where at.reservation_id = any(p_reservation_ids)
    group by at.reservation_id
  ) inc on inc.reservation_id = r.id
  left join (
    select at2.reservation_id,
           sum(case when direction='expense' and status='confirmed' then amount else 0 end) as confirmed,
           sum(case when direction='expense' and status='pending' then amount else 0 end) as pending
    from public.accounting_transactions at2
    where at2.reservation_id = any(p_reservation_ids)
      and source_type = 'reservation'
    group by at2.reservation_id
  ) ref on ref.reservation_id = r.id
  where r.id = any(p_reservation_ids);

  select sum(remaining) into v_sum_remaining from tmp_remaining;

  if v_sum_remaining <= 0 then
    -- لا يوجد متبقي؛ قسّم بالتساوي كحل بديل
    v_distribution := 'equal';
  end if;

  -- جدول مؤقت للتوزيع بالأعداد الصحيحة ثم توزيع البواقي
  create temporary table tmp_allocs(
    reservation_id uuid primary key,
    remaining numeric not null,
    alloc numeric not null default 0
  ) on commit drop;

  insert into tmp_allocs(reservation_id, remaining)
  select reservation_id, remaining from tmp_remaining;

  v_remaining_total := v_total;

  -- التوزيع الأولي (تقريب لأقرب عدد صحيح) مع احترام المتبقي لكل حجز والمجموع الكلي
  for rec in (
    select t.reservation_id, t.remaining from tmp_allocs t
  ) loop
    if lower(v_distribution) = 'equal' or v_sum_remaining <= 0 then
      v_alloc := round((v_total::numeric / v_count));
    else
      if rec.remaining <= 0 then
        v_alloc := 0;
      else
        v_alloc := round((v_total * (rec.remaining / v_sum_remaining)));
      end if;
    end if;

    -- قيود: لا تتجاوز متبقي الحجز (مقرب) ولا المبلغ المتبقي للتوزيع
    v_alloc := least(v_alloc, round(rec.remaining), v_remaining_total);

    if v_alloc > 0 then
      update tmp_allocs set alloc = v_alloc where reservation_id = rec.reservation_id;
      v_remaining_total := v_remaining_total - v_alloc;
    end if;
  end loop;

  -- توزيع أي بواقي متبقية بإضافة 1 للحجوزات التي لا تزال لديها سعة متبقية
  if v_remaining_total > 0 then
    for rec in (
      select reservation_id, remaining, alloc,
             (round(remaining) - alloc) as capacity
      from tmp_allocs
      order by capacity desc
    ) loop
      exit when v_remaining_total <= 0;
      if rec.capacity > 0 then
        update tmp_allocs set alloc = alloc + 1 where reservation_id = rec.reservation_id;
        v_remaining_total := v_remaining_total - 1;
      end if;
    end loop;
  end if;

  -- إنشاء معاملات محاسبية بمبالغ صحيحة فقط
  insert into public.accounting_transactions(
    tx_date, direction, category_id, amount, payment_method,
    bank_account_id, source_type, reservation_id, description,
    status, reception_shift_id, created_by
  )
  select
    p_tx_date,
    'income',
    null,
    alloc,
    lower(coalesce(p_payment_method,'other')),
    null,
    'reservation',
    reservation_id,
    v_desc,
    v_status,
    v_shift_id,
    p_staff_user_id
  from tmp_allocs
  where alloc > 0;

  -- نتائج الدالة: مبالغ صحيحة فقط
  return query
  select reservation_id as reservation_id, alloc as applied_amount, v_status as tx_status
  from tmp_allocs
  order by reservation_id;

  return;
end;
$$ language plpgsql security definer;
