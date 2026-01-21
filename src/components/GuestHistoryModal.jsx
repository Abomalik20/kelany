import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function GuestHistoryModal({ guest, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('id, check_in_date, check_out_date, status, created_at, room_id')
          .eq('guest_id', guest.id)
          .order('check_in_date', { ascending: false });
        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        console.error('Load guest history failed', e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [guest?.id]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">سجل الحجوزات: {guest?.full_name || ''}</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">إغلاق ✖</button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-gray-500">جارٍ التحميل...</div>
          ) : rows.length === 0 ? (
            <div className="text-gray-600">لا توجد حجوزات سابقة لهذا النزيل.</div>
          ) : (
            <div className="space-y-3">
              {rows.map(r => (
                <div key={r.id} className="border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{r.check_in_date ? new Date(r.check_in_date).toLocaleDateString('ar-EG') : '—'} → {r.check_out_date ? new Date(r.check_out_date).toLocaleDateString('ar-EG') : '—'}</div>
                    <div className="text-xs text-gray-600">الحالة: {r.status || '—'} • إنشئت: {r.created_at ? new Date(r.created_at).toLocaleDateString('ar-EG') : '—'}</div>
                  </div>
                  <div className="text-xs text-gray-500">الغرفة: {r.room_id ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
