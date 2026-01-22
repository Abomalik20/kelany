import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export default function InvoiceModal({ row, onClose }) {
  const [taxRate, setTaxRate] = useState(0.14);
  const [deposit, setDeposit] = useState(0);
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState(null);

  const compute = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_invoice', { p_reservation_id: row.id, p_tax_rate: taxRate, p_deposit: deposit });
      if (error) throw error;
      const i = Array.isArray(data) ? data[0] : data;
      setInvoice(i || null);
    } catch(e) {
      alert('تعذّر حساب الفاتورة: '+(e.message||e));
    } finally { setLoading(false); }
  }, [row?.id, taxRate, deposit]);

  useEffect(() => { compute(); /* initial */ }, [compute]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full md:max-w-lg rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="font-bold">فاتورة الحجز</div>
          <div className="text-xs text-gray-500">ملخص الضرائب والوديعة والمتبقي</div>
          <div className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2">
            <div><span className="text-gray-500">النزيل:</span> <span className="font-medium">{row.guest_name}</span></div>
            <div><span className="text-gray-500">الغرفة:</span> <span className="font-medium">{row.room_label}</span> • <span className="font-medium">{row.room_type_name}</span></div>
            <div><span className="text-gray-500">الفترة:</span> <span className="font-medium">{row.check_in_date}</span> → <span className="font-medium">{row.check_out_date}</span> (<span className="font-medium">{row.nights}</span> ليال)</div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">نسبة الضريبة</label>
              <input type="number" step="0.01" className="border rounded px-3 py-2 w-full" value={taxRate} onChange={e=>setTaxRate(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm">الوديعة</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={deposit} onChange={e=>setDeposit(Number(e.target.value))} />
            </div>
          </div>
          <button className="px-3 py-2 border rounded text-sm w-fit" onClick={compute} disabled={loading}>{loading?'جارٍ...':'إعادة الحساب'}</button>

          {invoice && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">ليالي:</span> <span className="font-medium">{invoice.nights}</span></div>
              <div><span className="text-gray-500">سعر الليلة:</span> <span className="font-medium">{invoice.nightly_rate}</span></div>
              <div><span className="text-gray-500">المجموع الفرعي:</span> <span className="font-medium">{invoice.subtotal}</span></div>
              <div><span className="text-gray-500">ضريبة:</span> <span className="font-medium">{invoice.tax_amount} ({invoice.tax_rate*100}%)</span></div>
              <div><span className="text-gray-500">الوديعة:</span> <span className="font-medium">{invoice.deposit}</span></div>
              <div><span className="text-gray-500">الإجمالي:</span> <span className="font-medium">{invoice.total}</span></div>
              <div><span className="text-gray-500">المدفوع:</span> <span className="font-medium">{invoice.paid_amount}</span></div>
              <div><span className="text-gray-500">المتبقي:</span> <span className="font-medium">{invoice.remaining}</span></div>
              <div className="col-span-2"><span className="text-gray-500">رسوم الإلغاء المتوقعة:</span> <span className="font-medium">{invoice.cancellation_fee}</span></div>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button className="px-3 py-2 border rounded" onClick={onClose}>إغلاق</button>
          <button className="px-3 py-2 rounded bg-gray-700 text-white" onClick={()=>alert('ميزة PDF سنضيفها لاحقًا')}>طباعة PDF</button>
        </div>
      </div>
    </div>
  );
}
