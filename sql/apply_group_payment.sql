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
  v_total numeric := coalesce(p_total_amount, 0);
  v_count int := array_length(p_reservation_ids, 1);
  v_sum_remaining numeric := 0;
  r record;
  v_alloc numeric;
  v_status text;
  v_desc text := 'سداد مجموعة — جزء من دفعة';
  v_distribution text := lower(coalesce(p_distribution, 'per_remaining'));
begin
  if v_total <= 0 then
    raise exception 'المبلغ الإجمالي غير صالح' using errcode = 'P0001';
  end if;
  if v_count is null or v_count <= 0 then
    raise exception 'لا توجد حجوزات مختارة للدفع' using errcode = 'P0001';
  end if;

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
    select reservation_id,
           sum(case when direction='income' and status='confirmed' then amount else 0 end) as confirmed,
           sum(case when direction='income' and status='pending' then amount else 0 end) as pending
    from public.accounting_transactions
    where reservation_id = any(p_reservation_ids)
    group by reservation_id
  ) inc on inc.reservation_id = r.id
  left join (
    select reservation_id,
           sum(case when direction='expense' and status='confirmed' then amount else 0 end) as confirmed,
           sum(case when direction='expense' and status='pending' then amount else 0 end) as pending
    from public.accounting_transactions
    where reservation_id = any(p_reservation_ids)
      and source_type = 'reservation'
    group by reservation_id
  ) ref on ref.reservation_id = r.id
  where r.id = any(p_reservation_ids);

  select sum(remaining) into v_sum_remaining from tmp_remaining;

  if v_sum_remaining <= 0 then
    -- لا يوجد متبقي؛ قسّم بالتساوي كحل بديل
    v_distribution := 'equal';
  end if;

  -- توزيع وإنشاء معاملات
  for r in (
    select reservation_id, remaining from tmp_remaining
  ) loop
    if lower(v_distribution) = 'equal' or v_sum_remaining <= 0 then
      v_alloc := round((v_total / v_count)::numeric, 2);
    else
      if r.remaining <= 0 then
        v_alloc := 0;
      else
        v_alloc := round((v_total * (r.remaining / v_sum_remaining))::numeric, 2);
        if v_alloc > r.remaining then v_alloc := r.remaining; end if;
      end if;
    end if;

    if v_alloc > 0 then
      insert into public.accounting_transactions(
        tx_date, direction, category_id, amount, payment_method,
        bank_account_id, source_type, reservation_id, description,
        status, reception_shift_id, created_by
      ) values (
        p_tx_date,
        'income',
        null,
        v_alloc,
        lower(coalesce(p_payment_method,'other')),
        null,
        'reservation',
        r.reservation_id,
        v_desc,
        v_status,
        v_shift_id,
        p_staff_user_id
      );
    end if;

    return query select r.reservation_id as reservation_id, v_alloc as applied_amount, v_status as tx_status;
  end loop;

  return;
end;
$$ language plpgsql security definer;
