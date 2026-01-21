import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

export default function AccountingExpenseModal({ onClose, onDone }) {
  const currentUser = useContext(AuthContext);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [{ data: expenseCats }, { data: banks }] = await Promise.all([
          supabase.from('accounting_categories').select('id,name,type').eq('type', 'expense').eq('active', true),
          supabase.from('bank_accounts').select('id,bank_name,account_name,active').eq('active', true),
        ]);
        setCategories(expenseCats || []);
        setBankAccounts(banks || []);
        const other = (expenseCats || []).find((c) => c.name === 'مصروفات أخرى');
        if (other) setCategoryId(other.id);
      } catch (e) {
        console.error('load expense lookups error', e);
      }
    };
    loadLookups();
  }, []);

  const handleSubmit = async () => {
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      alert('من فضلك أدخل مبلغًا صالحًا');
      return;
    }
    if (paymentMethod === 'bank' && !bankAccountId) {
      alert('اختر حساب البنك لهذه العملية');
      return;
    }

    setLoading(true);
    try {
      let receptionShiftId = null;
      try {
        if (currentUser && currentUser.id) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const { data: shifts } = await supabase
            .from('reception_shifts')
            .select('id,status,shift_date')
            .eq('staff_user_id', currentUser.id)
            .eq('shift_date', todayStr)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1);
          if (shifts && shifts.length > 0) {
            receptionShiftId = shifts[0].id;
          }
        }
      } catch (_) {}

      const fullDescription = [description, supplier].filter(Boolean).join(' — ');
      const payload = {
        tx_date: new Date().toISOString().slice(0, 10),
        direction: 'expense',
        category_id: categoryId || null,
        amount: amt,
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === 'bank' ? bankAccountId : null,
        source_type: 'manual',
        reservation_id: null,
        description: fullDescription || 'مصروف يدوي',
        status: 'pending',
        reception_shift_id: receptionShiftId,
      };
      if (currentUser && currentUser.id) {
        payload.created_by = currentUser.id;
      }
      const { error } = await supabase.from('accounting_transactions').insert(payload);
      if (error) throw error;
      onDone && onDone();
    } catch (e) {
      console.error('save expense error', e);
      alert('تعذر تسجيل المصروف: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-rose-50 flex items-center justify-between">
          <div>
            <div className="font-bold text-rose-900">تسجيل مصروف جديد</div>
            <div className="text-xs text-rose-700">سجل أي مصروف تشغيلي للفندق</div>
          </div>
          <button type="button" className="text-sm text-gray-500" onClick={onClose}>إغلاق</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">الفئة</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
            >
              <option value="">مصروف عام</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">المبلغ</label>
            <input
              type="number"
              min="0"
              className="border rounded px-3 py-2 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">طريقة الدفع</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
                <option value="cash">نقدي (خزنة)</option>
                <option value="bank">حساب بنكي</option>
                <option value="instapay">إنستاباي / بطاقة بنكية</option>
                <option value="other">محفظة إلكترونية</option>
            </select>
          </div>

          {paymentMethod === 'bank' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">اختر الحساب البنكي</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                <option value="">اختر حسابًا</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} - {b.account_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">الوصف</label>
            <textarea
              rows={3}
              className="border rounded px-3 py-2 text-sm resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">المورد (اختياري)</label>
            <input
              type="text"
              className="border rounded px-3 py-2 text-sm"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button type="button" className="px-3 py-2 border rounded text-sm" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'جارٍ الحفظ...' : 'تسجيل المصروف'}
          </button>
        </div>
      </div>
    </div>
  );
}
