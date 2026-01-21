import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

export default function PaymentModal({ row, onClose, onDone }) {
  const currentUser = useContext(AuthContext);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState(() => {
    const pm = row?.payment_method || 'cash';
    return (pm === 'card' || pm === 'transfer' || pm === 'bank') ? 'instapay' : pm;
  });
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAmount(Number(row?.remaining_amount || 0));
    const pm = row?.payment_method || 'cash';
    setMethod((pm === 'card' || pm === 'transfer' || pm === 'bank') ? 'instapay' : pm);
    try {
      setTxDate(new Date().toISOString().slice(0, 10));
    } catch (_) {}
  }, [row]);

  const submit = async () => {
    setLoading(true);
    try {
      const paid = Number(row?.amount_paid || 0) + Number(amount || 0);
      const updatePayload = { amount_paid: paid, payment_method: method };
      if (currentUser && currentUser.id) {
        updatePayload.updated_by = currentUser.id;
      }
      const { error } = await supabase.from('reservations').update(updatePayload).eq('id', row.id);
      if (error) throw error;

      // تسجيل الحركة في نظام المحاسبة الذكي
      const amtNumber = Number(amount || 0);
      if (amtNumber > 0) {
        let receptionShiftId = null;
        try {
          if (currentUser && currentUser.id) {
            const todayStr = (txDate || new Date().toISOString().slice(0, 10));
            const { data: shifts } = await supabase
              .from('reception_shifts')
              .select('id,status,shift_date')
              .eq('staff_user_id', currentUser.id)
              .eq('shift_date', todayStr)
              .eq('status', 'open')
              .order('opened_at', { ascending: false })
              .limit(1);
            if (shifts && shifts.length > 0) {
              receptionShiftId = shifts[0].id;
            }
          }
        } catch (_) {}

        let categoryId = null;
        try {
          const { data: cats } = await supabase
            .from('accounting_categories')
            .select('id,name,type')
            .eq('type', 'income')
            .eq('name', 'إيرادات الغرف')
            .limit(1);
          if (cats && cats.length > 0) {
            categoryId = cats[0].id;
          }
        } catch (_) {}

        const paymentMethodForAccounting = ['cash','instapay','other'].includes(method)
          ? method
          : 'other';

        const descParts = [];
        if (row?.guest_name) descParts.push(`نزيل: ${row.guest_name}`);
        if (row?.room_label) descParts.push(`غرفة: ${row.room_label}`);
        const description = descParts.length ? `سداد من حجز ${row?.code || row?.id || ''} — ${descParts.join(' / ')}` : 'سداد من حجز';

        const accPayload = {
          tx_date: txDate || new Date().toISOString().slice(0, 10),
          direction: 'income',
          category_id: categoryId,
          amount: amtNumber,
          payment_method: paymentMethodForAccounting,
          bank_account_id: null,
          source_type: 'reservation',
          reservation_id: row.id,
          description,
          status: ['cash','instapay'].includes(paymentMethodForAccounting) ? 'pending' : 'confirmed',
          reception_shift_id: receptionShiftId,
        };
        if (currentUser && currentUser.id) {
          accPayload.created_by = currentUser.id;
        }
        try {
          const { error: accError } = await supabase.from('accounting_transactions').insert(accPayload);
          if (accError) {
            console.error('accounting insert error', accError);
          } else {
            // أخبر صفحة المحاسبة أن هناك حركة جديدة لتحديث الملخصات فورًا
            try {
              const evt = new Event('accounting-tx-updated');
              window.dispatchEvent(evt);
            } catch (_) {}
          }
        } catch (e) {
          console.error('accounting insert exception', e);
        }
      }
      onDone && onDone();
      onClose && onClose();
    } catch(e) {
      alert('تعذّر تسجيل الدفع: '+(e.message||e));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full md:max-w-md rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="font-bold">تسجيل دفعة</div>
          <div className="text-xs text-gray-500">اختر طريقة الدفع وأدخل المبلغ</div>
          <div className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2">
            <div><span className="text-gray-500">النزيل:</span> <span className="font-medium">{row.guest_name}</span></div>
            <div><span className="text-gray-500">الغرفة:</span> <span className="font-medium">{row.room_label}</span> • <span className="font-medium">{row.room_type_name}</span></div>
            <div><span className="text-gray-500">الفترة:</span> <span className="font-medium">{row.check_in_date}</span> → <span className="font-medium">{row.check_out_date}</span> (<span className="font-medium">{row.nights}</span> ليال)</div>
            <div><span className="text-gray-500">الإجمالي:</span> <span className="font-medium">{row.total_amount}</span> • <span className="text-gray-500">المدفوع:</span> <span className="font-medium">{row.amount_paid}</span> • <span className="text-gray-500">المتبقي:</span> <span className="font-medium">{row.remaining_amount}</span></div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="text-sm">المبلغ</label>
          <input type="number" className="border rounded px-3 py-2" value={amount} onChange={e=>setAmount(e.target.value)} min={0} />
          <label className="text-sm">تاريخ الدفع</label>
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={txDate}
            onChange={e => setTxDate(e.target.value)}
          />
          <label className="text-sm">طريقة الدفع</label>
          <select className="border rounded px-3 py-2" value={method} onChange={e=>setMethod(e.target.value)}>
            <option value="cash">نقدي (خزنة)</option>
            <option value="instapay">إنستاباي / بطاقة بنكية</option>
            <option value="other">محفظة إلكترونية</option>
          </select>
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button className="px-3 py-2 border rounded" onClick={onClose}>إلغاء</button>
          <button className="px-3 py-2 rounded bg-emerald-600 text-white" disabled={loading} onClick={submit}>{loading?'جارٍ...':'دفع'}</button>
        </div>
      </div>
    </div>
  );
}
