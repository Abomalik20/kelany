import React, { useContext, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

export default function BankAccountFormModal({ onClose, onSaved }) {
  const currentUser = useContext(AuthContext);
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swift, setSwift] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!bankName || !accountName || !accountNumber) {
      alert('من فضلك أدخل اسم البنك، اسم الحساب، ورقم الحساب');
      return;
    }
    const opening = Number(openingBalance || 0);
    if (Number.isNaN(opening) || opening < 0) {
      alert('رصيد افتتاحي غير صالح');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        iban: iban || null,
        swift_code: swift || null,
        currency: currency || 'EGP',
        opening_balance: opening,
        notes: notes || null,
      };
      if (currentUser && currentUser.id) {
        payload.created_by = currentUser.id;
      }
      const { error } = await supabase.from('bank_accounts').insert(payload);
      if (error) throw error;
      onSaved && onSaved();
    } catch (e) {
      console.error('create bank account error', e);
      alert('تعذر إضافة الحساب البنكي: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-sky-50 flex items-center justify-between">
          <div>
            <div className="font-bold text-sky-900">إضافة حساب بنكي</div>
            <div className="text-xs text-sky-700">سجل حسابات البنوك المستخدمة في الفندق</div>
          </div>
          <button type="button" className="text-sm text-gray-500" onClick={onClose}>إغلاق</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">اسم البنك *</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="مثال: البنك الأهلي المصري"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">اسم الحساب *</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="مثال: حساب فندق الكيلاني"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">رقم الحساب *</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">IBAN</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Swift Code</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={swift}
              onChange={(e) => setSwift(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">العملة</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">الرصيد الافتتاحي</label>
            <input
              type="number"
              min="0"
              className="border rounded px-3 py-2 text-sm"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">ملاحظات</label>
            <textarea
              rows={3}
              className="border rounded px-3 py-2 text-sm resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button type="button" className="px-3 py-2 border rounded text-sm" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'جارٍ الحفظ...' : 'إضافة الحساب'}
          </button>
        </div>
      </div>
    </div>
  );
}
