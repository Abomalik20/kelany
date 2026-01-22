import React, { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import AccountingExpenseModal from '../components/AccountingExpenseModal.jsx';
import { AuthContext } from '../App.jsx';

export default function ReceptionDashboard() {
  const currentUser = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [date] = useState(() => new Date().toISOString().slice(0, 10));

  const [reservations, setReservations] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [search, _setSearch] = useState('');

  const [showExpense, setShowExpense] = useState(false);

  const [currentShift, setCurrentShift] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [shiftStats, _setShiftStats] = useState({
    cashIncome: 0,
    cashExpense: 0,
    net: 0,
  });

  // eslint-disable-next-line no-unused-vars
  const _readOnly = !currentShift || currentShift.status !== 'open';

  /* =========================
     تحميل البيانات الأساسية
  ========================= */
  useEffect(() => {
    if (!currentUser?.id) return;

    async function load() {
      setLoading(true);
      try {
        const { data: todayRows } = await supabase
          .from('reservations_overview')
          .select('*')
          .or(`check_in_date.eq.${date},check_out_date.eq.${date},is_current.eq.true`);

        setReservations(todayRows || []);

        const { data: upcomingRows } = await supabase
          .from('reservations_overview')
          .select('*')
          .gte('check_in_date', date)
          .lte('check_in_date', new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));

        setUpcoming(upcomingRows || []);

        const { data: shift } = await supabase
          .from('reception_shifts')
          .select('*')
          .eq('staff_user_id', currentUser.id)
          .eq('status', 'open')
          .maybeSingle();

        setCurrentShift(shift || null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [date, currentUser?.id]);

  /* =========================
     Helpers
  ========================= */
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  const filteredToday = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reservations;
    return reservations.filter(r =>
      (r.guest_name || '').toLowerCase().includes(term) ||
      (r.guest_phone || '').toLowerCase().includes(term) ||
      String(r.room_label || '').toLowerCase().includes(term)
    );
  }, [reservations, search]);

  const arrivalsToday = filteredToday.filter(
    r => r.check_in_date === date && ['pending', 'confirmed'].includes(r.status)
  );

  const departuresToday = filteredToday.filter(
    r => r.check_out_date === date && r.status === 'checked_in'
  );

  const inhouse = filteredToday.filter(r => r.is_current && r.status === 'checked_in');

  const upcoming3Days = upcoming.filter(r => !r.is_past);

  /* =========================
     فتح وردية
  ========================= */
  const handleOpenShift = async () => {
    if (!currentUser?.id) {
      alert('لا يمكن فتح وردية بدون مستخدم.');
      return;
    }

    if (currentShift) {
      alert('هناك وردية مفتوحة بالفعل.');
      return;
    }

    const { data, error } = await supabase
      .from('reception_shifts')
      .insert({
        shift_date: date,
        staff_user_id: currentUser.id,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setCurrentShift(data);
    _setShiftStats({ cashIncome: 0, cashExpense: 0, net: 0 });
  };

  /* =========================
     إغلاق وردية + تسليم
  ========================= */
  const handleCloseShift = async () => {
    if (!currentShift) return;

    const input = prompt('أدخل النقدية الفعلية بالخزنة:');
    if (input === null) return;

    const counted = Number(input);
    if (isNaN(counted)) {
      alert('مبلغ غير صحيح');
      return;
    }

    const { data: cashTx } = await supabase
      .from('accounting_transactions')
      .select('direction,amount')
      .eq('payment_method', 'cash')
      .eq('reception_shift_id', currentShift.id);

    let inc = 0, exp = 0;
    (cashTx || []).forEach(t => {
      if (t.direction === 'income') inc += Number(t.amount);
      else exp += Number(t.amount);
    });

    const expected = inc - exp;
    const diff = counted - expected;

    const { data: closed } = await supabase
      .from('reception_shifts')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        expected_cash: expected,
        counted_cash: counted,
        difference: diff,
      })
      .eq('id', currentShift.id)
      .select('*')
      .single();

    setCurrentShift(closed);

    const choice = prompt(
      'تسليم النقدية:\n1 = للإدارة\n2 = للوردية التالية\nاتركه فارغًا للتأجيل'
    );

    if (choice === '1') {
      await supabase.from('reception_shift_handovers').insert({
        from_shift_id: closed.id,
        to_manager_id: currentUser.id,
        amount: counted,
        created_by: currentUser.id,
        note: 'تسليم نقدي للإدارة',
      });
      alert('تم تسليم النقدية للإدارة.');
    }

    if (choice === '2') {
      await supabase.from('reception_shift_handovers').insert({
        from_shift_id: closed.id,
        to_shift_id: null,
        amount: counted,
        created_by: currentUser.id,
        note: 'تسليم نقدي للوردية التالية (معلّق)',
      });
      alert('تم تسجيل تسليم نقدي للوردية التالية (معلّق).');
    }
  };

  /* =========================
     Render
  ========================= */
  if (loading) {
    return <div className="p-6">جاري التحميل...</div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" dir="rtl">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="bg-yellow-400 px-4 py-2 rounded">نسخة احتياطية</button>
        </div>
        <div className="text-sm text-gray-600">{todayLabel}</div>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">لوحة تحكم الاستقبال</h1>
        <p className="text-sm text-gray-500">
          إدارة الوردية، التحصيل النقدي، وحركة النزلاء
        </p>
      </div>

      {/* Shift box */}
      <div className="bg-white border rounded p-4">
        <div className="flex justify-between items-center">
          <div>
            حالة الوردية:{' '}
            <span className="font-bold">
              {currentShift?.status === 'open' ? 'مفتوحة' : 'مغلقة / لا توجد'}
            </span>
          </div>
          {!currentShift && (
            <button onClick={handleOpenShift} className="bg-green-600 text-white px-3 py-1 rounded">
              فتح وردية
            </button>
          )}
          {currentShift?.status === 'open' && (
            <button onClick={handleCloseShift} className="bg-amber-600 text-white px-3 py-1 rounded">
              إغلاق وردية
            </button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-100 p-4 rounded">وصول اليوم: {arrivalsToday.length}</div>
        <div className="bg-emerald-100 p-4 rounded">مغادرة اليوم: {departuresToday.length}</div>
        <div className="bg-purple-100 p-4 rounded">مقيمون: {inhouse.length}</div>
        <div className="bg-amber-100 p-4 rounded">قادمون 3 أيام: {upcoming3Days.length}</div>
      </div>

      {/* Expense */}
      {showExpense && (
        <AccountingExpenseModal
          shift={currentShift}
          onClose={() => setShowExpense(false)}
        />
      )}
    </div>
  );
}
