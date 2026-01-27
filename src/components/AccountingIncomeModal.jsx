import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';

export default function AccountingIncomeModal({ onClose, onDone }) {
  const currentUser = useContext(AuthContext);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [{ data: incomeCats }, { data: banks }] = await Promise.all([
          supabase.from('accounting_categories').select('id,name,type').eq('type', 'income').eq('active', true),
          supabase.from('bank_accounts').select('id,bank_name,account_name,active').eq('active', true),
        ]);
        setCategories(incomeCats || []);
        setBankAccounts(banks || []);
        const other = (incomeCats || []).find((c) => c.name === 'إيرادات أخرى');
        if (other) setCategoryId(other.id);
      } catch (e) {
        console.error('load income lookups error', e);
      }
    };
    loadLookups();
  }, []);

  const handleSubmit = async () => {
    const amt = Math.round(Number(amount || 0));
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
            .in('status', ['open','closed'])
            .order('opened_at', { ascending: false })
            .limit(1);
          if (shifts && shifts.length > 0) {
            receptionShiftId = shifts[0].id;
          }
        }
      } catch (_) {}
      const payload = {
        tx_date: new Date().toISOString().slice(0, 10),
        direction: 'income',
        category_id: categoryId || null,
        amount: amt,
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === 'bank' ? bankAccountId : null,
        source_type: 'manual',
        reservation_id: null,
        description: description || 'إيراد يدوي',
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
      console.error('save income error', e);
      alert('تعذر تسجيل الإيراد: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-emerald-50 flex items-center justify-between">
          <div>
            <div className="font-bold text-emerald-900">تسجيل إيراد جديد</div>
            <div className="text-xs text-emerald-700">سجل أي إيراد خارج الحجوزات مباشرة</div>
          </div>
          <button type="button" className="text-sm text-gray-500" onClick={onClose}>إغلاق</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">المبلغ</label>
            <input
              type="number"
              min="0"
              step="1"
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

          {categories.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">فئة الإيراد</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
              >
                <option value="">إيرادات عامة</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">الوصف (اختياري)</label>
            <textarea
              rows={3}
              className="border rounded px-3 py-2 text-sm resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button type="button" className="px-3 py-2 border rounded text-sm" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'جارٍ الحفظ...' : 'تسجيل الإيراد'}
          </button>
        </div>
      </div>
    </div>
  );
}
