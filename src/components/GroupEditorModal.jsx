import React, { useMemo, useState, useContext, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

// GroupEditorModal: edit per-room overrides (discount/surcharge/fixed rate) for a company group
export default function GroupEditorModal({ show, onClose, agencyName, checkIn, checkOut, groupRows = [], onApplied }) {
  const auth = useContext(AuthContext);
  const [saving, setSaving] = useState(false);
  const [modeMap, setModeMap] = useState({}); // reservation_id -> { type: 'percent'|'amount'|'surcharge'|'fixed_rate', value: number }

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const d1 = new Date(checkIn), d2 = new Date(checkOut);
    const diff = Math.round((d2 - d1) / (1000*60*60*24));
    return diff > 0 ? diff : 0;
  }, [checkIn, checkOut]);

  const computeNewTotal = useCallback((row) => {
    const base = Number(row.total_amount || 0) || 0;
    const ov = modeMap[row.id];
    if (!ov || !ov.type) return base;
    const v = Number(ov.value || 0) || 0;
    if (ov.type === 'percent') {
      return Math.max(0, Math.round(base * (1 - v/100) * 100) / 100);
    } else if (ov.type === 'amount') {
      return Math.max(0, Math.round((base - v) * 100) / 100);
    } else if (ov.type === 'surcharge') {
      return Math.max(0, Math.round((base + v) * 100) / 100);
    } else if (ov.type === 'fixed_rate') {
      const rate = v; const n = nights || 0;
      return Math.max(0, Math.round((rate * n) * 100) / 100);
    }
    return base;
  }, [modeMap, nights]);

  const totalAfter = useMemo(() => {
    return (groupRows || []).reduce((s, r) => s + computeNewTotal(r), 0);
  }, [groupRows, computeNewTotal]);

  const handleChangeType = (id, type) => {
    setModeMap(prev => ({ ...prev, [id]: { ...(prev[id] || {}), type } }));
  };
  const handleChangeValue = (id, value) => {
    setModeMap(prev => ({ ...prev, [id]: { ...(prev[id] || {}), value } }));
  };

  const submit = async () => {
    if (!show) return;
    setSaving(true);
    try {
      // Apply overrides by updating reservation totals or nightly_rate (for fixed_rate)
      for (const row of groupRows || []) {
        const ov = modeMap[row.id];
        if (!ov || !ov.type) continue;
        const newTotal = computeNewTotal(row);
        let payload = { total_amount: newTotal, updated_by: auth?.id || null };
        if (ov.type === 'fixed_rate') {
          payload.nightly_rate = Number(ov.value || 0) || null;
        }
        const { error } = await supabase.from('reservations').update(payload).eq('id', row.id);
        if (error) throw error;
      }
      onApplied && onApplied({ count: Object.keys(modeMap || {}).length });
      onClose && onClose();
    } catch (e) {
      console.error('Apply group overrides failed', e);
      alert('تعذّر تطبيق تعديلات المجموعة: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded shadow-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold">تعديل مجموعة — {agencyName || ''}</h3>
          <button className="text-gray-500" onClick={onClose}>إغلاق</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-600">الفترة: {checkIn} → {checkOut} • الليالي: {nights}</div>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-right">الغرفة</th>
                  <th className="px-2 py-1 text-right">الإجمالي الحالي</th>
                  <th className="px-2 py-1 text-right">نوع التعديل</th>
                  <th className="px-2 py-1 text-right">القيمة</th>
                  <th className="px-2 py-1 text-right">الإجمالي بعد التعديل</th>
                </tr>
              </thead>
              <tbody>
                {(groupRows || []).map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">{r.room_label || r.room_id}</td>
                    <td className="px-2 py-1">{Number(r.total_amount || 0)}</td>
                    <td className="px-2 py-1">
                      <select className="border rounded px-2 py-1" value={(modeMap[r.id]?.type)||''} onChange={e=>handleChangeType(r.id, e.target.value)}>
                        <option value="">— لا تعديل —</option>
                        <option value="percent">خصم ٪</option>
                        <option value="amount">خصم مبلغ</option>
                        <option value="surcharge">زيادة مبلغ</option>
                        <option value="fixed_rate">سعر ليلي ثابت</option>
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" className="border rounded px-2 py-1 w-28" value={(modeMap[r.id]?.value)||''} onChange={e=>handleChangeValue(r.id, e.target.value)} />
                    </td>
                    <td className="px-2 py-1 font-medium">{computeNewTotal(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <div>إجمالي المجموعة بعد التعديلات: <span className="font-bold">{Math.round(totalAfter*100)/100}</span></div>
            <div className="flex gap-2">
              <button className="px-3 py-1 border rounded" onClick={onClose} disabled={saving}>إلغاء</button>
              <button className="px-3 py-1 bg-indigo-600 text-white rounded" onClick={submit} disabled={saving}>{saving?'جارٍ...':'تطبيق التعديلات'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
