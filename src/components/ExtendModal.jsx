import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

export default function ExtendModal({ row, onClose, onDone }) {
  const currentUser = useContext(AuthContext);
  const [checkOut, setCheckOut] = useState(row?.check_out_date || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => { setCheckOut(row?.check_out_date || ''); }, [row]);

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const { error } = await supabase.rpc('extend_reservation', { p_reservation_id: row.id, p_new_check_out: checkOut, p_staff_user_id: currentUser?.id || null });
      if (error) throw error;
      onDone && onDone();
      onClose && onClose();
    } catch (e) {
      const msg = String(e?.message || e || '');
      setError(msg);
      try {
        const { data, error: sErr } = await supabase.rpc('suggest_split_stay', { p_check_in: row.check_in_date, p_check_out: checkOut, p_room_type_id: null });
        if (!sErr) setSuggestions(data||[]);
      } catch (_) {}
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full md:max-w-md rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="font-bold">تمديد الحجز</div>
          <div className="text-xs text-gray-500">اختر تاريخ مغادرة جديد وسيتم التحقق من التعارض</div>
          <div className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2">
            <div><span className="text-gray-500">النزيل:</span> <span className="font-medium">{row.guest_name}</span></div>
            <div><span className="text-gray-500">الغرفة:</span> <span className="font-medium">{row.room_label}</span> • <span className="font-medium">{row.room_type_name}</span></div>
            <div><span className="text-gray-500">الفترة:</span> <span className="font-medium">{row.check_in_date}</span> → <span className="font-medium">{row.check_out_date}</span> (<span className="font-medium">{row.nights}</span> ليال)</div>
            <div><span className="text-gray-500">السعر/ليلة:</span> <span className="font-medium">{row.nightly_rate}</span> • <span className="text-gray-500">الإجمالي:</span> <span className="font-medium">{row.total_amount}</span> • <span className="text-gray-500">المتبقي:</span> <span className="font-medium">{row.remaining_amount}</span></div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="text-sm">تاريخ الخروج الجديد</label>
          <input type="date" className="border rounded px-3 py-2" value={checkOut} onChange={e=>setCheckOut(e.target.value)} />
          {error && <div className="text-xs text-red-600">تعذّر التمديد: {error}</div>}
          {suggestions && suggestions.length>0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
              <div className="font-semibold mb-2">بدائل مقترحة (Split Stay):</div>
              <ul className="list-disc pr-5">
                {suggestions.slice(0,5).map((s,i)=> (
                  <li key={i}>{s.room_label}: {s.available_from} → {s.available_to} ({s.nights} ليال)</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button className="px-3 py-2 border rounded" onClick={onClose}>إلغاء</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" disabled={loading} onClick={submit}>{loading?'جارٍ...':'تمديد'}</button>
        </div>
      </div>
    </div>
  );
}
