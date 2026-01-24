import React from 'react';

export default function ReservationTable({ rows, loading, onEdit, onDelete, onDeleteGroup, onApplyGroupDiscount, onEditGroup }) {
  if (loading) return <div className="py-16 text-center text-gray-500">...جاري التحميل</div>;
  if (!rows?.length) return <div className="py-16 text-center text-gray-500">لا توجد حجوزات مطابقة</div>;

  return (
    <div className="overflow-x-auto border rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-right">
            <th className="px-3 py-2">النزيل</th>
            <th className="px-3 py-2">الغرفة</th>
            <th className="px-3 py-2">الدخول</th>
            <th className="px-3 py-2">الخروج</th>
            <th className="px-3 py-2">ليالي</th>
            <th className="px-3 py-2">الحالة</th>
            <th className="px-3 py-2">المبلغ</th>
            <th className="px-3 py-2">مدفوع (مؤكد / معلّق)</th>
            <th className="px-3 py-2">المتبقي</th>
            <th className="px-3 py-2">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">{r.guest_name}</td>
              <td className="px-3 py-2">{r.room_id}</td>
              <td className="px-3 py-2">{r.check_in_date}</td>
              <td className="px-3 py-2">{r.check_out_date}</td>
              <td className="px-3 py-2">{r.nights}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  r.status==='confirmed' ? 'bg-green-100 text-green-700' :
                  r.status==='checked_in' ? 'bg-blue-100 text-blue-700' :
                  r.status==='checked_out' ? 'bg-gray-100 text-gray-700' :
                  r.status==='cancelled' ? 'bg-red-100 text-red-700' :
                  r.status==='no_show' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                }`}>{
                  r.status==='pending' ? 'قيد الانتظار' :
                  r.status==='confirmed' ? 'مؤكد' :
                  r.status==='checked_in' ? 'تم الدخول' :
                  r.status==='checked_out' ? 'تم الخروج' :
                  r.status==='cancelled' ? 'ملغي' :
                  r.status==='no_show' ? 'لم يحضر' : r.status
                }</span>
              </td>
              <td className="px-3 py-2">{r.total_amount ?? '-'}</td>
              <td className="px-3 py-2">
                {r.confirmed_paid_amount != null || r.pending_paid_amount != null ? (
                  <span className="text-xs">
                    <span className="text-green-700">مؤكد: {Number(r.confirmed_paid_amount || 0)}</span>
                    {' / '}
                    <span className="text-amber-700">معلّق: {Number(r.pending_paid_amount || 0)}</span>
                  </span>
                ) : (
                  r.amount_paid ?? '-'
                )}
              </td>
              <td className="px-3 py-2">{(r.remaining_amount_from_tx ?? r.remaining_amount ?? 0)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50" onClick={()=>onEdit(r)}>تعديل</button>
                  <button className="px-2 py-1 border rounded text-xs text-red-700 hover:bg-red-50" onClick={()=>onDelete(r)}>حذف</button>
                  {onDeleteGroup && r.payer_type === 'agency' && r.agency_name && (
                    <>
                      <button
                        className="px-2 py-1 border rounded text-xs text-red-700 bg-red-50 hover:bg-red-100"
                        onClick={()=>onDeleteGroup(r)}
                      >
                        حذف مجموعة الشركة
                      </button>
                      <button
                        className="px-2 py-1 border rounded text-xs bg-yellow-100 hover:bg-yellow-200"
                        onClick={()=>{ if (typeof onApplyGroupDiscount === 'function') onApplyGroupDiscount(r); }}
                      >
                        تطبيق خصم مجموعة
                      </button>
                      <button
                        className="px-2 py-1 border rounded text-xs bg-indigo-100 hover:bg-indigo-200"
                        onClick={()=>{ if (typeof onEditGroup === 'function') onEditGroup(r); }}
                      >
                        تعديل حجز مجموعة
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
