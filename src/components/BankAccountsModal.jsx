import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import BankAccountFormModal from './BankAccountFormModal.jsx';

export default function BankAccountsModal({ onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bank_accounts_overview')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setAccounts(data || []);
    } catch (e) {
      console.error('load bank accounts error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الحساب البنكي؟')) return;
    try {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
      await loadAccounts();
    } catch (e) {
      console.error('delete bank account error', e);
      alert('تعذر حذف الحساب البنكي (ربما مرتبط بحركات مالية).');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-sky-50 flex items-center justify-between">
          <div>
            <div className="font-bold text-sky-900">حسابات البنوك</div>
            <div className="text-xs text-sky-700">إدارة حسابات البنوك المرتبطة بالمعاملات المالية</div>
          </div>
          <button type="button" className="text-sm text-gray-500" onClick={onClose}>إغلاق</button>
        </div>

        <div className="p-4 flex justify-between items-center">
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-white bg-sky-600 hover:bg-sky-700"
            onClick={() => setShowForm(true)}
          >
            + إضافة حساب بنكي
          </button>
        </div>

        <div className="px-4 pb-4">
          {loading ? (
            <div className="text-center text-gray-500 text-sm">جاري تحميل الحسابات...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center text-gray-400 text-sm">لا توجد حسابات بنكية مسجلة بعد.</div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="border rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">{acc.bank_name}</div>
                    <div className="text-sm text-gray-600">{acc.account_name}</div>
                    <div className="text-xs text-gray-500">رقم الحساب: {acc.account_number}</div>
                    {acc.iban && (
                      <div className="text-xs text-gray-500">IBAN: {acc.iban}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 min-w-[130px]">
                    <div className="text-sm font-bold text-emerald-700">
                      {Number(acc.current_balance || 0)} {acc.currency || 'EGP'}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => handleDelete(acc.id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <BankAccountFormModal
            onClose={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              loadAccounts();
            }}
          />
        )}
      </div>
    </div>
  );
}
