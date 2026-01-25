import React, { useEffect, useState, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { ensureOpenShift } from '../utils/checkShift';

export default function GroupPaymentModal({ show, onClose, groupRows = [], currentUser, onDone }) {
  const [totalAmount, setTotalAmount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [mode, setMode] = useState('per_remaining'); // 'equal' | 'per_remaining'
  const [method, setMethod] = useState('cash');
  const [txDate] = useState(() => new Date().toISOString().slice(0,10));
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
      // تحقق من الوردية لليوم
      try {
        const ok = await ensureOpenShift(auth);
        if (!ok) { window.alert('لا يمكنك تسجيل دفعة بدون وردية مفتوحة.'); return; }
      } catch (_) { window.alert('تعذّر التحقق من حالة الوردية.'); return; }

      if (!selectedIds || selectedIds.length === 0) return alert('اختر على الأقل حجزًا واحدًا');
      const total = Number(totalAmount) || 0;
      if (total <= 0) return alert('أدخل مبلغًا صالحًا');
      setLoading(true);

      // نفّذ الدفع الذرّي عبر RPC في قاعدة البيانات
      const params = {
        p_staff_user_id: currentUser?.id || auth?.id || null,
        p_tx_date: txDate || new Date().toISOString().slice(0,10),
        p_payment_method: method,
        p_total_amount: total,
        p_reservation_ids: selectedIds,
        p_distribution: mode,
      };
      const { error } = await supabase.rpc('apply_group_payment', params);
      if (error) {
        const msg = error?.message || error?.details || 'تعذّر تنفيذ الدفع الجماعي.';
        alert(msg);
        setLoading(false);
        return;
      }
      // تحديث الواجهة
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
