import React from 'react';
import { getRoomStatusLabelAr, getCleanlinessLabelAr } from '../utils/status';

export default function ReservationCard({ r, onEdit, onDelete, onDeleteGroup, onExtend, onPay, onInvoice, onApplyGroupDiscount, onEditGroup }) {
  const cardAccent = (s) => (
    s==='confirmed' ? 'border-l-4 border-green-400 hover:bg-green-50' :
    s==='checked_in' ? 'border-l-4 border-blue-400 hover:bg-blue-50' :
    s==='checked_out' ? 'border-l-4 border-gray-400 hover:bg-gray-50' :
    s==='cancelled' ? 'border-l-4 border-red-400 hover:bg-red-50' :
    s==='no_show' ? 'border-l-4 border-amber-400 hover:bg-amber-50' : 'border-l-4 border-yellow-400 hover:bg-yellow-50'
  );
  const statusLabel = (s) => (
    s==='pending' ? 'قيد الانتظار' :
    s==='confirmed' ? 'مؤكد' :
    s==='checked_in' ? 'تم الدخول' :
    s==='checked_out' ? 'تم الخروج' :
    s==='cancelled' ? 'ملغي' :
    s==='no_show' ? 'لم يحضر' : s
  );
  const statusClass = (s) => (
    s==='confirmed' ? 'bg-green-100 text-green-700' :
    s==='checked_in' ? 'bg-blue-100 text-blue-700' :
    s==='checked_out' ? 'bg-gray-100 text-gray-700' :
    s==='cancelled' ? 'bg-red-100 text-red-700' :
    s==='no_show' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
  );

  return (
    <div className={`bg-white rounded-lg shadow-sm border overflow-hidden transition-colors ${cardAccent(r.status)}`} dir="rtl">
      <div className={
        r.status==='confirmed' ? 'h-1 bg-green-400' :
        r.status==='checked_in' ? 'h-1 bg-blue-400' :
        r.status==='checked_out' ? 'h-1 bg-gray-400' :
        r.status==='cancelled' ? 'h-1 bg-red-400' :
        r.status==='no_show' ? 'h-1 bg-amber-400' : 'h-1 bg-yellow-400'
      } />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{r.guest_name}</div>
            <div className="text-xs text-gray-500">{r.guest_phone || ''}{r.guest_phone && r.guest_email ? ' • ' : ''}{r.guest_email || ''}</div>
          </div>
          <span className={`px-2 py-1 rounded text-xs ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><span className="text-gray-500">الغرفة:</span> <span className="font-medium">{r.room_label || r.room_id}</span></div>
          <div><span className="text-gray-500">نوع الغرفة:</span> <span className="font-medium">{r.room_type_name || '-'}</span></div>
          <div><span className="text-gray-500">حالة الغرفة:</span> <span className="font-medium">{getRoomStatusLabelAr(r.room_status) || '-'}</span></div>
          <div><span className="text-gray-500">النظافة:</span> <span className="font-medium">{getCleanlinessLabelAr(r.room_cleanliness)}</span></div>
          <div><span className="text-gray-500">الدخول:</span> <span className="font-medium">{r.check_in_date}</span></div>
          <div><span className="text-gray-500">الخروج:</span> <span className="font-medium">{r.check_out_date}</span></div>
          <div><span className="text-gray-500">عدد الليالي:</span> <span className="font-medium">{r.nights}</span></div>
          <div><span className="text-gray-500">عدد النزلاء:</span> <span className="font-medium">{r.guests_count || 0}</span></div>

          <div><span className="text-gray-500">سعر الليلة:</span> <span className="font-medium">{r.nightly_rate} {r.currency || ''}</span></div>
          <div><span className="text-gray-500">طريقة الدفع:</span> <span className="font-medium">{r.payment_method || '-'}</span></div>
          <div><span className="text-gray-500">الإجمالي:</span> <span className="font-medium">{r.total_amount ?? '-'}</span></div>
          <div>
            <span className="text-gray-500">المدفوع:</span>{' '}
            {r.confirmed_paid_amount != null || r.pending_paid_amount != null ? (
              <span className="font-medium text-blue-700">
                مؤكد {Number(r.confirmed_paid_amount || 0)} / معلّق {Number(r.pending_paid_amount || 0)}
              </span>
            ) : (
              <span className="font-medium text-blue-700">{r.amount_paid ?? '-'}</span>
            )}
          </div>
          <div><span className="text-gray-500">المتبقي:</span> <span className="font-medium text-red-700">{r.remaining_amount_from_tx ?? r.remaining_amount ?? 0}</span></div>
          <div><span className="text-gray-500">الحالة الزمنية:</span> <span className="font-medium">{r.is_current ? 'حالي' : (r.is_upcoming ? 'قادم' : 'منتهي')}</span></div>

          <div className="col-span-2"><span className="text-gray-500">المدفوع من جهة:</span> <span className="font-medium">{r.payer_type || '-'} {r.agency_name ? `(${r.agency_name})` : ''}</span></div>
          {r.special_requests && <div className="col-span-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">طلبات خاصة: {r.special_requests}</div>}
          {r.notes && <div className="col-span-2 text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1">ملاحظات: {r.notes}</div>}
          <div className="col-span-2 text-xs text-gray-500">
            <span>أُنشئ بواسطة: </span>
            <span className="font-medium">{r.created_by_name || 'غير محدد'}</span>
            {r.created_at && (
              <span>{' '}({new Date(r.created_at).toLocaleString('ar-EG')})</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button className="px-3 py-1 border rounded text-xs" onClick={()=>onEdit(r)}>تعديل</button>
          <button className="px-3 py-1 border rounded text-xs" onClick={()=>onExtend && onExtend(r)}>تمديد</button>
          <button className="px-3 py-1 border rounded text-xs" onClick={()=>onInvoice && onInvoice(r)}>فاتورة</button>
          <button className="px-3 py-1 border rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>onPay && onPay(r)}>دفع</button>
          <button className="px-3 py-1 border rounded text-xs text-red-700" onClick={()=>onDelete(r)}>حذف</button>
          {onDeleteGroup && r.payer_type === 'agency' && r.agency_name && (
            <>
              <button
                className="px-3 py-1 border rounded text-xs text-red-700 bg-red-50 hover:bg-red-100"
                onClick={()=>onDeleteGroup(r)}
              >
                حذف مجموعة الشركة
              </button>
              <button
                className="px-3 py-1 border rounded text-xs bg-yellow-100 hover:bg-yellow-200"
                onClick={()=>{ if (typeof onApplyGroupDiscount === 'function') onApplyGroupDiscount(r); }}
              >
                تطبيق خصم مجموعة
              </button>
              <button
                className="px-3 py-1 border rounded text-xs bg-indigo-100 hover:bg-indigo-200"
                onClick={()=>{ if (typeof onEditGroup === 'function') onEditGroup(r); }}
              >
                تعديل حجز مجموعة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
