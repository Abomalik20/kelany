import React, { useEffect, useMemo, useState, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager, isAssistantManager } from '../utils/permissions.js';
import CashboxModal from '../components/CashboxModal.jsx';
import AccountingIncomeModal from '../components/AccountingIncomeModal.jsx';
import AccountingExpenseModal from '../components/AccountingExpenseModal.jsx';
import BankAccountsModal from '../components/BankAccountsModal.jsx';

export default function Accounting() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayIncome: 0,
    todayExpense: 0,
    todayNet: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
    receptionPending: 0,
  });
  const [wallets, setWallets] = useState({
    cashConfirmed: 0,
    cashPending: 0,
    instapayConfirmed: 0,
    instapayPending: 0,
    eCashConfirmed: 0,
    eCashPending: 0,
  });

  const [showCashbox, setShowCashbox] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showBanks, setShowBanks] = useState(false);

  const currentUser = useContext(AuthContext);
  const isMgr = isManager(currentUser);
  const isAsst = isAssistantManager(currentUser);
  const canViewAdvanced = isMgr || isAsst; // معاملات/شجرة حسابات/تقارير + خزنة/بنوك/إيرادات
  const canAddExpense = isMgr || isAsst || (currentUser?.role === 'reception');

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch (_) {
      return '';
    }
  }, []);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const today = new Date();
        const yyyyMmDd = today.toISOString().slice(0, 10);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

        const { data: tx } = await supabase
          .from('accounting_transactions')
          .select('tx_date,direction,amount')
          .eq('status', 'confirmed')
          .neq('source_type', 'transfer')
          .gte('tx_date', monthStart)
          .lte('tx_date', yyyyMmDd);

        let todayIncome = 0;
        let todayExpense = 0;
        let monthIncome = 0;
        let monthExpense = 0;

        (tx || []).forEach((row) => {
          const amt = Number(row.amount || 0);
          if (!amt) return;
          const isIncome = row.direction === 'income';
          if (row.tx_date === yyyyMmDd) {
            if (isIncome) todayIncome += amt; else todayExpense += amt;
          }
          if (isIncome) monthIncome += amt; else monthExpense += amt;
        });

        // الرصيد المعلّق لدى الريسبشن (نقدي + محافظ إلكترونية في انتظار التأكيد)
        const { data: pendingTx } = await supabase
          .from('accounting_transactions')
          .select('direction,amount,payment_method,status')
          .eq('status', 'pending')
          .in('payment_method', ['cash', 'instapay', 'other']);

        let receptionPending = 0;
        (pendingTx || []).forEach((row) => {
          const amt = Number(row.amount || 0);
          if (!amt) return;
          if (row.direction === 'income') receptionPending += amt;
          else receptionPending -= amt;
        });

        // أرصدة المحافظ المؤكَّدة
        const { data: walletConfirmedTx } = await supabase
          .from('accounting_transactions')
          .select('direction,amount,payment_method')
          .eq('status', 'confirmed')
          .in('payment_method', ['cash', 'instapay', 'other']);

        let cashConfirmed = 0;
        let instapayConfirmed = 0;
        let eCashConfirmed = 0;
        (walletConfirmedTx || []).forEach((row) => {
          const amt = Number(row.amount || 0);
          if (!amt) return;
          const signed = row.direction === 'income' ? amt : -amt;
          if (row.payment_method === 'cash') cashConfirmed += signed;
          else if (row.payment_method === 'instapay') instapayConfirmed += signed;
          else eCashConfirmed += signed;
        });

        // أرصدة المحافظ المعلّقة (من pendingTx)
        let cashPending = 0;
        let instapayPending = 0;
        let eCashPending = 0;
        (pendingTx || []).forEach((row) => {
          const amt = Number(row.amount || 0);
          if (!amt) return;
          const signed = row.direction === 'income' ? amt : -amt;
          if (row.payment_method === 'cash') cashPending += signed;
          else if (row.payment_method === 'instapay') instapayPending += signed;
          else eCashPending += signed;
        });

        setStats({
          todayIncome: Math.round(todayIncome),
          todayExpense: Math.round(todayExpense),
          todayNet: Math.round(todayIncome - todayExpense),
          monthIncome: Math.round(monthIncome),
          monthExpense: Math.round(monthExpense),
          monthNet: Math.round(monthIncome - monthExpense),
          receptionPending: Math.round(receptionPending),
        });
        setWallets({
          cashConfirmed: Math.round(cashConfirmed),
          cashPending: Math.round(cashPending),
          instapayConfirmed: Math.round(instapayConfirmed),
          instapayPending: Math.round(instapayPending),
          eCashConfirmed: Math.round(eCashConfirmed),
          eCashPending: Math.round(eCashPending),
        });
      } catch (e) {
        console.error('loadStats error', e);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const refreshAfterTx = () => {
    // بعد أي عملية مالية، نعيد تحميل الملخصات
    try {
      const evt = new Event('accounting-tx-updated');
      window.dispatchEvent(evt);
    } catch (_) {}
  };

  useEffect(() => {
    const handler = () => {
      // إعادة تحميل نفس المنطق بدون تكرار الكود بالكامل
      (async () => {
        try {
          const today = new Date();
          const yyyyMmDd = today.toISOString().slice(0, 10);
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
          const { data: tx } = await supabase
            .from('accounting_transactions')
            .select('tx_date,direction,amount')
            .eq('status', 'confirmed')
            .neq('source_type', 'transfer')
            .gte('tx_date', monthStart)
            .lte('tx_date', yyyyMmDd);

          let todayIncome = 0;
          let todayExpense = 0;
          let monthIncome = 0;
          let monthExpense = 0;

          (tx || []).forEach((row) => {
            const amt = Number(row.amount || 0);
            if (!amt) return;
            const isIncome = row.direction === 'income';
            if (row.tx_date === yyyyMmDd) {
              if (isIncome) todayIncome += amt; else todayExpense += amt;
            }
            if (isIncome) monthIncome += amt; else monthExpense += amt;
          });

          const { data: pendingTx } = await supabase
            .from('accounting_transactions')
            .select('direction,amount,payment_method,status')
            .eq('status', 'pending')
            .in('payment_method', ['cash', 'instapay', 'other']);

          let receptionPending = 0;
          (pendingTx || []).forEach((row) => {
            const amt = Number(row.amount || 0);
            if (!amt) return;
            if (row.direction === 'income') receptionPending += amt;
            else receptionPending -= amt;
          });

          const { data: walletConfirmedTx } = await supabase
            .from('accounting_transactions')
            .select('direction,amount,payment_method')
            .eq('status', 'confirmed')
            .in('payment_method', ['cash', 'instapay', 'other']);

          let cashConfirmed = 0;
          let instapayConfirmed = 0;
          let eCashConfirmed = 0;
          (walletConfirmedTx || []).forEach((row) => {
            const amt = Number(row.amount || 0);
            if (!amt) return;
            const signed = row.direction === 'income' ? amt : -amt;
            if (row.payment_method === 'cash') cashConfirmed += signed;
            else if (row.payment_method === 'instapay') instapayConfirmed += signed;
            else eCashConfirmed += signed;
          });

          let cashPending = 0;
          let instapayPending = 0;
          let eCashPending = 0;
          (pendingTx || []).forEach((row) => {
            const amt = Number(row.amount || 0);
            if (!amt) return;
            const signed = row.direction === 'income' ? amt : -amt;
            if (row.payment_method === 'cash') cashPending += signed;
            else if (row.payment_method === 'instapay') instapayPending += signed;
            else eCashPending += signed;
          });

          setStats({
            todayIncome: Math.round(todayIncome),
            todayExpense: Math.round(todayExpense),
            todayNet: Math.round(todayIncome - todayExpense),
            monthIncome: Math.round(monthIncome),
            monthExpense: Math.round(monthExpense),
            monthNet: Math.round(monthIncome - monthExpense),
            receptionPending: Math.round(receptionPending),
          });
          setWallets({
            cashConfirmed: Math.round(cashConfirmed),
            cashPending: Math.round(cashPending),
            instapayConfirmed: Math.round(instapayConfirmed),
            instapayPending: Math.round(instapayPending),
            eCashConfirmed: Math.round(eCashConfirmed),
            eCashPending: Math.round(eCashPending),
          });
        } catch (e) {
          console.error('reload stats error', e);
        }
      })();
    };

    try {
      window.addEventListener('accounting-tx-updated', handler);
    } catch (_) {}
    return () => {
      try { window.removeEventListener('accounting-tx-updated', handler); } catch (_) {}
    };
  }, []);

  const renderDashboardTab = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
          <div className="text-xs text-emerald-700 mb-1">إيرادات اليوم</div>
          <div className="text-xl font-bold text-emerald-900">{stats.todayIncome} جنيه</div>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
          <div className="text-xs text-rose-700 mb-1">مصروفات اليوم</div>
          <div className="text-xl font-bold text-rose-900">{stats.todayExpense} جنيه</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
          <div className="text-xs text-blue-700 mb-1">صافي اليوم</div>
          <div className="text-xl font-bold text-blue-900">{stats.todayNet} جنيه</div>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-center">
          <div className="text-xs text-indigo-700 mb-1">صافي الشهر الحالي</div>
          <div className="text-xl font-bold text-indigo-900">{stats.monthNet} جنيه</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center md:col-span-2">
          <div className="text-xs text-amber-700 mb-1">رصيد المبالغ المجمّعة لدى الريسبشن (في انتظار التأكيد)</div>
          <div className="text-xl font-bold text-amber-900">{stats.receptionPending} جنيه</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
          <div className="text-2xl mb-1">💰</div>
          <div className="text-xs text-amber-700 mb-1">رصيد الكاش (خزنة)</div>
          <div className="text-sm text-gray-600 mb-1">مؤكَّد: <span className="font-semibold text-amber-900">{wallets.cashConfirmed} جنيه</span></div>
          <div className="text-xs text-gray-500">معلّق: {wallets.cashPending} جنيه</div>
        </div>
        <div className="bg-sky-50 border border-sky-100 rounded-lg p-4 text-center">
          <div className="text-2xl mb-1">📲</div>
          <div className="text-xs text-sky-700 mb-1">رصيد إنستاباي</div>
          <div className="text-sm text-gray-600 mb-1">مؤكَّد: <span className="font-semibold text-sky-900">{wallets.instapayConfirmed} جنيه</span></div>
          <div className="text-xs text-gray-500">معلّق: {wallets.instapayPending} جنيه</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center">
          <div className="text-2xl mb-1">💳</div>
          <div className="text-xs text-purple-700 mb-1">رصيد الكاش الإلكتروني (فودافون/اتصالات/أخرى)</div>
          <div className="text-sm text-gray-600 mb-1">مؤكَّد: <span className="font-semibold text-purple-900">{wallets.eCashConfirmed} جنيه</span></div>
          <div className="text-xs text-gray-500">معلّق: {wallets.eCashPending} جنيه</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {canViewAdvanced && (
          <button
            type="button"
            onClick={() => setShowCashbox(true)}
            className="bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition"
          >
            <span className="text-2xl">💰</span>
            <span className="font-semibold text-amber-900">إدارة الخزنة</span>
          </button>
        )}
        {/* زر عرض الحوالات داخل تبويب المعاملات فقط */}
        {canViewAdvanced && (
          <button
            type="button"
            onClick={() => setShowIncome(true)}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition"
          >
            <span className="text-2xl">📈</span>
            <span className="font-semibold text-emerald-900">تسجيل إيراد</span>
          </button>
        )}
        {canAddExpense && (
          <button
            type="button"
            onClick={() => setShowExpense(true)}
            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition"
          >
            <span className="text-2xl">📉</span>
            <span className="font-semibold text-rose-900">تسجيل مصروف</span>
          </button>
        )}
        {canViewAdvanced && (
          <button
            type="button"
            onClick={() => setShowBanks(true)}
            className="bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition"
          >
            <span className="text-2xl">🏦</span>
            <span className="font-semibold text-sky-900">حسابات البنوك</span>
          </button>
        )}
      </div>
    </>
  );

  const renderTransactionsTab = () => (
    <AccountingTransactionsTab />
  );

  const renderAccountsTreeTab = () => (
    <AccountingCategoriesTab />
  );

  const renderReportsTab = () => (
    <AccountingReportsTab />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboardTab();
      case 'transactions':
        return canViewAdvanced ? renderTransactionsTab() : renderDashboardTab();
      case 'accounts-tree':
        return canViewAdvanced ? renderAccountsTreeTab() : renderDashboardTab();
      case 'reports':
        return canViewAdvanced ? renderReportsTab() : renderDashboardTab();
      default:
        return renderDashboardTab();
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="bg-yellow-400 text-white px-4 py-2 rounded">نسخة احتياطية</button>
          <button className="bg-white border rounded p-2" title="الإشعارات"><span role="img" aria-label="تنبيه">🔔</span></button>
        </div>
        <div className="text-gray-600 text-sm">{todayLabel}</div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">النظام المحاسبي الذكي</h1>
        <p className="text-sm text-gray-500">إدارة كاملة للمعلومات المالية والمعاملات اليومية للفندق.</p>
      </div>

      <div className="flex flex-wrap gap-2 bg-white rounded-lg p-2 border">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 rounded text-sm ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
        >
          لوحة المعلومات
        </button>
        {canViewAdvanced && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 rounded text-sm ${activeTab === 'transactions' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
            >
              المعاملات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounts-tree')}
              className={`px-4 py-2 rounded text-sm ${activeTab === 'accounts-tree' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
            >
              شجرة الحسابات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded text-sm ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
            >
              التقارير
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-lg p-6 text-center text-gray-500 border">جاري تحميل ملخص المحاسبة...</div>
      ) : (
        renderActiveTab()
      )}

      {showCashbox && (
        <CashboxModal
          onClose={() => setShowCashbox(false)}
          onDone={() => {
            setShowCashbox(false);
            refreshAfterTx();
          }}
        />
      )}

      {showIncome && (
        <AccountingIncomeModal
          onClose={() => setShowIncome(false)}
          onDone={() => {
            setShowIncome(false);
            refreshAfterTx();
          }}
        />
      )}

      {showExpense && (
        <AccountingExpenseModal
          onClose={() => setShowExpense(false)}
          onDone={() => {
            setShowExpense(false);
            refreshAfterTx();
          }}
        />
      )}

      {showBanks && (
        <BankAccountsModal
          onClose={() => setShowBanks(false)}
        />
      )}
    </div>
  );
}

function AccountingTransactionsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHandovers, setShowHandovers] = useState(false);
  const [handoverRows, setHandoverRows] = useState([]);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverLinkedMap, setHandoverLinkedMap] = useState({});
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [direction, setDirection] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [refundOnly, setRefundOnly] = useState(false);
  const [staffFilter, setStaffFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [showBulkCashHandover, setShowBulkCashHandover] = useState(false);
  const [bulkHandoverExpected, setBulkHandoverExpected] = useState(0);
  const [bulkHandoverActual, setBulkHandoverActual] = useState(0);
  const [shiftStaffMap, setShiftStaffMap] = useState({});
  const [handoverSenderMap, setHandoverSenderMap] = useState({});
  const [staffShiftIds, setStaffShiftIds] = useState([]);

  const currentUser = React.useContext(AuthContext);
  const canConfirmIncome = isManager(currentUser) || isAssistantManager(currentUser);
  const canConfirmExpense = isManager(currentUser); // اعتماد المصروفات حصريًا للمدير
  const canBulkHandover = isManager(currentUser) || isAssistantManager(currentUser);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const loadCats = async () => {
      try {
        const { data } = await supabase
          .from('accounting_categories')
          .select('id,name,type')
          .eq('active', true)
          .order('type', { ascending: true });
        setCategories(data || []);
      } catch (e) {
        console.error('load accounting categories error', e);
      }
    };
    loadCats();
  }, []);

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data } = await supabase
          .from('staff_users_overview')
          .select('id,full_name,username');
        setStaffUsers(data || []);
      } catch (e) {
        console.error('load staff users for accounting error', e);
      }
    };
    loadStaff();
  }, []);

  const buildQuery = React.useCallback(() => {
    const q = supabase
      .from('accounting_transactions')
      .select('id,tx_date,direction,amount,payment_method,description,source_type,reservation_id,category_id,status,created_at,created_by,confirmed_at,confirmed_by,reception_shift_id,bank_account_id,delivered_in_handover_id', { count: 'exact' })
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false });

    // عرض خاص لطلبات استرداد الحجوزات: مصروفات معلّقة مرتبطة بحجوزات
    if (refundOnly) {
      q.eq('direction', 'expense');
      q.eq('status', 'pending');
      q.eq('source_type', 'reservation');
    } else {
      if (direction) q.eq('direction', direction);
      if (paymentMethod) q.eq('payment_method', paymentMethod);
      if (statusFilter) q.eq('status', statusFilter);
      if (sourceFilter) q.eq('source_type', sourceFilter);
    }
    if (fromDate) q.gte('tx_date', fromDate);
    if (toDate) q.lte('tx_date', toDate);

    const term = (debounced || '').trim();
    if (term) {
      q.ilike('description', `%${term}%`);
    }
    // توسيع فلتر الموظف ليشمل معاملات الوردية الخاصة به
    if (staffFilter) {
      if (staffShiftIds && staffShiftIds.length > 0) {
        const ids = staffShiftIds.map((id) => `${id}`).join(',');
        q.or(`created_by.eq.${staffFilter},reception_shift_id.in.(${ids})`);
      } else {
        q.eq('created_by', staffFilter);
      }
    }
    if (shiftFilter) q.eq('reception_shift_id', shiftFilter);

    const from = page * pageSize;
    const to = from + pageSize - 1;
    q.range(from, to);
    return q;
  }, [debounced, direction, paymentMethod, statusFilter, sourceFilter, fromDate, toDate, page, pageSize, refundOnly, staffFilter, shiftFilter, staffShiftIds]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error, count } = await buildQuery();
      if (error) throw error;
      const rowsData = data || [];
      setRows(rowsData);
      setTotalCount(count || 0);

      // تحميل خرائط الموظف للوردية، ومرسلي التسليم المجمّع إن وُجد
      try {
        const shiftIds = Array.from(new Set((rowsData || []).map(r => r.reception_shift_id).filter(Boolean)));
        if (shiftIds.length > 0) {
          const { data: shifts } = await supabase.from('reception_shifts').select('id,staff_user_id').in('id', shiftIds);
          const map = {};
          (shifts || []).forEach(s => { map[s.id] = s.staff_user_id; });
          setShiftStaffMap(map);
        } else {
          setShiftStaffMap({});
        }
        const handIds = Array.from(new Set((rowsData || []).map(r => r.delivered_in_handover_id).filter(Boolean)));
        if (handIds.length > 0) {
          const { data: hands } = await supabase.from('reception_shift_handovers').select('id,from_shift_id').in('id', handIds);
          const rel = {};
          (hands || []).forEach(h => { if (handIds.includes(h.id)) rel[h.id] = h.from_shift_id; });
          // احصل على موظفي الورديات المرسلة
          const fromIds = Array.from(new Set(Object.values(rel).filter(Boolean)));
          if (fromIds.length > 0) {
            const { data: fromShifts } = await supabase.from('reception_shifts').select('id,staff_user_id').in('id', fromIds);
            const senderMap = {};
            (fromShifts || []).forEach(s => { senderMap[s.id] = s.staff_user_id; });
            const final = {};
            Object.entries(rel).forEach(([hid, sid]) => { final[hid] = senderMap[sid]; });
            setHandoverSenderMap(final);
          } else {
            setHandoverSenderMap({});
          }
        } else {
          setHandoverSenderMap({});
        }
      } catch (e) {
        console.error('build maps error', e);
      }
    } catch (e) {
      console.error('load accounting transactions error', e);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => {
      load();
    };
    try {
      window.addEventListener('accounting-tx-updated', handler);
    } catch (_) {}
    return () => {
      try { window.removeEventListener('accounting-tx-updated', handler); } catch (_) {}
    };
  }, [load]);

  // تحميل الحوالات وعرضها كقائمة مستقلة داخل تبويب المعاملات
  const loadHandovers = React.useCallback(async () => {
    if (!showHandovers) return;
    setHandoverLoading(true);
    try {
      let q = supabase
        .from('reception_shift_handovers')
        .select('id,tx_date,amount,status,from_shift_id,to_shift_id,to_manager_id,created_by,received_by,note,created_at,received_at')
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (fromDate) q = q.gte('tx_date', fromDate);
      if (toDate) q = q.lte('tx_date', toDate);
      if (statusFilter) q = q.eq('status', statusFilter);
      if (shiftFilter) q = q.eq('from_shift_id', shiftFilter);
      const { data: hands, error } = await q;
      if (error) throw error;
      let result = hands || [];
      // فلتر الموظف (مرسل الحوالة): نحدد صاحب الوردية المرسلة
      if (staffFilter && result.length > 0) {
        const fromIds = Array.from(new Set(result.map(h => h.from_shift_id).filter(Boolean)));
        let staffMap = {};
        if (fromIds.length > 0) {
          const { data: shifts } = await supabase.from('reception_shifts').select('id,staff_user_id').in('id', fromIds);
          (shifts || []).forEach(s => { staffMap[s.id] = s.staff_user_id; });
        }
        result = result.filter(h => staffMap[h.from_shift_id] && String(staffMap[h.from_shift_id]) === String(staffFilter));
      }
      setHandoverRows(result);
      // تحديث خريطة موظفي الورديات (مرسل ومستلم) لهذه القائمة
      try {
        const ids = Array.from(new Set(result.flatMap(h => [h.from_shift_id, h.to_shift_id]).filter(Boolean)));
        if (ids.length > 0) {
          const { data: shifts } = await supabase.from('reception_shifts').select('id,staff_user_id').in('id', ids);
          const map = {};
          (shifts || []).forEach(s => { map[s.id] = s.staff_user_id; });
          setShiftStaffMap(prev => ({ ...prev, ...map }));
        }
      } catch (e) {
        console.error('load shift staff for handovers error', e);
      }
      // جلب معاملات مرتبطة بهذه الحوالات لتكوين ملخص سريع (عدد وصافي)
      const handIds = Array.from(new Set((result || []).map(h => h.id)));
      if (handIds.length > 0) {
        const { data: txs } = await supabase
          .from('accounting_transactions')
          .select('id,direction,amount,delivered_in_handover_id')
          .in('delivered_in_handover_id', handIds);
        const map = {};
        (txs || []).forEach(t => {
          const hid = t.delivered_in_handover_id;
          if (!map[hid]) map[hid] = { count: 0, net: 0 };
          const amt = Number(t.amount || 0);
          const signed = t.direction === 'income' ? amt : -amt;
          map[hid].count += 1;
          map[hid].net += signed;
        });
        Object.keys(map).forEach(k => { map[k].net = Math.round(map[k].net || 0); });
        setHandoverLinkedMap(map);
      } else {
        setHandoverLinkedMap({});
      }
    } catch (e) {
      console.error('load handovers error', e);
      setHandoverRows([]);
      setHandoverLinkedMap({});
    } finally {
      setHandoverLoading(false);
    }
  }, [showHandovers, fromDate, toDate, statusFilter, staffFilter, shiftFilter]);

  useEffect(() => { loadHandovers(); }, [loadHandovers]);

  const catName = (id) => {
    if (!id) return '-';
    const c = categories.find((x) => x.id === id);
    return c ? c.name : '-';
  };

  const directionBadge = (d) => {
    const common = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    if (d === 'income') return <span className={`${common} bg-emerald-50 text-emerald-700 border border-emerald-200`}>إيراد</span>;
    if (d === 'expense') return <span className={`${common} bg-rose-50 text-rose-700 border border-rose-200`}>مصروف</span>;
    return null;
  };

  const paymentLabel = (m) => {
    if (m === 'cash') return 'نقدي (خزنة)';
    if (m === 'bank') return 'حساب بنكي';
    if (m === 'instapay') return 'إنستاباي / بطاقة بنكية';
    // أي قيم قديمة مثل vodafone_cash أو etisalat_cash أو other نعرضها كمحفظة إلكترونية موحدة
    return 'محفظة إلكترونية';
  };

  // ملخص سريع للتجميع حسب الفلاتر الحالية
  const summary = React.useMemo(() => {
    let cashIncome = 0, cashExpense = 0;
    let eIncome = 0, eExpense = 0; // غير نقدي
    (rows || []).forEach((r) => {
      const amt = Number(r.amount || 0);
      if (!amt) return;
      const isIncome = r.direction === 'income';
      const isCash = r.payment_method === 'cash';
      if (isCash) {
        if (isIncome) cashIncome += amt; else cashExpense += amt;
      } else {
        if (isIncome) eIncome += amt; else eExpense += amt;
      }
    });
    return {
      cashIncome: Math.round(cashIncome),
      cashExpense: Math.round(cashExpense),
      cashNet: Math.round(cashIncome - cashExpense),
      eIncome: Math.round(eIncome),
      eExpense: Math.round(eExpense),
      eNet: Math.round(eIncome - eExpense),
    };
  }, [rows]);

  const staffName = (id) => {
    if (!id) return 'غير محدد';
    const u = staffUsers.find((x) => x.id === id);
    if (!u) return 'مستخدم غير معروف';
    return u.full_name || u.username || 'مستخدم';
  };

  // جلب معرفات الورديات الخاصة بموظف معين، لدعم فلترة تظهر معاملات تسليم مجمّع الخاصة به
  useEffect(() => {
    const loadStaffShifts = async () => {
      if (!staffFilter) { setStaffShiftIds([]); return; }
      try {
        let q = supabase
          .from('reception_shifts')
          .select('id,shift_date,staff_user_id')
          .eq('staff_user_id', staffFilter);
        if (fromDate) q = q.gte('shift_date', fromDate);
        if (toDate) q = q.lte('shift_date', toDate);
        const { data } = await q;
        setStaffShiftIds((data || []).map(r => r.id));
      } catch (e) {
        console.error('load staff shifts for filter error', e);
        setStaffShiftIds([]);
      }
    };
    loadStaffShifts();
  }, [staffFilter, fromDate, toDate]);

  const statusBadge = (s) => {
    const common = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    if (s === 'confirmed') return <span className={`${common} bg-emerald-50 text-emerald-700 border border-emerald-200`}>مؤكَّد</span>;
    if (s === 'pending') return <span className={`${common} bg-amber-50 text-amber-700 border border-amber-200`}>معلّق</span>;
    if (s === 'rejected') return <span className={`${common} bg-rose-50 text-rose-700 border border-rose-200`}>مرفوض</span>;
    return null;
  };

  const isReservationRefund = (row) => (
    row && row.direction === 'expense' && row.source_type === 'reservation'
  );

  const handleConfirm = async (row) => {
    if (row.direction === 'expense' && !canConfirmExpense) {
      alert('فقط المدير يمكنه اعتماد المصروفات.');
      return;
    }
    if (row.direction === 'income' && !canConfirmIncome) {
      alert('فقط المدير أو مساعد المدير يمكنه تأكيد التحصيل.');
      return;
    }
    let selectedPaymentMethod = null;
    let selectedBankAccountId = null;

    // في حالة اعتماد طلب استرداد حجز، نطلب من المدير اختيار مصدر الصرف الفعلي
    if (isReservationRefund(row)) {
      const choice = window.prompt(
        'اعتماد طلب استرداد الحجز:\n\n' +
        'اختر مصدر صرف مبلغ الاسترداد (اكتب رقم الخيار):\n' +
        '1) خزنة نقدية (cash)\n' +
        '2) إنستاباي / بطاقة بنكية (instapay)\n' +
        '3) محفظة إلكترونية (other)\n' +
        '4) حساب بنكي محدد (bank)\n\n' +
        'اترك الحقل فارغًا لإلغاء العملية.',
        '1'
      );
      if (!choice) {
        alert('تم إلغاء اعتماد طلب الاسترداد؛ لم يتم تعديل المعاملة.');
        return;
      }
      const trimmed = String(choice).trim();
      if (trimmed === '1') {
        selectedPaymentMethod = 'cash';
      } else if (trimmed === '2') {
        selectedPaymentMethod = 'instapay';
      } else if (trimmed === '3') {
        selectedPaymentMethod = 'other';
      } else if (trimmed === '4') {
        // تحميل الحسابات البنكية المتاحة للاختيار
        try {
          const { data: banks, error: bankError } = await supabase
            .from('bank_accounts')
            .select('id,bank_name,account_name,active')
            .eq('active', true);
          if (bankError) throw bankError;
          const list = banks || [];
          if (list.length === 0) {
            alert('لا توجد حسابات بنكية مفعّلة حاليًا لاختيارها كمصدر للصرف.');
            return;
          }
          const optionsText = list
            .map((b, idx) => `${idx + 1}) ${b.bank_name} — ${b.account_name}`)
            .join('\n');
          const bankChoice = window.prompt(
            'اختر الحساب البنكي الذي سيتم منه صرف مبلغ الاسترداد (اكتب رقم السطر):\n\n' +
            optionsText +
            '\n\nاترك الحقل فارغًا لإلغاء العملية.'
          );
          if (!bankChoice) {
            alert('تم إلغاء اعتماد طلب الاسترداد؛ لم يتم تعديل المعاملة.');
            return;
          }
          const bankIndex = parseInt(bankChoice, 10);
          if (!Number.isFinite(bankIndex) || bankIndex < 1 || bankIndex > list.length) {
            alert('اختيار غير صالح للحساب البنكي؛ لم يتم تعديل المعاملة.');
            return;
          }
          const chosen = list[bankIndex - 1];
          selectedPaymentMethod = 'bank';
          selectedBankAccountId = chosen.id;
        } catch (e) {
          console.error('load bank accounts for refund confirm error', e);
          alert('تعذّر تحميل قائمة الحسابات البنكية؛ لم يتم اعتماد طلب الاسترداد.');
          return;
        }
      } else {
        alert('اختيار غير صحيح؛ لم يتم اعتماد طلب الاسترداد.');
        return;
      }
    } else {
      const ok = window.confirm('تأكيد استلام هذا المبلغ واعتماده في الخزنة والتقارير؟');
      if (!ok) return;
    }
    try {
      const payload = {
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      };
      // في حالة طلب استرداد، نحدث طريقة الدفع والحساب البنكي حسب اختيار المدير
      if (isReservationRefund(row) && selectedPaymentMethod) {
        payload.payment_method = selectedPaymentMethod;
        payload.bank_account_id = selectedPaymentMethod === 'bank' ? (selectedBankAccountId || null) : null;
      }
      if (currentUser && currentUser.id) {
        payload.confirmed_by = currentUser.id;
      }
      const { error } = await supabase
        .from('accounting_transactions')
        .update(payload)
        .eq('id', row.id);
      if (error) throw error;
      // تحديث الإحصاءات والجدول
      try {
        const evt = new Event('accounting-tx-updated');
        window.dispatchEvent(evt);
      } catch (_) {}
      await load();
    } catch (e) {
      console.error('confirm transaction error', e);
      alert('تعذّر تأكيد العملية: ' + (e.message || e));
    }
  };

  const handleReject = async (row) => {
    if (row.direction === 'expense' && !canConfirmExpense) {
      alert('فقط المدير يمكنه رفض المصروفات.');
      return;
    }
    if (row.direction === 'income' && !canConfirmIncome) {
      alert('فقط المدير أو مساعد المدير يمكنه رفض هذه العملية.');
      return;
    }
    const ok = window.confirm('رفض هذه العملية وعدم احتسابها في الخزنة أو التقارير؟');
    if (!ok) return;
    try {
      const payload = {
        status: 'rejected',
        confirmed_at: new Date().toISOString(),
      };
      if (currentUser && currentUser.id) {
        payload.confirmed_by = currentUser.id;
      }
      const { error } = await supabase
        .from('accounting_transactions')
        .update(payload)
        .eq('id', row.id);
      if (error) throw error;
      try {
        const evt = new Event('accounting-tx-updated');
        window.dispatchEvent(evt);
      } catch (_) {}
      await load();
    } catch (e) {
      console.error('reject transaction error', e);
      alert('تعذّر رفض العملية: ' + (e.message || e));
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 border rounded p-3">
          <div className="text-xs text-gray-600">تحصيل نقدي (ضمن النتائج الحالية)</div>
          <div className="font-bold text-lg text-emerald-700">{summary.cashIncome} ج.م</div>
        </div>
        <div className="bg-gray-50 border rounded p-3">
          <div className="text-xs text-gray-600">مصروف نقدي</div>
          <div className="font-bold text-lg text-rose-700">{summary.cashExpense} ج.م</div>
        </div>
        <div className="bg-gray-50 border rounded p-3">
          <div className="text-xs text-gray-600">صافي النقدي</div>
          <div className="font-bold text-lg text-blue-700">{summary.cashNet} ج.م</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            className="border rounded pl-9 pr-3 py-2 w-full text-sm"
            placeholder="بحث في الوصف"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={direction}
          onChange={(e) => { setDirection(e.target.value); setPage(0); }}
        >
          <option value="">كل الأنواع</option>
          <option value="income">إيرادات</option>
          <option value="expense">مصروفات</option>
        </select>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={paymentMethod}
          onChange={(e) => { setPaymentMethod(e.target.value); setPage(0); }}
        >
          <option value="">كل طرق الدفع</option>
          <option value="cash">نقدي (خزنة)</option>
          <option value="bank">حساب بنكي</option>
          <option value="instapay">إنستاباي / بطاقة بنكية</option>
          <option value="other">محفظة إلكترونية</option>
        </select>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
        >
          <option value="">كل المصادر</option>
          <option value="reservation">حجوزات فقط</option>
          <option value="manual">عمليات يدوية</option>
        </select>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
        >
          <option value="">كل الحالات</option>
          <option value="pending">معلّقة</option>
          <option value="confirmed">مؤكَّدة</option>
          <option value="rejected">مرفوضة</option>
        </select>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={staffFilter}
          onChange={(e) => { setStaffFilter(e.target.value); setPage(0); }}
        >
          <option value="">كل الموظفين</option>
          {staffUsers.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name || s.username}</option>
          ))}
        </select>
        <input
          type="text"
          className="border rounded px-3 py-2 text-sm"
          placeholder="رقم الوردية"
          value={shiftFilter}
          onChange={(e) => { setShiftFilter(e.target.value); setPage(0); }}
        />
        {canBulkHandover && (
          <button
            type="button"
            className="px-3 py-2 rounded text-xs border bg-blue-50 text-blue-700 border-blue-300 disabled:opacity-50"
            onClick={async () => {
              if (!shiftFilter) { alert('من فضلك أدخل رقم الوردية أولًا'); return; }
              try {
                // حساب الإجمالي المتوقع: تحصيل نقدي مؤكد − مصروف نقدي مؤكد − ما تم تسليمه مسبقًا
                const [{ data: txs }, { data: hands }] = await Promise.all([
                  supabase
                    .from('accounting_transactions')
                    .select('direction,amount,payment_method,status')
                    .eq('reception_shift_id', shiftFilter),
                  supabase
                    .from('reception_shift_handovers')
                    .select('amount')
                    .eq('from_shift_id', shiftFilter),
                ]);
                let cashIncome = 0, cashExpense = 0;
                (txs || []).forEach((t) => {
                  const a = Number(t.amount || 0);
                  if (!a) return;
                  if ((t.payment_method || '') === 'cash') {
                    if (t.direction === 'income') cashIncome += a; else cashExpense += a;
                  }
                });
                const delivered = (hands || []).reduce((acc, h) => acc + Number(h.amount || 0), 0);
                const expected = Math.max(0, Math.round(cashIncome - cashExpense - delivered));
                setBulkHandoverExpected(expected);
                setBulkHandoverActual(expected);
                setShowBulkCashHandover(true);
              } catch (e) {
                console.error('compute bulk handover expected error', e);
                alert('تعذّر حساب الإجمالي المتوقع للتسليم: ' + (e.message || e));
              }
            }}
          >
            تسليم نقدي مجمّع من الوردية
          </button>
        )}
        <button
          type="button"
          className={`px-3 py-2 rounded text-xs border whitespace-nowrap ${showHandovers ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}`}
          onClick={() => setShowHandovers((prev) => !prev)}
        >
          {showHandovers ? 'عرض المعاملات' : 'عرض الحوالات (تسليم/استلام)'}
        </button>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
        >
          <option value="">كل الحالات</option>
          <option value="pending">معلّقة</option>
          <option value="confirmed">مؤكَّدة</option>
          <option value="rejected">مرفوضة</option>
        </select>
        <input
          type="date"
          className="border rounded px-3 py-2 text-sm"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
        />
        <input
          type="date"
          className="border rounded px-3 py-2 text-sm"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(0); }}
        />
        <button
          type="button"
          onClick={() => {
            setRefundOnly((prev) => !prev);
            setPage(0);
          }}
          className={`px-3 py-2 rounded text-xs border whitespace-nowrap ${refundOnly ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'}`}
        >
          طلبات استرداد الحجوزات
        </button>
      </div>

      {showHandovers ? (
        handoverLoading ? (
          <div className="py-12 text-center text-gray-500 text-sm">جاري تحميل الحوالات...</div>
        ) : handoverRows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">لا توجد حوالات مطابقة للفلاتر الحالية.</div>
        ) : (
          <div className="overflow-x-auto border rounded bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-right">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">المرسل</th>
                  <th className="px-3 py-2">المستلم</th>
                  <th className="px-3 py-2">التتبّع</th>
                  <th className="px-3 py-2">الوصف</th>
                </tr>
              </thead>
              <tbody>
                {handoverRows.map((h) => (
                  <tr key={h.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{h.tx_date}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-800">{Math.round(Number(h.amount || 0))}</td>
                    <td className="px-3 py-2 text-sm">{statusBadge(h.status)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-700">
                      {(() => {
                        const sid = h.from_shift_id;
                        const staffId = shiftStaffMap[sid];
                        return staffName(staffId);
                      })()}
                      <div className="text-[10px] text-gray-400">وردية: {h.from_shift_id}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-700">
                      {h.to_manager_id ? staffName(h.to_manager_id) : (h.to_shift_id ? staffName(shiftStaffMap[h.to_shift_id]) : 'قيد الترحيل')}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 whitespace-nowrap">
                      <div>حوالة: {String(h.id).slice(0,8)}…</div>
                      {handoverLinkedMap[h.id] && (
                        <div className="text-[10px] text-amber-700">معاملات مرتبطة: {handoverLinkedMap[h.id].count} — صافي: {handoverLinkedMap[h.id].net} ج.م</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm max-w-xl whitespace-normal break-words">{h.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">جاري تحميل المعاملات المالية...</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">لا توجد معاملات مطابقة للبحث الحالي.</div>
      ) : (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-right">
                <th className="px-3 py-2">التاريخ</th>
                <th className="px-3 py-2">النوع</th>
                <th className="px-3 py-2">الفئة</th>
                <th className="px-3 py-2">المبلغ</th>
                <th className="px-3 py-2">طريقة الدفع</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">التتبّع</th>
                <th className="px-3 py-2">الوصف</th>
                <th className="px-3 py-2">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{r.tx_date}</td>
                  <td className="px-3 py-2">{directionBadge(r.direction)}</td>
                  <td className="px-3 py-2 text-sm">
                    <div className="flex flex-col items-start gap-0.5">
                      <span>{catName(r.category_id)}</span>
                      {isReservationRefund(r) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                          استرداد حجز
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-sm font-semibold ${r.direction === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {Number(r.amount || 0)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">{paymentLabel(r.payment_method)}</td>
                  <td className="px-3 py-2 text-sm">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 text-[11px] text-gray-600 whitespace-nowrap">
                    <div>تحصيل: {staffName(r.created_by)}</div>
                    <div className="text-[10px] text-gray-400">
                      {r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : ''}
                    </div>
                    {r.status === 'confirmed' && (
                      <div className="mt-1">
                        <div>تأكيد: {staffName(r.confirmed_by)}</div>
                        <div className="text-[10px] text-gray-400">
                          {r.confirmed_at ? new Date(r.confirmed_at).toLocaleString('ar-EG') : ''}
                        </div>
                      </div>
                    )}
                    {r.status === 'rejected' && (
                      <div className="mt-1">
                        <div>رفض: {staffName(r.confirmed_by)}</div>
                        <div className="text-[10px] text-gray-400">
                          {r.confirmed_at ? new Date(r.confirmed_at).toLocaleString('ar-EG') : ''}
                        </div>
                      </div>
                    )}
                    {r.reception_shift_id && (
                      <div className="mt-1 text-[10px] text-gray-500">
                        وردية: {r.reception_shift_id}
                        {shiftStaffMap[r.reception_shift_id] && (
                          <> — موظف الوردية: {staffName(shiftStaffMap[r.reception_shift_id])}</>
                        )}
                      </div>
                    )}
                    {r.delivered_in_handover_id && (
                      <div className="mt-1 text-[10px] text-amber-700">
                        تسليم مجمّع: {r.delivered_in_handover_id.slice(0,8)}…
                        {handoverSenderMap[r.delivered_in_handover_id] && (
                          <> — مرسل: {staffName(handoverSenderMap[r.delivered_in_handover_id])}</>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm max-w-xl whitespace-normal break-words">{r.description}</td>
                  <td className="px-3 py-2 text-xs text-right">
                    {r.status === 'pending' && r.payment_method !== 'cash' && (
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          type="button"
                          className="px-2 py-1 rounded border text-xs bg-emerald-50 text-emerald-700 border-emerald-300 disabled:opacity-50"
                          onClick={() => handleConfirm(r)}
                          disabled={r.direction === 'expense' ? !canConfirmExpense : !canConfirmIncome}
                        >
                          {r.direction === 'income'
                            ? 'تأكيد الاستلام'
                            : (isReservationRefund(r) ? 'اعتماد طلب الاسترداد' : 'تأكيد المصروف')}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 rounded border text-xs bg-rose-50 text-rose-700 border-rose-300 disabled:opacity-50"
                          onClick={() => handleReject(r)}
                          disabled={r.direction === 'expense' ? !canConfirmExpense : !canConfirmIncome}
                        >
                          {r.direction === 'income'
                            ? 'رفض التحصيل'
                            : (isReservationRefund(r) ? 'رفض طلب الاسترداد' : 'رفض المصروف')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">النتائج: {rows.length} / الإجمالي: {totalCount}</div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            السابق
          </button>
          <span className="text-sm">صفحة {page + 1}</span>
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * pageSize >= totalCount}
          >
            التالي
          </button>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {showBulkCashHandover && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6" dir="rtl">
            <h3 className="text-lg font-bold mb-2">تسليم نقدي مجمّع من الوردية</h3>
            <div className="mb-3 text-sm text-gray-700">
              رقم الوردية: <span className="font-bold">{shiftFilter}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">المبلغ المتوقع من معاملات النقد</div>
                <div className="border rounded px-2 py-1 bg-gray-50">{bulkHandoverExpected} ج.م</div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">المبلغ الفعلي المستلم نقدًا</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="number"
                  step="1"
                  value={bulkHandoverActual}
                  onChange={(e) => setBulkHandoverActual(Math.round(Number(e.target.value || 0)))}
                />
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-3">
              الفرق: <span className="font-bold">{Math.round((bulkHandoverActual || 0) - (bulkHandoverExpected || 0))} ج.م</span>
              {' '}— {((bulkHandoverActual || 0) - (bulkHandoverExpected || 0)) === 0 ? 'مطابق' : ((bulkHandoverActual || 0) - (bulkHandoverExpected || 0)) < 0 ? 'عجز' : 'زيادة'}
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-200 px-3 py-1 rounded" onClick={() => setShowBulkCashHandover(false)}>إلغاء</button>
              <button
                className="bg-blue-600 text-white px-3 py-1 rounded"
                onClick={async () => {
                  try {
                    const actual = Math.round(bulkHandoverActual || 0);
                    const expected = Math.round(bulkHandoverExpected || 0);
                    const diff = actual - expected;
                    // سجل الحوالة كاستلام مدير
                    const { data: handData, error: handErr } = await supabase
                      .from('reception_shift_handovers')
                      .insert({
                        from_shift_id: shiftFilter,
                        to_manager_id: currentUser?.id || null,
                        tx_date: new Date().toISOString().slice(0, 10),
                        amount: actual,
                        note: 'تسليم نقدي مجمّع من المعاملات',
                        created_by: currentUser?.id || null,
                        status: 'received_by_manager',
                      })
                      .select('*');
                    if (handErr) throw handErr;
                    const hand = handData && handData[0];
                    // سجّل حركة محاسبية لإخراج النقد من الخزنة (مصروف)
                    await supabase.from('accounting_transactions').insert({
                      tx_date: new Date().toISOString().slice(0, 10),
                      direction: 'expense',
                      category_id: null,
                      amount: actual,
                      payment_method: 'cash',
                      bank_account_id: null,
                      source_type: 'reception_shift',
                      reservation_id: null,
                      description: `تسليم نقدي مجمّع لمدير الوردية ${shiftFilter}${diff !== 0 ? ` — فرق ${diff} ج.م` : ''}`,
                      status: 'confirmed',
                      reception_shift_id: shiftFilter,
                      created_by: currentUser?.id || null,
                      delivered_in_handover_id: hand?.id || null,
                    });
                    // تأكيد كل معاملات النقد الخاصة بهذه الوردية كمؤكَّدة محاسبيًا الآن
                    await supabase
                      .from('accounting_transactions')
                      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: currentUser?.id || null, delivered_in_handover_id: hand?.id || null })
                      .eq('reception_shift_id', shiftFilter)
                      .eq('payment_method', 'cash')
                      .eq('status', 'pending');
                    // إن وُجد فرق، سجّل حركة محاسبية إضافية بالعجز/الزيادة
                    if (diff !== 0) {
                      const isSurplus = diff > 0;
                      const note = isSurplus
                        ? `زيادة عهدة مقارنة بالمتوقع في تسليم مجمّع: المتوقع ${expected} ج.م، الفعلي ${actual} ج.م، الفرق ${diff} ج.م.`
                        : `عجز عهدة مقارنة بالمتوقع في تسليم مجمّع: المتوقع ${expected} ج.م، الفعلي ${actual} ج.م، الفرق ${Math.abs(diff)} ج.م.`;
                      await supabase.from('accounting_transactions').insert({
                        tx_date: new Date().toISOString().slice(0, 10),
                        direction: isSurplus ? 'income' : 'expense',
                        category_id: null,
                        amount: Math.abs(diff),
                        payment_method: 'cash',
                        bank_account_id: null,
                        source_type: 'reception_shift',
                        reservation_id: null,
                        description: note,
                        status: 'confirmed',
                        reception_shift_id: shiftFilter,
                        created_by: currentUser?.id || null,
                      });
                    }
                    setShowBulkCashHandover(false);
                    try { window.dispatchEvent(new Event('accounting-tx-updated')); } catch (_) {}
                    alert('تم تسجيل تسليم النقد المجمّع بنجاح.');
                  } catch (e) {
                    console.error('bulk cash handover error', e);
                    alert('تعذّر تسجيل التسليم: ' + (e.message || e));
                  }
                }}
              >
                تأكيد التسليم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountingCategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('income');
  const [color, setColor] = useState('#16a34a');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounting_categories')
        .select('id,type,name,color,active')
        .order('type', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (e) {
      console.error('load accounting categories error', e);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const trimmed = (name || '').trim();
    if (!trimmed) {
      alert('يرجى إدخال اسم الفئة.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        type,
        color: color || null,
        active: true,
      };
      const { error } = await supabase.from('accounting_categories').insert(payload);
      if (error) throw error;
      setName('');
      await load();
    } catch (e) {
      console.error('add accounting category error', e);
      alert('تعذّر إضافة الفئة.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat) => {
    try {
      const { error } = await supabase
        .from('accounting_categories')
        .update({ active: !cat.active })
        .eq('id', cat.id);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error('toggle accounting category error', e);
      alert('تعذّر تحديث حالة الفئة.');
    }
  };

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  return (
    <div className="bg-white rounded-lg border p-4" dir="rtl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">شجرة الحسابات المبسّطة</h2>
        <p className="text-xs text-gray-500">إدارة فئات الإيرادات والمصروفات التي تُستخدم في المعاملات والتقارير.</p>
      </div>

      <form className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5" onSubmit={handleAdd}>
        <div>
          <label className="block text-xs mb-1">نوع الفئة</label>
          <select
            className="border rounded px-3 py-2 text-sm w-full"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="income">إيراد</option>
            <option value="expense">مصروف</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">اسم الفئة</label>
          <input
            className="border rounded px-3 py-2 text-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: إيجار قاعة / كهرباء"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">لون توضيحي (اختياري)</label>
          <input
            type="color"
            className="border rounded px-2 py-2 text-sm w-full h-[38px]"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm w-full"
            disabled={saving}
          >
            {saving ? 'جارٍ الإضافة...' : 'إضافة فئة'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="py-10 text-center text-gray-500 text-sm">جاري تحميل الفئات...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-emerald-800">فئات الإيرادات</h3>
            </div>
            {incomeCats.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">لا توجد فئات إيراد بعد.</div>
            ) : (
              <div className="border rounded divide-y bg-white">
                {incomeCats.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border"
                        style={{ backgroundColor: c.color || '#16a34a' }}
                      />
                      <span className="text-sm text-gray-800">{c.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={`text-xs px-2 py-1 rounded border ${c.active ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-500 bg-gray-50'}`}
                    >
                      {c.active ? 'مفعّل' : 'موقوف'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-rose-800">فئات المصروفات</h3>
            </div>
            {expenseCats.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">لا توجد فئات مصروف بعد.</div>
            ) : (
              <div className="border rounded divide-y bg-white">
                {expenseCats.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border"
                        style={{ backgroundColor: c.color || '#ef4444' }}
                      />
                      <span className="text-sm text-gray-800">{c.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={`text-xs px-2 py-1 rounded border ${c.active ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-500 bg-gray-50'}`}
                    >
                      {c.active ? 'مفعّل' : 'موقوف'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountingReportsTab() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [byCategory, setByCategory] = useState([]);
  const [byPayment, setByPayment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeReport, setActiveReport] = useState('overview'); // overview | income-expense | wallets | refunds
  const [walletSummary, setWalletSummary] = useState({
    totalIn: 0,
    totalOut: 0,
    net: 0,
    confirmedCount: 0,
    pendingCount: 0,
    transferCount: 0,
  });
  const [walletRows, setWalletRows] = useState([]);
  const [walletMethodFilter, setWalletMethodFilter] = useState('');
  const [walletStatusFilter, setWalletStatusFilter] = useState('');
  const [refundSummary, setRefundSummary] = useState({
    confirmedTotal: 0,
    pendingTotal: 0,
    confirmedCount: 0,
    pendingCount: 0,
  });
  const [refundRows, setRefundRows] = useState([]);

  useEffect(() => {
    const today = new Date();
    const yyyyMmDd = today.toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    setFromDate(monthStart);
    setToDate(yyyyMmDd);
  }, []);

  useEffect(() => {
    const loadCats = async () => {
      try {
        const { data } = await supabase
          .from('accounting_categories')
          .select('id,name,type')
          .order('type', { ascending: true })
          .order('name', { ascending: true });
        setCategories(data || []);
      } catch (e) {
        console.error('load categories for reports error', e);
      }
    };
    loadCats();
  }, []);

  const load = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounting_transactions')
        .select('direction,amount,payment_method,category_id,tx_date,status,source_type')
        .eq('status', 'confirmed')
        .neq('source_type', 'transfer')
        .gte('tx_date', fromDate)
        .lte('tx_date', toDate);
      if (error) throw error;

      let income = 0;
      let expense = 0;
      const catAgg = new Map();
      const payAgg = new Map();

      (data || []).forEach((row) => {
        const amt = Number(row.amount || 0);
        if (!amt) return;
        const isIncome = row.direction === 'income';
        if (isIncome) income += amt; else expense += amt;

        const catKey = row.category_id || 'none';
        if (!catAgg.has(catKey)) {
          catAgg.set(catKey, { category_id: row.category_id, income: 0, expense: 0 });
        }
        const catRow = catAgg.get(catKey);
        if (isIncome) catRow.income += amt; else catRow.expense += amt;

        const payKey = row.payment_method || 'other';
        if (!payAgg.has(payKey)) {
          payAgg.set(payKey, { payment_method: payKey, income: 0, expense: 0 });
        }
        const payRow = payAgg.get(payKey);
        if (isIncome) payRow.income += amt; else payRow.expense += amt;
      });

      setSummary({ income, expense, net: income - expense });
      setByCategory(Array.from(catAgg.values()));
      setByPayment(Array.from(payAgg.values()));
    } catch (e) {
      console.error('load accounting reports error', e);
      setSummary({ income: 0, expense: 0, net: 0 });
      setByCategory([]);
      setByPayment([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWalletReport = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      let q = supabase
        .from('accounting_transactions')
        .select('id,tx_date,direction,amount,payment_method,status,source_type,description,created_at')
        .gte('tx_date', fromDate)
        .lte('tx_date', toDate)
        .in('payment_method', ['cash', 'instapay', 'other'])
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (walletMethodFilter) q = q.eq('payment_method', walletMethodFilter);
      if (walletStatusFilter) q = q.eq('status', walletStatusFilter);

      const { data, error } = await q;
      if (error) throw error;

      let totalIn = 0;
      let totalOut = 0;
      let confirmedCount = 0;
      let pendingCount = 0;
      let transferCount = 0;

      (data || []).forEach((row) => {
        const amt = Number(row.amount || 0);
        if (!amt) return;
        const signed = row.direction === 'income' ? amt : -amt;
        if (signed >= 0) totalIn += signed; else totalOut += -signed;
        if (row.status === 'confirmed') confirmedCount += 1;
        else if (row.status === 'pending') pendingCount += 1;
        if (row.source_type === 'transfer') transferCount += 1;
      });

      setWalletSummary({
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        confirmedCount,
        pendingCount,
        transferCount,
      });
      setWalletRows(data || []);
    } catch (e) {
      console.error('load wallet movements report error', e);
      setWalletSummary({ totalIn: 0, totalOut: 0, net: 0, confirmedCount: 0, pendingCount: 0, transferCount: 0 });
      setWalletRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRefundReport = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounting_transactions')
        .select('id,tx_date,amount,payment_method,status,source_type,direction,category_id,reservation_id,description')
        .eq('direction', 'expense')
        .eq('source_type', 'reservation')
        .gte('tx_date', fromDate)
        .lte('tx_date', toDate)
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;

      let confirmedTotal = 0;
      let pendingTotal = 0;
      let confirmedCount = 0;
      let pendingCount = 0;

      (data || []).forEach((row) => {
        const amt = Number(row.amount || 0) || 0;
        if (!amt) return;
        if (row.status === 'confirmed') {
          confirmedTotal += amt;
          confirmedCount += 1;
        } else if (row.status === 'pending') {
          pendingTotal += amt;
          pendingCount += 1;
        }
      });

      setRefundSummary({ confirmedTotal, pendingTotal, confirmedCount, pendingCount });
      setRefundRows(data || []);
    } catch (e) {
      console.error('load refund report error', e);
      setRefundSummary({ confirmedTotal: 0, pendingTotal: 0, confirmedCount: 0, pendingCount: 0 });
      setRefundRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fromDate && toDate) {
      if (activeReport === 'income-expense') {
        load();
      } else if (activeReport === 'wallets') {
        loadWalletReport();
      } else if (activeReport === 'refunds') {
        loadRefundReport();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, activeReport, walletMethodFilter, walletStatusFilter]);

  const catName = (id) => {
    if (!id) return 'بدون فئة محددة';
    const c = categories.find((x) => x.id === id);
    return c ? c.name : 'فئة غير معروفة';
  };

  const paymentLabel = (m) => {
    if (m === 'cash') return 'نقدي (خزنة)';
    if (m === 'bank') return 'حساب بنكي';
    if (m === 'instapay') return 'إنستاباي / بطاقة بنكية';
    return 'محفظة إلكترونية';
  };

  return (
    <div className="bg-white rounded-lg border p-4" dir="rtl">
      {activeReport === 'overview' ? (
        <>
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">مركز التقارير المحاسبية</h2>
                <p className="text-xs text-gray-500">اختر نوع التقرير الذي تريد عرضه من القائمة التالية.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg bg-gray-50 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-gray-800">التقارير المالية</div>
              </div>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded border bg-white text-sm hover:bg-emerald-50 hover:border-emerald-300 transition"
                onClick={() => setActiveReport('income-expense')}
              >
                <span>تقرير الأرباح والخسائر للفترة</span>
                <span className="text-xs text-gray-400">إجمالي الإيرادات والمصروفات</span>
              </button>
            </div>

            <div className="border rounded-lg bg-gray-50 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-gray-800">تقارير تشغيلية (محاسبة)</div>
              </div>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded border bg-white text-sm hover:bg-sky-50 hover:border-sky-300 transition"
                onClick={() => setActiveReport('wallets')}
              >
                <span>تقرير حركة الخزنة والمحافظ</span>
                <span className="text-xs text-gray-400">تحليل التحصيل والصرف والتحويلات حسب المحفظة</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded border bg-white text-sm hover:bg-rose-50 hover:border-rose-300 transition"
                onClick={() => setActiveReport('refunds')}
              >
                <span>تقرير استرداد الحجوزات</span>
                <span className="text-xs text-gray-400">ملخص بمبالغ وعدد عمليات استرداد الحجوزات</span>
              </button>
            </div>
          </div>
        </>
      ) : activeReport === 'income-expense' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">تقرير الأرباح والخسائر للفترة</h2>
              <p className="text-xs text-gray-500">ملخص الإيرادات والمصروفات للفترة المختارة، مع تقسيم حسب الفئة وطريقة الدفع.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">من</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">إلى</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded border text-xs bg-white hover:bg-gray-50"
                onClick={() => setActiveReport('overview')}
              >
                الرجوع لقائمة التقارير
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-500 text-sm">جاري تحميل التقرير...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-emerald-700 mb-1">إجمالي الإيرادات</div>
                  <div className="text-xl font-bold text-emerald-900">{summary.income} جنيه</div>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-rose-700 mb-1">إجمالي المصروفات</div>
                  <div className="text-xl font-bold text-rose-900">{summary.expense} جنيه</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-indigo-700 mb-1">صافي الربح / الخسارة</div>
                  <div className={`text-xl font-bold ${summary.net >= 0 ? 'text-indigo-900' : 'text-rose-900'}`}>{summary.net} جنيه</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">حسب الفئة</div>
                  {byCategory.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-400">لا توجد معاملات في هذه الفترة.</div>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-white">
                        <tr className="text-right text-gray-600">
                          <th className="px-3 py-2">الفئة</th>
                          <th className="px-3 py-2">إيرادات</th>
                          <th className="px-3 py-2">مصروفات</th>
                          <th className="px-3 py-2">صافي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byCategory.map((row) => {
                          const net = (row.income || 0) - (row.expense || 0);
                          return (
                            <tr key={row.category_id || 'none'} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-[11px] text-gray-800">{catName(row.category_id)}</td>
                              <td className="px-3 py-1.5 text-[11px] text-emerald-700 font-semibold">{row.income || 0}</td>
                              <td className="px-3 py-1.5 text-[11px] text-rose-700 font-semibold">{row.expense || 0}</td>
                              <td className={`px-3 py-1.5 text-[11px] font-semibold ${net >= 0 ? 'text-indigo-800' : 'text-rose-800'}`}>{net}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">حسب طريقة الدفع</div>
                  {byPayment.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-400">لا توجد معاملات في هذه الفترة.</div>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-white">
                        <tr className="text-right text-gray-600">
                          <th className="px-3 py-2">طريقة الدفع</th>
                          <th className="px-3 py-2">إيرادات</th>
                          <th className="px-3 py-2">مصروفات</th>
                          <th className="px-3 py-2">صافي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byPayment.map((row) => {
                          const net = (row.income || 0) - (row.expense || 0);
                          return (
                            <tr key={row.payment_method} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-[11px] text-gray-800">{paymentLabel(row.payment_method)}</td>
                              <td className="px-3 py-1.5 text-[11px] text-emerald-700 font-semibold">{row.income || 0}</td>
                              <td className="px-3 py-1.5 text-[11px] text-rose-700 font-semibold">{row.expense || 0}</td>
                              <td className={`px-3 py-1.5 text-[11px] font-semibold ${net >= 0 ? 'text-indigo-800' : 'text-rose-800'}`}>{net}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      ) : activeReport === 'wallets' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">تقرير حركة الخزنة والمحافظ</h2>
              <p className="text-xs text-gray-500">حركة التحصيل والصرف والتحويلات على الكاش و Instapay والكاش الإلكتروني خلال الفترة المختارة.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">من</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">إلى</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <select
                className="border rounded px-2 py-1.5 text-xs"
                value={walletMethodFilter}
                onChange={(e) => setWalletMethodFilter(e.target.value)}
              >
                <option value="">كل المحافظ</option>
                <option value="cash">نقدي (خزنة)</option>
                <option value="instapay">إنستاباي / بطاقة بنكية</option>
                <option value="other">محفظة إلكترونية</option>
              </select>
              <select
                className="border rounded px-2 py-1.5 text-xs"
                value={walletStatusFilter}
                onChange={(e) => setWalletStatusFilter(e.target.value)}
              >
                <option value="">كل الحالات</option>
                <option value="pending">معلّقة</option>
                <option value="confirmed">مؤكدة</option>
                <option value="rejected">مرفوضة</option>
              </select>
              <button
                type="button"
                className="px-3 py-1.5 rounded border text-xs bg-white hover:bg-gray-50"
                onClick={() => setActiveReport('overview')}
              >
                الرجوع لقائمة التقارير
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-500 text-sm">جاري تحميل التقرير...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-emerald-700 mb-1">إجمالي المبالغ الداخلة</div>
                  <div className="text-xl font-bold text-emerald-900">{walletSummary.totalIn} جنيه</div>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-rose-700 mb-1">إجمالي المبالغ الخارجة</div>
                  <div className="text-xl font-bold text-rose-900">{walletSummary.totalOut} جنيه</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-indigo-700 mb-1">صافي الحركة</div>
                  <div className={`text-xl font-bold ${walletSummary.net >= 0 ? 'text-indigo-900' : 'text-rose-900'}`}>{walletSummary.net} جنيه</div>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-purple-700 mb-1">عدد التحويلات الداخلية</div>
                  <div className="text-xl font-bold text-purple-900">{walletSummary.transferCount}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-sky-50 border border-sky-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-sky-700 mb-1">عدد العمليات المؤكدة</div>
                  <div className="text-xl font-bold text-sky-900">{walletSummary.confirmedCount}</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-amber-700 mb-1">عدد العمليات المعلّقة</div>
                  <div className="text-xl font-bold text-amber-900">{walletSummary.pendingCount}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-700 mb-1">إجمالي عدد الحركات</div>
                  <div className="text-xl font-bold text-gray-900">{walletRows.length}</div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700 flex items-center justify-between">
                  <span>تفاصيل حركات الخزنة والمحافظ</span>
                  <span className="text-[11px] text-gray-400">إجمالي السجلات: {walletRows.length}</span>
                </div>
                {walletRows.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">لا توجد حركات مطابقة للفلاتر الحالية.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white">
                        <tr className="text-right text-gray-600">
                          <th className="px-3 py-2">التاريخ</th>
                          <th className="px-3 py-2">النوع</th>
                          <th className="px-3 py-2">المبلغ</th>
                          <th className="px-3 py-2">المحفظة</th>
                          <th className="px-3 py-2">الحالة</th>
                          <th className="px-3 py-2">المصدر</th>
                          <th className="px-3 py-2">الوصف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletRows.map((row) => (
                          <tr key={row.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-700">{row.tx_date}</td>
                            <td className={`px-3 py-1.5 text-[11px] font-semibold ${row.direction === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {row.direction === 'income' ? 'دخول' : 'خروج'}
                            </td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-800 font-semibold">{Number(row.amount || 0)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700">{paymentLabel(row.payment_method)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700">{row.status === 'confirmed' ? 'مؤكدة' : row.status === 'pending' ? 'معلّقة' : 'مرفوضة'}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700">
                              {row.source_type === 'transfer' ? 'تحويل داخلي' : row.source_type === 'reservation' ? 'من الحجوزات' : 'عملية يدوية'}
                            </td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700 max-w-xs whitespace-normal break-words">{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">تقرير استرداد الحجوزات</h2>
              <p className="text-xs text-gray-500">ملخص استردادات الحجوزات (مصروفات مرتبطة بالحجوزات) خلال الفترة المختارة.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">من</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">إلى</span>
                <input
                  type="date"
                  className="border rounded px-3 py-1.5 text-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded border text-xs bg-white hover:bg-gray-50"
                onClick={() => setActiveReport('overview')}
              >
                الرجوع لقائمة التقارير
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-500 text-sm">جاري تحميل التقرير...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-rose-700 mb-1">إجمالي استردادات مؤكدة</div>
                  <div className="text-xl font-bold text-rose-900">{refundSummary.confirmedTotal} جنيه</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-amber-700 mb-1">إجمالي استردادات معلّقة</div>
                  <div className="text-xl font-bold text-amber-900">{refundSummary.pendingTotal} جنيه</div>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-rose-700 mb-1">عدد العمليات المؤكدة</div>
                  <div className="text-xl font-bold text-rose-900">{refundSummary.confirmedCount}</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
                  <div className="text-xs text-amber-700 mb-1">عدد العمليات المعلّقة</div>
                  <div className="text-xl font-bold text-amber-900">{refundSummary.pendingCount}</div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700 flex items-center justify-between">
                  <span>تفاصيل عمليات استرداد الحجوزات</span>
                  <span className="text-[11px] text-gray-400">إجمالي السجلات: {refundRows.length}</span>
                </div>
                {refundRows.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">لا توجد عمليات استرداد مطابقة للفترة المختارة.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white">
                        <tr className="text-right text-gray-600">
                          <th className="px-3 py-2">التاريخ</th>
                          <th className="px-3 py-2">المبلغ</th>
                          <th className="px-3 py-2">طريقة الدفع / المحفظة</th>
                          <th className="px-3 py-2">الحالة</th>
                          <th className="px-3 py-2">الوصف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refundRows.map((row) => (
                          <tr key={row.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-700">{row.tx_date}</td>
                            <td className="px-3 py-1.5 text-[11px] text-rose-700 font-semibold">{Number(row.amount || 0)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700">{paymentLabel(row.payment_method)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700">{row.status === 'confirmed' ? 'مؤكدة' : row.status === 'pending' ? 'معلّقة' : 'مرفوضة'}</td>
                            <td className="px-3 py-1.5 text-[11px] text-gray-700 max-w-xs whitespace-normal break-words">{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
