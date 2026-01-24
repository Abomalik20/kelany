import React, { useEffect, useState, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { ensureOpenShift } from '../utils/checkShift';

export default function GroupPaymentModal({ show, onClose, groupRows = [], currentUser, onDone }) {
  const [totalAmount, setTotalAmount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [mode, setMode] = useState('per_remaining'); // 'equal' | 'per_remaining'
  const [method, setMethod] = useState('cash');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0,10));
  const [loading, setLoading] = useState(false);
  const auth = useContext(AuthContext);

  useEffect(()=>{
    if (show) {
      setSelectedIds(groupRows.map(r => r.id));
      setTotalAmount(groupRows.reduce((s,r)=>s + (Number(r.remaining_amount || r.total_amount || 0)), 0));
      setMode('per_remaining');
      setMethod('cash');
    }
  }, [show, groupRows]);

  if (!show) return null;

  const toggle = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev || []);
      if (s.has(id)) s.delete(id); else s.add(id);
      return Array.from(s);
    });
  };

  const submit = async () => {
    try {
      // ensure open shift for reception/housekeeping
      try {
        const ok = await ensureOpenShift(auth);
        if (!ok) { window.alert('لا يمكنك تسجيل دفعة بدون وردية مفتوحة.'); return; }
      } catch (_) { window.alert('تعذّر التحقق من حالة الوردية.'); return; }

      if (!selectedIds || selectedIds.length === 0) return alert('اختر على الأقل حجزًا واحدًا');
      const rows = groupRows.filter(r => selectedIds.includes(r.id));
      if (!rows.length) return alert('لا توجد حجوزات مختارة');
      const total = Number(totalAmount) || 0;
      if (total <= 0) return alert('أدخل مبلغًا صالحًا');

      setLoading(true);

      // compute allocations
      let allocations = [];
      if (mode === 'equal') {
        const per = Math.round((total / rows.length) * 100) / 100;
        allocations = rows.map(r => ({ id: r.id, amount: per }));
      } else {
        // per_remaining: allocate up to remaining_amount, in order, proportionally by remaining
        const totals = rows.map(r => ({ id: r.id, remaining: Math.max(0, Number(r.remaining_amount || r.total_amount || 0)) }));
        const sumRemaining = totals.reduce((s,t)=>s + t.remaining, 0);
        if (sumRemaining <= 0) {
          // fallback equal
          const per = Math.round((total / rows.length) * 100) / 100;
          allocations = rows.map(r => ({ id: r.id, amount: per }));
        } else {
          allocations = totals.map(t => ({ id: t.id, amount: Math.round((total * (t.remaining / sumRemaining)) * 100) / 100 }));
        }
      }

      // for each allocation, update reservation.amount_paid and insert accounting_transactions
      for (const a of allocations) {
        const amt = Number(a.amount) || 0;
        if (amt <= 0) continue;

        // update reservation amount_paid (increment)
        try {
          // fetch current amount_paid to avoid race
          const { data: resRow } = await supabase.from('reservations').select('amount_paid, room_label, guest_name, check_in_date, check_out_date, nights').eq('id', a.id).single();
          const currentPaid = Number(resRow?.amount_paid || 0);
          const newPaid = Math.round((currentPaid + amt) * 100) / 100;
          const { error: upErr } = await supabase.from('reservations').update({ amount_paid: newPaid, updated_by: currentUser?.id || auth?.id || null }).eq('id', a.id);
          if (upErr) console.error('reservation update failed', upErr);

          // reception shift id
          let receptionShiftId = null;
          try {
            const todayStr = txDate || new Date().toISOString().slice(0,10);
            const { data: shifts } = await supabase.from('reception_shifts').select('id').eq('staff_user_id', currentUser?.id || auth?.id).eq('shift_date', todayStr).eq('status','open').limit(1);
            if (shifts && shifts.length>0) receptionShiftId = shifts[0].id;
          } catch(_) {}

          // accounting category
          let categoryId = null;
          try {
            const { data: cats } = await supabase.from('accounting_categories').select('id').eq('type','income').eq('name','إيرادات الغرف').limit(1);
            if (cats && cats.length>0) categoryId = cats[0].id;
          } catch(_) {}

          const paymentMethodForAccounting = ['cash','instapay','other'].includes(method) ? method : 'other';

          const description = `سداد مجموعة — جزء من دفعة`;
          const accPayload = {
            tx_date: txDate || new Date().toISOString().slice(0,10),
            direction: 'income',
            category_id: categoryId,
            amount: amt,
            payment_method: paymentMethodForAccounting,
            bank_account_id: null,
            source_type: 'reservation',
            reservation_id: a.id,
            description,
            status: ['cash','instapay'].includes(paymentMethodForAccounting) ? 'pending' : 'confirmed',
            reception_shift_id: receptionShiftId,
            created_by: currentUser?.id || auth?.id || null,
          };
          const { error: accErr } = await supabase.from('accounting_transactions').insert(accPayload);
          if (accErr) console.error('accounting insert failed', accErr);
        } catch (e) { console.error('group payment item failed', e); }
      }

      try { window.dispatchEvent(new Event('accounting-tx-updated')); } catch (_) {}
      onDone && onDone();
      onClose && onClose();
    } catch (e) {
      console.error('Group payment failed', e);
      alert('تعذّر تسجيل دفعة المجموعة: ' + (e.message || e));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded shadow-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold">دفع مجموعة</h3>
          <button className="text-gray-500" onClick={onClose}>إغلاق</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-sm">المبلغ الإجمالي</label>
            <input type="number" className="border rounded px-2 py-1" value={totalAmount} onChange={e=>setTotalAmount(e.target.value)} />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">اختر الحجوزات التي تشملها الدفعة</div>
            <div className="max-h-48 overflow-auto border rounded p-2 text-sm">
              {groupRows && groupRows.length ? groupRows.map(r => (
                <label key={r.id} className="flex items-center gap-2 mb-1">
                  <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={()=>toggle(r.id)} />
                  <span>{r.room_label || r.room_id} — متبقي: {r.remaining_amount ?? r.total_amount}</span>
                </label>
              )) : <div className="text-gray-500">لا توجد حجوزات محمّلة لهذه المجموعة.</div>}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">كيفية التوزيع</div>
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode==='per_remaining'} onChange={()=>setMode('per_remaining')} /> توزيع حسب المتبقي</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode==='equal'} onChange={()=>setMode('equal')} /> تقسيم بالتساوي</label>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">طريقة الدفع</div>
            <select className="border rounded px-2 py-1" value={method} onChange={e=>setMethod(e.target.value)}>
              <option value="cash">نقدي (خزنة)</option>
              <option value="instapay">إنستاباي / بطاقة بنكية</option>
              <option value="other">محفظة إلكترونية</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button className="px-3 py-1 border rounded" onClick={onClose} disabled={loading}>إلغاء</button>
            <button className="px-3 py-1 bg-emerald-600 text-white rounded" onClick={submit} disabled={loading}>{loading?'جارٍ...':'تأكيد الدفع'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
