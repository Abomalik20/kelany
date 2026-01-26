import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function GroupSummaryCard({ group, onDiscount, onPayment, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState([]);

  const fmtInt = (v) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0';
    return String(Math.round(n));
  };

  const toggleExpand = async () => {
    if (!expanded) {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('reservations_overview')
          .select('id, room_id, room_label, nightly_rate, total_amount, amount_paid, remaining_amount')
          .eq('payer_type', 'agency')
          .eq('agency_name', group.agencyName)
          .eq('check_in_date', group.checkIn)
          .eq('check_out_date', group.checkOut);
        if (error) throw error;
        setDetails(data || []);
      } catch (e) {
        console.error('Load group details failed', e);
        alert('تعذّر تحميل تفاصيل غرف المجموعة.');
      } finally {
        setLoading(false);
      }
    }
    setExpanded(v => !v);
  };

  const totalRooms = group.count || 0;
  const totalAmount = group.totalAmount || 0;
  const confirmedPaid = group.confirmedPaid || 0;
  const pendingPaid = group.pendingPaid || 0;
  const remaining = group.remaining || Math.max(0, totalAmount - confirmedPaid - pendingPaid);
  const nights = group.sampleRow?.nights ?? null;
  const statusBadge = group.sampleRow?.is_current
    ? { label: 'حالية', cls: 'bg-purple-100 text-purple-700 border-purple-200' }
    : group.sampleRow?.is_upcoming
      ? { label: 'قادمة', cls: 'bg-amber-100 text-amber-700 border-amber-200' }
      : { label: 'منتهية', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  const agencyInitial = (group.agencyName || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow" dir="rtl">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold border">{agencyInitial}</div>
          <div>
            <div className="text-sm text-gray-500">شركة</div>
            <div className="text-lg font-bold">{group.agencyName}</div>
            <div className="text-xs text-gray-600 mt-1">الفترة: {group.checkIn} → {group.checkOut}{nights!=null?` • ${nights} ليال`:''}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-2">
            <span className={`px-2 py-1 text-xs border rounded ${statusBadge.cls}`}>{statusBadge.label}</span>
            <span className="px-2 py-1 text-xs border rounded bg-gray-50 text-gray-700">غرف: {totalRooms}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div className="bg-purple-50 border border-purple-200 rounded p-3">
          <div className="text-purple-700">إجمالي المجموعة</div>
          <div className="font-bold text-purple-700">{fmtInt(totalAmount)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
          <div className="text-emerald-700">مدفوع مؤكد</div>
          <div className="font-bold text-emerald-700">{fmtInt(confirmedPaid)}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="text-amber-700">مدفوع معلّق</div>
          <div className="font-bold text-amber-700">{fmtInt(pendingPaid)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <div className="text-gray-700">متبقي</div>
          <div className="font-bold text-gray-700">{fmtInt(remaining)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button className="px-3 py-2 rounded text-sm bg-indigo-600 text-white" onClick={() => onEdit && onEdit(group.sampleRow)}>تعديل المجموعة</button>
        <button className="px-3 py-2 rounded text-sm bg-teal-600 text-white" onClick={() => onPayment && onPayment(group.sampleRow)}>دفعة جماعية</button>
        <button className="px-3 py-2 rounded text-sm bg-fuchsia-600 text-white" onClick={() => onDiscount && onDiscount(group.sampleRow)}>خصم جماعي</button>
        <button className="ml-auto px-3 py-2 rounded text-sm border hover:bg-gray-50" onClick={toggleExpand}>{expanded ? 'إخفاء الغرف' : 'عرض الغرف'}</button>
      </div>

      {expanded && (
        <div className="mt-4 transition-all duration-200 ease-out">
          {loading ? (
            <div className="text-gray-500 text-sm">...جاري تحميل تفاصيل الغرف</div>
          ) : details.length === 0 ? (
            <div className="text-gray-500 text-sm">لا توجد غرف في هذه المجموعة ضمن التصفية الحالية.</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1 text-right">الغرفة</th>
                    <th className="px-2 py-1 text-right">إجمالي</th>
                    <th className="px-2 py-1 text-right">مؤكد</th>
                    <th className="px-2 py-1 text-right">معلّق</th>
                    <th className="px-2 py-1 text-right">متبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map(r => (
                    <tr key={r.id} className="border-t hover:bg-gray-50">
                      <td className="px-2 py-1 whitespace-nowrap">{r.room_label || r.room_id}</td>
                      <td className="px-2 py-1">{fmtInt(r.total_amount)}</td>
                      <td className="px-2 py-1">{fmtInt(r.amount_paid)}</td>
                      <td className="px-2 py-1">{fmtInt((r.total_amount || 0) - (r.amount_paid || 0))}</td>
                      <td className="px-2 py-1">{fmtInt(r.remaining_amount || Math.max(0, (r.total_amount || 0) - (r.amount_paid || 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
