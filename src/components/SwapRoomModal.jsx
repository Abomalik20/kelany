import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function SwapRoomModal({ open, onClose, sourceReservation, onSwapped }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setSelected(null);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const term = query.trim();
        const { data, error } = await supabase
          .from('reservations_overview')
          .select('id, guest_full_name:guest_full_name, room_number:room_number, check_in_date, check_out_date, status')
          .or(`guest_full_name.ilike.%${term}%,room_number.ilike.%${term}%`)
          .limit(20);
        if (error) throw error;
        setResults(data || []);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const doSwap = async () => {
    if (!sourceReservation || !selected) return;
    try {
      // Call server-side RPC 'swap_reservation_rooms' if available
      const { data, error } = await supabase.rpc('swap_reservation_rooms', { p_a: sourceReservation.id, p_b: selected.id });
      if (error) throw error;
      onSwapped && onSwapped();
      onClose();
    } catch (e) {
      // Fallback: try client-side swap (best-effort)
      try {
        // fetch current room ids
        const { data: aRow } = await supabase.from('reservations').select('room_id').eq('id', sourceReservation.id).single();
        const { data: bRow } = await supabase.from('reservations').select('room_id').eq('id', selected.id).single();
        const aRoom = aRow?.room_id ?? null;
        const bRoom = bRow?.room_id ?? null;
        // perform updates
        await supabase.from('reservations').update({ room_id: null }).eq('id', sourceReservation.id);
        await supabase.from('reservations').update({ room_id: aRoom }).eq('id', selected.id);
        await supabase.from('reservations').update({ room_id: bRoom }).eq('id', sourceReservation.id);
        onSwapped && onSwapped();
        onClose();
      } catch (ee) {
        window.alert('تعذّر تبديل الغرف: ' + (e.message || e || ee.message || ee));
      }
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white dark:bg-gray-800 rounded shadow-lg w-full max-w-2xl p-4" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">تبديل الغرف</h3>
          <button className="text-gray-500" onClick={onClose}>إغلاق</button>
        </div>
        <div className="mb-3 text-sm text-gray-600">المصدر: <strong>{sourceReservation ? `${sourceReservation.guest_full_name || ''} — غرفة ${sourceReservation.room_number || ''}` : ''}</strong></div>
        <div>
          <input className="border rounded px-3 py-2 w-full mb-3" placeholder="ابحث باسم النزيل أو رقم الغرفة" value={query} onChange={e=>setQuery(e.target.value)} />
          {loading ? <div className="text-sm text-gray-500">جارٍ البحث...</div> : (
            <div className="max-h-64 overflow-auto">
              {results.map(r => (
                <div key={r.id} className={`p-2 border-b cursor-pointer ${selected && selected.id === r.id ? 'bg-blue-50' : ''}`} onClick={()=>setSelected(r)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.guest_full_name || '—'}</div>
                      <div className="text-sm text-gray-500">غرفة {r.room_number || '—'} · {r.check_in_date || ''} → {r.check_out_date || ''}</div>
                    </div>
                    <div className="text-sm text-gray-600">{r.status || ''}</div>
                  </div>
                </div>
              ))}
              {results.length === 0 && <div className="text-sm text-gray-500">لا توجد نتائج.</div>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button className="px-3 py-2 rounded border" onClick={onClose}>إلغاء</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={doSwap} disabled={!selected}>تبديل الغرف</button>
        </div>
      </div>
    </div>
  );
}
