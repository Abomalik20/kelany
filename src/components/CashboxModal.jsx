import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager } from '../utils/permissions.js';

export default function CashboxModal({ onClose, onDone }) {
  const currentUser = useContext(AuthContext);
  const [operation, setOperation] = useState('deposit'); // deposit | withdraw
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState({ cash: 0, instapay: 0, ecash: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [lastTransfer, setLastTransfer] = useState(null);
  // TODO: قد نستخدم balance لاحقًا لعرض رصيد الخزنة
  // const [balance, setBalance] = useState(0);
  const [transferFrom, setTransferFrom] = useState('cash');
  const [transferTo, setTransferTo] = useState('instapay');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const canTransfer = isManager(currentUser);

  const loadDashboard = async () => {
    try {
      const { data: walletTx, error: walletError } = await supabase
        .from('accounting_transactions')
        .select('direction,amount,payment_method,status')
        .in('payment_method', ['cash', 'instapay', 'other']);
      if (walletError) throw walletError;

      let cash = 0;
      let instapay = 0;
      let ecash = 0;
      let pending = 0;
      let confirmed = 0;

      (walletTx || []).forEach((row) => {
        const amt = Number(row.amount || 0);
        if (!amt) return;
        const signed = row.direction === 'income' ? amt : -amt;
        if (row.payment_method === 'cash') cash += signed;
        else if (row.payment_method === 'instapay') instapay += signed;
        else ecash += signed;

        if (row.status === 'pending') pending += 1;
        else if (row.status === 'confirmed') confirmed += 1;
      });

      setWallets({ cash, instapay, ecash });
      setPendingCount(pending);
      setConfirmedCount(confirmed);

      const { data: lastTx, error: lastError } = await supabase
        .from('accounting_transactions')
        .select('id,tx_date,description,created_at')
        .eq('source_type', 'transfer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError && lastError.code !== 'PGRST116') throw lastError;
      setLastTransfer(lastTx || null);
    } catch (e) {
      console.error('load cashbox dashboard error', e);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleSubmit = async () => {
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      alert('من فضلك أدخل مبلغًا صالحًا');
      return;
    }
    setLoading(true);
    try {
      const direction = operation === 'deposit' ? 'income' : 'expense';
      let categoryId = null;
      try {
        const targetName = direction === 'income' ? 'إيرادات أخرى' : 'مصروفات أخرى';
        const { data: cats } = await supabase
          .from('accounting_categories')
          .select('id,name,type')
          .eq('type', direction === 'income' ? 'income' : 'expense')
          .eq('name', targetName)
          .limit(1);
        if (cats && cats.length > 0) {
          categoryId = cats[0].id;
        }
      } catch (_) {}

      const payload = {
        tx_date: new Date().toISOString().slice(0, 10),
        direction,
        category_id: categoryId,
        amount: amt,
        payment_method: 'cash',
        bank_account_id: null,
        source_type: 'manual',
        reservation_id: null,
        description: description || (operation === 'deposit' ? 'عملية إيداع في الخزنة' : 'عملية سحب من الخزنة'),
        status: 'confirmed',
      };
      if (currentUser && currentUser.id) {
        payload.created_by = currentUser.id;
      }

      const { error } = await supabase.from('accounting_transactions').insert(payload);
      if (error) throw error;
      await loadDashboard();
      onDone && onDone();
    } catch (e) {
      console.error('cashbox submit error', e);
      alert('تعذر حفظ عملية الخزنة: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const walletLabel = (key) => {
    if (key === 'cash') return 'نقدي (خزنة)';
    if (key === 'instapay') return 'إنستاباي';
    return 'كاش إلكتروني';
  };

  const walletToPaymentMethod = (key) => {
    if (key === 'cash') return 'cash';
    if (key === 'instapay') return 'instapay';
    return 'other';
  };

  const handleTransfer = async () => {
    const amt = Number(transferAmount || 0);
    if (!canTransfer) {
      alert('فقط المدير يمكنه تنفيذ تحويلات الأرصدة.');
      return;
    }
    if (!amt || amt <= 0) {
      alert('من فضلك أدخل مبلغ تحويل صالحاً');
      return;
    }
    if (transferFrom === transferTo) {
      alert('من فضلك اختر محفظتين مختلفتين (من / إلى).');
      return;
    }

    setTransferLoading(true);
    try {
      const txDate = new Date().toISOString().slice(0, 10);
      const descBase = `تحويل داخلي من ${walletLabel(transferFrom)} إلى ${walletLabel(transferTo)}`;
      const fullDesc = transferNote ? `${descBase} - ${transferNote}` : descBase;

      const fromPm = walletToPaymentMethod(transferFrom);
      const toPm = walletToPaymentMethod(transferTo);

      const common = {
        tx_date: txDate,
        category_id: null,
        bank_account_id: null,
        source_type: 'transfer',
        reservation_id: null,
        description: fullDesc,
        status: 'confirmed',
      };

      if (currentUser && currentUser.id) {
        common.created_by = currentUser.id;
      }

      const rows = [
        {
          ...common,
          direction: 'expense',
          amount: amt,
          payment_method: fromPm,
        },
        {
          ...common,
          direction: 'income',
          amount: amt,
          payment_method: toPm,
        },
      ];

      const { error } = await supabase.from('accounting_transactions').insert(rows);
      if (error) throw error;

      setTransferAmount('');
      setTransferNote('');
      await loadDashboard();
      onDone && onDone();
    } catch (e) {
      console.error('wallet transfer error', e);
      alert('تعذّر تنفيذ عملية التحويل: ' + (e.message || e));
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-2 sm:p-4" dir="rtl">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-xl shadow-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b bg-amber-50 flex items-center justify-between">
          <div>
            <div className="font-bold text-amber-900">إدارة الخزنة والمحافظ</div>
            <div className="text-xs text-amber-700">عرض أرصدة الكاش و Instapay والكاش الإلكتروني، وتسجيل إيداع/سحب وتحويلات داخلية</div>
          </div>
          <button type="button" className="text-sm text-gray-500" onClick={onClose}>إغلاق</button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-1">
            <div className="bg-amber-100 border border-amber-200 rounded-lg px-4 py-3 text-center md:col-span-2">
              <div className="text-xs text-amber-700 mb-1">إجمالي الرصيد الكلي</div>
              <div className="text-2xl font-bold text-amber-900">
                {wallets.cash + wallets.instapay + wallets.ecash} جنيه
              </div>
            </div>
            <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-sky-700 mb-1">عدد العمليات المعلّقة</div>
              <div className="text-xl font-semibold text-sky-900">{pendingCount}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-emerald-700 mb-1">عدد العمليات المؤكَّدة</div>
              <div className="text-xl font-semibold text-emerald-900">{confirmedCount}</div>
            </div>
          </div>

          {lastTransfer && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-xs text-purple-800">
              <div className="font-semibold mb-1">آخر عملية تحويل تمت</div>
              <div className="flex flex-col gap-0.5">
                <span>{lastTransfer.description}</span>
                <span className="text-[11px] text-purple-600">
                  بتاريخ {lastTransfer.tx_date} – تم تسجيلها في {lastTransfer.created_at ? new Date(lastTransfer.created_at).toLocaleString('ar-EG') : ''}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-amber-700 mb-1">رصيد النقدي (خزنة)</div>
              <div className="text-xl font-bold text-amber-900">{wallets.cash} جنيه</div>
            </div>
            <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-sky-700 mb-1">رصيد إنستاباي</div>
              <div className="text-xl font-bold text-sky-900">{wallets.instapay} جنيه</div>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-purple-700 mb-1">رصيد الكاش الإلكتروني</div>
              <div className="text-xl font-bold text-purple-900">{wallets.ecash} جنيه</div>
            </div>
          </div>

          <div className="mt-2 border-t pt-3 flex flex-col gap-2">
            <div className="text-sm font-semibold text-amber-900 mb-1">عملية على الخزنة النقدية (إيداع / سحب)</div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">نوع العملية</label>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
              >
                <option value="deposit">إيداع (+)</option>
                <option value="withdraw">سحب (−)</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">المبلغ</label>
              <input
                type="number"
                min="0"
                className="border rounded px-3 py-2 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">الوصف (اختياري)</label>
              <textarea
                rows={3}
                className="border rounded px-3 py-2 text-sm resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {canTransfer && (
            <div className="mt-3 border-t pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-purple-900">تحويل رصيد بين المحافظ (مدير فقط)</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">من المحفظة</label>
                  <select
                    className="border rounded px-3 py-2 text-sm"
                    value={transferFrom}
                    onChange={(e) => setTransferFrom(e.target.value)}
                  >
                    <option value="cash">نقدي (خزنة)</option>
                    <option value="instapay">إنستاباي</option>
                    <option value="ecash">كاش إلكتروني</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">إلى المحفظة</label>
                  <select
                    className="border rounded px-3 py-2 text-sm"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                  >
                    <option value="cash">نقدي (خزنة)</option>
                    <option value="instapay">إنستاباي</option>
                    <option value="ecash">كاش إلكتروني</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">مبلغ التحويل</label>
                  <input
                    type="number"
                    min="0"
                    className="border rounded px-3 py-2 text-sm"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">ملاحظة (اختيارية)</label>
                <textarea
                  rows={2}
                  className="border rounded px-3 py-2 text-sm resize-none"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="px-4 py-2 rounded text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
                  onClick={handleTransfer}
                  disabled={transferLoading}
                >
                  {transferLoading ? 'جارٍ تنفيذ التحويل...' : 'تنفيذ التحويل'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            className="px-3 py-2 border rounded text-sm"
            onClick={onClose}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'جارٍ الحفظ...' : 'حفظ عملية الخزنة'}
          </button>
        </div>
      </div>
    </div>
  );
}
