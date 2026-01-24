import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function GroupDiscountModal({ show, onClose, agencyName, checkIn, checkOut, groupRows = [], currentUser, onApplied }) {
  const [percent, setPercent] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    if (show) {
      setSelectedIds(groupRows.map(r => r.room_id).filter(Boolean));
      setPercent(10);
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

  const apply = async (applyAll = false) => {
    try {
      if (!agencyName) return alert('Agency missing');
      if (Number.isNaN(Number(percent)) || Number(percent) < 0 || Number(percent) > 100) return alert('نسبة غير صالحة');
      setLoading(true);
      const payload = {
        p_agency_name: agencyName,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_percent: Number(percent),
        p_room_ids: applyAll ? null : (selectedIds && selectedIds.length>0 ? selectedIds : null),
        p_staff_user_id: currentUser?.id || null,
      };
      const { data, error } = await supabase.rpc('apply_group_discount', payload);
      if (error) throw error;
      const count = (data && data.length) || 0;
      alert(`تم تطبيق الخصم على ${count} حجزًا.`);
      if (typeof onApplied === 'function') onApplied({ count, data });
      onClose();
    } catch (e) {
      console.error('Group discount apply failed', e);
      alert('تعذّر تطبيق الخصم: ' + (e.message || e));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded shadow-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold">تطبيق خصم لمجموعة: {agencyName}</h3>
          <button className="text-gray-500" onClick={onClose}>إغلاق</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-sm">نسبة الخصم (%)</label>
            <input type="number" min={0} max={100} value={percent} onChange={e=>setPercent(e.target.value)} className="border rounded px-2 py-1" />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">اختر الغرف (اتركها محددة لتطبيق على هذه الغرف فقط)</div>
            <div className="max-h-48 overflow-auto border rounded p-2 text-sm">
              {groupRows && groupRows.length ? groupRows.map(r => (
                <label key={r.id} className="flex items-center gap-2 mb-1">
                  <input type="checkbox" checked={selectedIds.includes(r.room_id)} onChange={()=>toggle(r.room_id)} />
                  <span>{r.room_label || r.room_id} — {r.nightly_rate || r.total_amount}</span>
                </label>
              )) : <div className="text-gray-500">لا توجد غرف محمّلة لهذه المجموعة.</div>}
            </div>
            <div className="text-xs text-gray-500 mt-2">يمكنك اختيار غرف محددة ثم الضغط "تطبيق على المحدد" أو الضغط "تطبيق على الكل" لتطبيق الخصم على جميع حجوزات المجموعة.</div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button className="px-3 py-1 border rounded" onClick={onClose} disabled={loading}>إلغاء</button>
            <button className="px-3 py-1 border rounded bg-yellow-100" onClick={()=>apply(false)} disabled={loading}>تطبيق على المحدد</button>
            <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={()=>apply(true)} disabled={loading}>تطبيق على الكل</button>
          </div>
        </div>
      </div>
    </div>
  );
}
