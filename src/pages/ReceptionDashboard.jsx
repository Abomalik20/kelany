import React, { useContext, useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import AccountingExpenseModal from '../components/AccountingExpenseModal.jsx';
import { AuthContext } from '../App.jsx';
import { BadgeDollarSign, LogIn, LogOut, Users, CalendarDays, PlusCircle, MinusCircle, Info, Bell, ShieldCheck, Loader2 } from 'lucide-react';

export default function ReceptionDashboard() {
  // Manager handover modal state/hooks
  const [showManagerHandoverModal, setShowManagerHandoverModal] = useState(false);
  const [managerHandoverData, setManagerHandoverData] = useState(null);
  const managerHandoverAmountRef = useRef();
    // دالة حذف جميع الورديات المغلقة لهذا اليوم (للمدير فقط)
    const handleDeleteClosedShifts = async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (!window.confirm('هل أنت متأكد من حذف جميع الورديات المغلقة لهذا اليوم؟')) return;
      try {
        const { error } = await supabase
          .from('reception_shifts')
          .delete()
          .eq('shift_date', todayStr)
          .eq('status', 'closed');
        if (error) throw error;
        alert('تم حذف جميع الورديات المغلقة لهذا اليوم بنجاح.');
      } catch (e) {
        alert('تعذر حذف الورديات المغلقة: ' + (e.message || e));
      }
    };
  const currentUser = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [reservations, setReservations] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [search, setSearch] = useState('');
  const [pendingTx, setPendingTx] = useState([]);
  const [showExpense, setShowExpense] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverType, setHandoverType] = useState('manager');
  const [handoverAmount, setHandoverAmount] = useState(0);
  const [handoverRecipientId, setHandoverRecipientId] = useState(null);
  const [handoverStaffList, setHandoverStaffList] = useState([]);
  const [handoverManagers, setHandoverManagers] = useState([]);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [showPendingReceiptModal, setShowPendingReceiptModal] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [currentShift, setCurrentShift] = useState(null);
  const [shiftStats, setShiftStats] = useState({ cashIncome: 0, cashExpense: 0, net: 0 });
  const [deliveredThisShift, setDeliveredThisShift] = useState(0);
  const [dailySummary, setDailySummary] = useState({ received: 0, delivered: 0, net: 0 });
  // TODO: قد نستخدم autoShiftEnabled لاحقًا لتفعيل التحويل التلقائي للورديات
  // const [autoShiftEnabled, setAutoShiftEnabled] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  // UI Components
  const KPICard = ({ icon, label, value, color }) => (
    <div className={`flex items-center gap-3 bg-white rounded-xl shadow p-4 transition hover:scale-105 border-t-4 ${color}`}>
      <div className="bg-gray-100 rounded-full p-2">{icon}</div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );

  const QuickAction = ({ icon, label, onClick, disabled, tooltip }) => (
    <button
      className={`flex flex-col items-center justify-center gap-1 bg-gradient-to-tr from-blue-100 to-blue-50 hover:from-blue-200 hover:to-blue-100 rounded-lg p-3 shadow transition disabled:opacity-50 relative`}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      type="button"
    >
      <span className="text-blue-600">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {disabled && (
        <span className="absolute -top-2 -left-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow">مغلق</span>
      )}
    </button>
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: todayRows } = await supabase
          .from('reservations_overview')
          .select('*')
          .or(
            `check_in_date.eq.${date},check_out_date.eq.${date},is_current.eq.true`
          );

        setReservations(todayRows || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    // جلب الوردية الحالية للمستخدم إن وُجدت
    const fetchCurrentShift = async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: shifts } = await supabase
          .from('reception_shifts')
          .select('id,status,shift_date,staff_user_id,opened_at,closed_at,opening_cash,closing_cash,opening_note,closing_note')
          .eq('staff_user_id', currentUser?.id)
          .eq('shift_date', todayStr)
          .in('status', ['open','closed'])
          .order('opened_at', { ascending: false })
          .limit(1);
        const shift = (shifts && shifts.length > 0) ? shifts[0] : null;
        setCurrentShift(shift);
        setReadOnly(!shift || shift.status !== 'open');
        // حساب ملخص الوردية الحالية
        if (shift) updateShiftStats(shift);
      } catch (e) {
        console.error('fetchCurrentShift error', e);
      }
    };
    fetchCurrentShift();
  }, [date, currentUser?.id]);

  // تحديث ملخص الوردية من جدول الحركات المحاسبية
  const updateShiftStats = async (shiftParam) => {
    const shift = shiftParam || currentShift;
    if (!shift || !currentUser?.id) {
      setShiftStats({ cashIncome: 0, cashExpense: 0, net: 0 });
      return;
    }
    try {
      let query = supabase.from('accounting_transactions').select('direction,amount');
      if (shift.id) {
        query = query.eq('reception_shift_id', shift.id);
      } else {
        // fallback: sum transactions today created by current user
        query = query.eq('tx_date', shift.shift_date).eq('created_by', currentUser.id);
      }
      const { data: txs, error } = await query;
      if (error) throw error;
      let inc = 0, exp = 0;
      (txs || []).forEach((t) => {
        const a = Number(t.amount || 0);
        if (!a) return;
        if (t.direction === 'income') inc += a;
        else exp += a;
      });
      setShiftStats({ cashIncome: inc, cashExpense: exp, net: inc - exp });
    } catch (e) {
      console.error('updateShiftStats error', e);
    }
    // compute handovers delivered from this shift
    try {
      if (shift && shift.id) {
        const { data: delRows } = await supabase.from('reception_shift_handovers').select('amount').eq('from_shift_id', shift.id);
        const delivered = (delRows || []).reduce((a, r) => a + Number(r.amount || 0), 0);
        setDeliveredThisShift(delivered);
      } else setDeliveredThisShift(0);
    } catch (e) {
      console.error('fetch deliveredThisShift error', e);
      setDeliveredThisShift(0);
    }
  };

  const fetchDailySummary = async () => {
    if (!currentUser?.id) return;
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      // get all shifts for this user today
      const { data: myShifts } = await supabase.from('reception_shifts').select('id').eq('staff_user_id', currentUser.id).eq('shift_date', todayStr);
      const myShiftIds = (myShifts || []).map(s => s.id).filter(Boolean);

      // delivered today = sum amounts where from_shift_id in myShiftIds
      let delivered = 0;
      if (myShiftIds.length > 0) {
        const { data: delRows } = await supabase.from('reception_shift_handovers').select('amount').in('from_shift_id', myShiftIds);
        delivered = (delRows || []).reduce((a, r) => a + Number(r.amount || 0), 0);
      }

      // received today = sum amounts where to_shift_id in myShiftIds (already linked) OR received by this staff (status != pending)
      let received = 0;
      // to_shift_id linked
      if (myShiftIds.length > 0) {
        const { data: r1 } = await supabase.from('reception_shift_handovers').select('amount').in('to_shift_id', myShiftIds);
        received += (r1 || []).reduce((a, r) => a + Number(r.amount || 0), 0);
      }
      // direct received by staff (confirmed)
      const { data: r2 } = await supabase.from('reception_shift_handovers').select('amount').eq('to_staff_user_id', currentUser.id).neq('status', 'pending');
      received += (r2 || []).reduce((a, r) => a + Number(r.amount || 0), 0);

      setDailySummary({ received, delivered, net: received - delivered });
    } catch (e) {
      console.error('fetchDailySummary error', e);
      setDailySummary({ received: 0, delivered: 0, net: 0 });
    }
  };

  // استمع لحدث تحديث الحركات المحاسبية
  useEffect(() => {
    const handler = () => updateShiftStats();
    window.addEventListener('accounting-tx-updated', handler);
    return () => { try { window.removeEventListener('accounting-tx-updated', handler); } catch(_){} };
  }, [currentShift, currentUser]);

  // refresh daily summary when user or shift changes
  useEffect(() => {
    fetchDailySummary();
  }, [currentUser?.id, currentShift?.id]);

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }, []);

  const filteredToday = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reservations;
    return reservations.filter((r) => {
      return (
        (r.guest_name || '').toLowerCase().includes(term) ||
        (r.guest_phone || '').toLowerCase().includes(term) ||
        String(r.room_label || r.room_id || '').toLowerCase().includes(term)
      );
    });
  }, [reservations, search]);

  const arrivalsToday = useMemo(
    () =>
      filteredToday.filter(
        (r) =>
          r.check_in_date === date &&
          (r.status === 'pending' || r.status === 'confirmed')
      ),
    [filteredToday, date]
  );

  const departuresToday = useMemo(
    () =>
      filteredToday.filter(
        (r) => r.check_out_date === date && r.status === 'checked_in'
      ),
    [filteredToday, date]
  );

  const inhouse = useMemo(
    () => filteredToday.filter((r) => r.is_current && r.status === 'checked_in'),
    [filteredToday]
  );

  const upcoming3Days = useMemo(
    () => (upcoming || []).filter((r) => !r.is_past),
    [upcoming]
  );

  const statusBadge = (status) => {
    const map = {
      pending: { text: 'قيد الانتظار', cls: 'bg-yellow-100 text-yellow-800' },
      confirmed: { text: 'مؤكد', cls: 'bg-emerald-100 text-emerald-800' },
      checked_in: { text: 'تم الدخول', cls: 'bg-blue-100 text-blue-800' },
      checked_out: { text: 'تم الخروج', cls: 'bg-gray-100 text-gray-800' },
      cancelled: { text: 'ملغي', cls: 'bg-red-100 text-red-800' },
      no_show: { text: 'لم يحضر', cls: 'bg-orange-100 text-orange-800' },
    };
    const v = map[status] || {
      text: status || '-',
      cls: 'bg-slate-100 text-slate-700',
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${v.cls}`}
      >
        {v.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" dir="rtl">
        <Loader2 className="animate-spin w-6 h-6 text-blue-400 mx-2" />
        <div className="text-gray-500 text-sm">جاري تحميل لوحة تحكم الاستقبال...</div>
      </div>
    );
  }

  const handleOpenShift = async () => {
    if (!currentUser?.id) {
      alert('لا يمكن فتح وردية بدون مستخدم فعّال.');
      return;
    }
    if (currentShift?.status === 'open') {
      alert('هناك وردية مفتوحة بالفعل.');
      return;
    }
    try {
      // تأكد أنه لا توجد وردية مفتوحة حالياً لنفس المستخدم
      const { data: myOpen } = await supabase
        .from('reception_shifts')
        .select('id,status')
        .eq('staff_user_id', currentUser.id)
        .eq('status', 'open')
        .limit(1);
      if (myOpen && myOpen.length > 0) {
        alert('لا يمكن فتح وردية جديدة الآن، يوجد وردية قائمة لم تُغلق بعد. برجاء إغلاق الوردية الحالية أولًا ثم إعادة المحاولة.');
        return;
      }
      // استخدم RPC في قاعدة البيانات لعمل الفحص والإدراج في معاملة واحدة
      const { data: rpcData, error: rpcError } = await supabase.rpc('open_reception_shift_if_allowed', {
        p_shift_date: date,
        p_staff_user_id: currentUser.id,
      });
      if (rpcError) {
        const friendly = rpcError.message || rpcError.details || 'خطأ غير معروف';
        if (rpcError.code === 'P0001') {
          alert(friendly);
        } else {
          console.error('Supabase RPC error:', rpcError);
          alert('تعذر فتح الوردية: ' + friendly);
        }
        return;
      }
      const shift = Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] : null;
      setCurrentShift(shift);
      setReadOnly(!shift);
      setShiftStats({ cashIncome: 0, cashExpense: 0, net: 0 });
      // بعد فتح الوردية، تحقق من وجود handovers معلقة لهذه الوردية
      if (shift && shift.id) {
        try {
          // جلب handovers ذات to_shift_id = 0 والموجهة لهذا المستخدم عبر ملاحظة note
          const todayStr = new Date().toISOString().slice(0, 10);
          console.debug('open shift debug', { shift, currentUserId: currentUser?.id, todayStr });
          const { data: pendings } = await supabase
            .from('reception_shift_handovers')
            .select('*')
            .is('to_shift_id', null)
            .eq('to_staff_user_id', currentUser.id)
            .eq('status', 'pending');
          console.debug('pending handovers fetched on open:', pendings);
          if (pendings && pendings.length > 0) {
            // جلب معلومات الوردية المرسلة واسم الموظف المرسل
            const fromShiftIds = [...new Set(pendings.map(p => p.from_shift_id).filter(Boolean))];
            const { data: fromShifts } = await supabase.from('reception_shifts').select('id,staff_user_id').in('id', fromShiftIds);
            const senderIds = [...new Set((fromShifts || []).map(s => s.staff_user_id).filter(Boolean))];
            const { data: senders } = await supabase.from('staff_users').select('id,full_name').in('id', senderIds);
            const senderMap = {};
            (senders || []).forEach(s => { senderMap[s.id] = s.full_name; });
            const enhanced = (pendings || []).map(p => {
              const fs = (fromShifts || []).find(f => String(f.id) === String(p.from_shift_id));
              return {
                ...p,
                sender_id: fs?.staff_user_id || null,
                sender_name: senderMap[fs?.staff_user_id] || 'موظف غير معروف'
              };
            });
            const total = (enhanced || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
            setPendingReceipts(enhanced);
            setPendingTotal(total);
            setShowPendingReceiptModal(true);
          }
        } catch (e) {
          console.error('link pending handovers error', e);
        }
      }
      alert(shift ? 'تم فتح الوردية بنجاح' : 'تعذر فتح الوردية');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift || currentShift.status !== 'open') {
      alert('لا توجد وردية مفتوحة لإغلاقها');
      return;
    }
    // افتح مودال اختيار جهة التسليم (إجباري)
    try {
      // جلب قائمة موظفي الاستقبال والمدراء لملء القوائم
      const [{ data: staff }, { data: managers }] = await Promise.all([
        supabase.from('staff_users').select('id,full_name').eq('role', 'reception'),
        supabase.from('staff_users').select('id,full_name').eq('role', 'manager'),
      ]);
      setHandoverStaffList(staff || []);
      setHandoverManagers(managers || []);
      // افتراضيًا المبلغ = صافي الوردية الحالية
      setHandoverAmount(shiftStats.net || 0);
      setHandoverType('manager');
      setHandoverRecipientId((managers && managers[0] && managers[0].id) || null);
      setShowHandoverModal(true);
    } catch (e) {
      console.error('open handover modal error', e);
      alert('تعذّر تجهيز مودال التسليم: ' + (e.message || e));
    }
  };

  const submitHandoverAndClose = async () => {
    if (!currentShift) return;
    if (!(handoverAmount >= 0)) {
      alert('أدخل مبلغاً صحيحاً للتسليم.');
      return;
    }
    if (handoverType === 'manager' && !handoverRecipientId) {
      alert('اختر مديرًا لتسليم العهدة.');
      return;
    }
    if (handoverType === 'staff' && !handoverRecipientId) {
      alert('اختر الموظف المستلم للوردية التالية.');
      return;
    }
    setHandoverLoading(true);
    try {
      // اغلاق الوردية
      const { error: closeErr } = await supabase.from('reception_shifts').update({ status: 'closed', closed_at: new Date().toISOString(), closing_cash: handoverAmount, counted_cash: handoverAmount }).eq('id', currentShift.id);
      if (closeErr) throw closeErr;

      // تسجيل handover
      const payload = {
        from_shift_id: currentShift.id,
        amount: handoverAmount,
        tx_date: currentShift.shift_date,
        note: handoverType === 'staff' ? 'تسليم معلّق لموظف الورديه التالية' : 'تسليم نقدي للإدارة',
        created_by: currentUser?.id || null,
      };
      if (handoverType === 'manager') {
        payload.to_manager_id = handoverRecipientId;
      } else {
        // create pending by leaving to_shift_id NULL and set to_staff_user_id
        payload.to_shift_id = null;
        payload.to_staff_user_id = handoverRecipientId;
      }
      const { data: handData, error: handErr } = await supabase.from('reception_shift_handovers').insert(payload).select('*');
      if (handErr) throw handErr;
      console.debug('handover inserted:', handData);
      // إذا كانت التسليم للمدير، سجل الحالة كـ received_by_manager وسجّل المستلم
      if (handoverType === 'manager' && handData && handData[0]) {
        const hand = handData[0];
        try {
          await supabase.from('reception_shift_handovers').update({ status: 'received_by_manager', received_by: handoverRecipientId, received_at: new Date().toISOString() }).eq('id', hand.id);
          // سجل في ملاحظة الوردية المرسلة
          const { data: fromRows } = await supabase.from('reception_shifts').select('id,closing_note').eq('id', currentShift.id).limit(1);
          const fromRow = (fromRows && fromRows.length > 0) ? fromRows[0] : null;
          const { data: mgr } = await supabase.from('staff_users').select('full_name').eq('id', handoverRecipientId).limit(1);
          const mgrName = (mgr && mgr[0] && mgr[0].full_name) || 'المدير';
          const noteLine = `تم تسليم مبلغ ${handoverAmount} ج.م إلى المدير ${mgrName}`;
          const newNote = ((fromRow && fromRow.closing_note) ? (fromRow.closing_note + '\n' + noteLine) : noteLine);
          await supabase.from('reception_shifts').update({ closing_note: newNote }).eq('id', currentShift.id);
        } catch (e) {
          console.error('error marking handover received by manager', e);
        }
      }

      // تحديث الواجهة: جلب حالة الوردية بعد الإغلاق
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: shifts } = await supabase.from('reception_shifts').select('id,status,opening_cash,closing_cash,closed_at,staff_user_id').eq('staff_user_id', currentUser.id).eq('shift_date', todayStr).eq('status', 'closed').limit(1);
      const closedShift = (shifts && shifts.length > 0) ? shifts[0] : null;
      setCurrentShift(closedShift);
      setReadOnly(true);
      setShowHandoverModal(false);
      // إعادة حساب ملخص الوردية
      updateShiftStats(closedShift);
      alert('تم إغلاق الوردية وتسجيل التسليم بنجاح.');
    } catch (e) {
      console.error('submitHandover error', e);
      alert('تعذّر إغلاق الوردية/تسجيل التسليم: ' + (e.message || e));
    } finally {
      setHandoverLoading(false);
    }
  };

  const confirmPendingReceipts = async () => {
    if (!currentShift) return;
    setHandoverLoading(true);
    try {
      const toUpdate = pendingReceipts || [];
      let total = 0;
      for (const p of toUpdate) {
        total += Number(p.amount || 0);
        // ربط الحوالة بالوردية الجديدة وتعيين الحالة والمستلم
        await supabase.from('reception_shift_handovers').update({ to_shift_id: currentShift.id, to_staff_user_id: null, status: 'received_by_staff', received_by: currentUser.id, received_at: new Date().toISOString() }).eq('id', p.id);
        // تحديث سجل الوردية المرسلة لإضافة ملاحظة استلام مع اسم المستلم
        try {
          const { data: fromRows } = await supabase.from('reception_shifts').select('id,closing_note').eq('id', p.from_shift_id).limit(1);
          const fromRow = (fromRows && fromRows.length > 0) ? fromRows[0] : null;
          let receiverName = currentUser?.full_name || '';
          if (!receiverName) {
            const { data: me } = await supabase.from('staff_users').select('full_name').eq('id', currentUser.id).limit(1);
            receiverName = (me && me[0] && me[0].full_name) || receiverName;
          }
          const noteLine = `تم استلام مبلغ ${p.amount} ج.م بواسطة ${receiverName} بتاريخ ${new Date().toLocaleString('ar-EG')}`;
          const newNote = ((fromRow && fromRow.closing_note) ? (fromRow.closing_note + '\n' + noteLine) : noteLine);
          await supabase.from('reception_shifts').update({ closing_note: newNote }).eq('id', p.from_shift_id);
        } catch (e) {
          console.error('failed updating from shift note', e);
        }
        // ملاحظة: لا نعدل المبالغ في الوردية المرسلة هنا باستثناء تسجيل الاستلام في الحوالة
      }
      // إضافة الإجمالي إلى opening_cash للوردية الجديدة
      const { error: updErr } = await supabase.from('reception_shifts').update({ opening_cash: (currentShift.opening_cash || 0) + total }).eq('id', currentShift.id);
      if (updErr) throw updErr;
      // إعادة حساب، إغلاق المودال
      updateShiftStats({ ...currentShift, opening_cash: (currentShift.opening_cash || 0) + total });
      setShowPendingReceiptModal(false);
      setPendingReceipts([]);
      setPendingTotal(0);
      alert('تم تأكيد استلام المبالغ المرحّلة وإضافتها إلى عهدتك الحالية.');
    } catch (e) {
      console.error('confirmPendingReceipts error', e);
      alert('تعذّر تأكيد استلام الحوالات: ' + (e.message || e));
    } finally {
      setHandoverLoading(false);
    }
  };

  // حالة الوردية
  const shiftOpen = currentShift?.status === 'open';

  return (
    <div className="flex flex-col gap-8 p-6 bg-gray-50 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-blue-500" />
          <span className="text-xl font-bold text-gray-700">لوحة تحكم الاستقبال</span>
          <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">{todayLabel}</span>
        </div>
        <div className="flex gap-2">
          <button className="bg-yellow-400 text-white px-4 py-2 rounded shadow hover:bg-yellow-500 transition" title="نسخة احتياطية">
            <Info className="inline w-4 h-4 mr-1" /> نسخة احتياطية
          </button>
          <button className="bg-white border rounded p-2 shadow hover:bg-gray-100 transition" title="تنبيهات">
            <Bell className="w-5 h-5 text-blue-400" />
          </button>
          {/* زر حذف الورديات المغلقة يظهر فقط للمدير */}
          {currentUser?.role === 'manager' && (
            <button
              className="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700 transition"
              title="حذف جميع الورديات المغلقة لهذا اليوم"
              onClick={handleDeleteClosedShifts}
            >
              حذف الورديات المغلقة
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<LogIn className="w-6 h-6 text-green-500" />} label="وصول اليوم" value={arrivalsToday.length} color="border-green-400" />
        <KPICard icon={<LogOut className="w-6 h-6 text-red-500" />} label="مغادرة اليوم" value={departuresToday.length} color="border-red-400" />
        <KPICard icon={<Users className="w-6 h-6 text-blue-500" />} label="مقيمون" value={inhouse.length} color="border-blue-400" />
        <KPICard icon={<CalendarDays className="w-6 h-6 text-yellow-500" />} label="قادمة" value={upcoming3Days.length} color="border-yellow-400" />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <QuickAction
          icon={<BadgeDollarSign className="w-6 h-6" />}
          label="دفع"
          onClick={() => alert('الدفع يتطلب وردية مفتوحة')}
          disabled={!shiftOpen}
          tooltip={shiftOpen ? 'تنفيذ دفع' : 'يجب فتح وردية أولاً'}
        />
        <QuickAction
          icon={<MinusCircle className="w-6 h-6" />}
          label="مصروف"
          onClick={() => setShowExpense(true)}
          disabled={!shiftOpen}
          tooltip={shiftOpen ? 'تسجيل مصروف' : 'يجب فتح وردية أولاً'}
        />
        <QuickAction
          icon={<PlusCircle className="w-6 h-6" />}
          label="إضافة حجز"
          onClick={() => alert('إضافة حجز')}
          disabled={!shiftOpen}
          tooltip={shiftOpen ? 'إضافة حجز جديد' : 'يجب فتح وردية أولاً'}
        />
      </div>

      {/* Shift Summary */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-col md:flex-row md:items-center gap-4 border-t-4 border-blue-200">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-gray-700">ملخص الوردية الحالية</span>
            {shiftOpen ? (
              <span className="ml-2 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">مفتوحة</span>
            ) : (
              <span className="ml-2 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">مغلقة</span>
            )}
          </div>
          <div className="flex gap-4 text-sm text-gray-600">
            <div>الدخل النقدي: <span className="font-bold text-green-600">{shiftStats.cashIncome} ج.م</span></div>
            <div>المصروفات: <span className="font-bold text-red-600">{shiftStats.cashExpense} ج.م</span></div>
            <div>الصافي: <span className="font-bold text-blue-600">{shiftStats.net} ج.م</span></div>
          </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-700">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">إجمالي العهدة النقدية للوردية الحالية</div>
                <div className="font-bold text-lg">{(currentShift?.opening_cash || 0) + shiftStats.net} ج.م</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">ما تم تسليمه من هذه الوردية</div>
                <div className="font-bold text-lg">{deliveredThisShift} ج.م</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">ملخّص اليوم لهذا الموظف (صافي)</div>
                <div className="font-bold text-lg">{dailySummary.net} ج.م</div>
                <div className="text-xs text-gray-500">استلم اليوم: {dailySummary.received} ج.م — سلّم اليوم: {dailySummary.delivered} ج.م</div>
              </div>
            </div>
            {currentShift?.opening_note && (
              <div className="mt-2 text-sm text-gray-700">ملاحظة عند الفتح: <div className="text-sm font-medium">{currentShift.opening_note}</div></div>
            )}
            {currentShift?.closing_note && (
              <div className="mt-2 text-sm text-gray-700">سجل الوردية: <div className="text-sm font-medium whitespace-pre-line">{currentShift.closing_note}</div></div>
            )}
        </div>
        <div className="flex gap-2">
          {!shiftOpen && (
            <button
              onClick={handleOpenShift}
              className="bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-600 transition"
            >
              <LogIn className="inline w-4 h-4 ml-1" /> فتح وردية
            </button>
          )}
          {shiftOpen && (
            <button
              onClick={handleCloseShift}
              className="bg-red-500 text-white px-4 py-2 rounded shadow hover:bg-red-600 transition"
            >
              <LogOut className="inline w-4 h-4 ml-1" /> إغلاق وردية
            </button>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-gray-700 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            حجوزات اليوم
            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{filteredToday.length}</span>
          </div>
          <input
            className="border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
            placeholder="بحث بالاسم أو الغرفة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1">الضيف</th>
                <th className="px-2 py-1">الهاتف</th>
                <th className="px-2 py-1">الغرفة</th>
                <th className="px-2 py-1">الحالة</th>
                <th className="px-2 py-1">الدفع</th>
              </tr>
            </thead>
            <tbody>
              {filteredToday.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-4">لا توجد حجوزات اليوم</td>
                </tr>
              )}
              {filteredToday.map(r => (
                <tr key={r.id} className="hover:bg-blue-50 transition">
                  <td className="px-2 py-1">{r.guest_name}</td>
                  <td className="px-2 py-1">{r.guest_phone}</td>
                  <td className="px-2 py-1">{r.room_label}</td>
                  <td className="px-2 py-1">{statusBadge(r.status)}</td>
                  <td className="px-2 py-1">
                    <button
                      className="bg-blue-500 text-white rounded px-3 py-1 text-xs shadow hover:bg-blue-600 transition"
                      disabled={!shiftOpen}
                      title={shiftOpen ? 'دفع' : 'يجب فتح وردية'}
                      onClick={() => alert('الدفع يتطلب وردية مفتوحة')}
                    >
                      <BadgeDollarSign className="inline w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showManagerHandoverModal && managerHandoverData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6" dir="rtl">
            <h3 className="text-lg font-bold mb-2">ملخص تحصيل وتسليم الوردية</h3>
            <div className="mb-2 text-sm">اسم الموظف: <span className="font-bold">{managerHandoverData.staffName}</span></div>
            <div className="mb-2 text-sm">رقم الوردية: <span className="font-bold">{managerHandoverData.shiftId}</span></div>
            <div className="mb-2 text-sm">إجمالي التحصيل النقدي في الوردية: <span className="font-bold">{managerHandoverData.totalCashIncome} ج.م</span></div>
            <div className="mb-2 text-sm">إجمالي المصروفات النقدية: <span className="font-bold">{managerHandoverData.totalCashExpense} ج.م</span></div>
            <div className="mb-2 text-sm">صافي النقدية: <span className="font-bold">{managerHandoverData.netCash} ج.م</span></div>
            <div className="mb-2 text-sm">مبالغ مرحّلة من ورديات سابقة: <span className="font-bold">{managerHandoverData.handoverInTotal} ج.م</span></div>
            <div className="mb-2 text-sm">مبالغ مسلّمة من هذه الوردية: <span className="font-bold">{managerHandoverData.handoverOutTotal} ج.م</span></div>
            <div className="mb-2 text-sm">إجمالي المدفوعات الإلكترونية (للعلم فقط): <span className="font-bold">{managerHandoverData.totalEIncome} ج.م</span></div>
            <div className="mb-2 text-sm">المبلغ المطلوب تسليمه نقدًا: <span className="font-bold">{managerHandoverData.closingCash} ج.م</span></div>
            <div className="mb-4">
              <label className="block text-xs text-gray-600 mb-1">المبلغ الفعلي المستلم من الموظف</label>
              <input ref={managerHandoverAmountRef} className="w-full border rounded px-2 py-1" type="number" defaultValue={managerHandoverData.closingCash} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-200 px-3 py-1 rounded" onClick={() => setShowManagerHandoverModal(false)}>إلغاء</button>
              <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={async () => {
                const actual = Number(managerHandoverAmountRef.current.value);
                // تحديث الحوالة في DB
                await supabase.from('reception_shift_handovers').update({ status: 'received_by_manager', received_by: managerHandoverData.managerId, received_at: new Date().toISOString() }).eq('from_shift_id', managerHandoverData.shiftId).eq('to_manager_id', managerHandoverData.managerId);
                // تسجيل حركة محاسبية للخزنة
                await supabase.from('accounting_transactions').insert({
                  direction: 'expense',
                  amount: actual,
                  payment_method: 'cash',
                  tx_date: new Date().toISOString().slice(0, 10),
                  reception_shift_id: managerHandoverData.shiftId,
                  created_by: managerHandoverData.managerId,
                  note: `استلام نقدية من الموظف ${managerHandoverData.staffName} للوردية ${managerHandoverData.shiftId}`
                });
                setShowManagerHandoverModal(false);
                window.dispatchEvent(new Event('accounting-tx-updated'));
                alert('تم تأكيد استلام النقدية من الموظف بنجاح.');
              }}>تأكيد استلام النقدية</button>
            </div>
          </div>
        </div>
      )}
      {showExpense && (
        <AccountingExpenseModal onClose={() => setShowExpense(false)} />
      )}
      {showPendingReceiptModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6" dir="rtl">
            <h3 className="text-lg font-bold mb-2">تم ترحيل نقدية إليك</h3>
            <p className="text-sm text-gray-700 mb-3">تم ترحيل مبلغ إجمالي <span className="font-bold">{pendingTotal} ج.م</span> من ورديات سابقة إليك. المرجو التحقق من المبلغ واستلامه فعليًا.</p>
            <div className="mb-3 max-h-48 overflow-auto border rounded p-2">
              {(pendingReceipts || []).map(p => (
                <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                  <div>
                    <div className="text-sm">المبلغ: <span className="font-bold">{p.amount} ج.م</span></div>
                    <div className="text-xs text-gray-500">من موظف: <span className="font-medium">{p.sender_name}</span></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-200 px-3 py-1 rounded" onClick={() => setShowPendingReceiptModal(false)} disabled={handoverLoading}>إلغاء</button>
              <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={confirmPendingReceipts} disabled={handoverLoading}>{handoverLoading ? 'جاري...' : 'تأكيد استلام النقدية'}</button>
            </div>
          </div>
        </div>
      )}
      {showHandoverModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6" dir="rtl">
            <h3 className="text-lg font-bold mb-3">تسليم العهدة عند إغلاق الوردية</h3>
            <div className="mb-3 text-sm text-gray-700">اختر جهة استلام العهدة والمبلغ المطلوب تسجيله.</div>
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">النوع</label>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2"><input type="radio" name="handoverType" checked={handoverType==='manager'} onChange={() => setHandoverType('manager')} /> مدير</label>
                <label className="inline-flex items-center gap-2"><input type="radio" name="handoverType" checked={handoverType==='staff'} onChange={() => setHandoverType('staff')} /> لموظف الورديه التالية</label>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">المستلم</label>
              {handoverType === 'manager' ? (
                <select className="w-full border rounded px-2 py-1" value={handoverRecipientId || ''} onChange={e => setHandoverRecipientId(e.target.value)}>
                  <option value="">-- اختر مدير --</option>
                  {handoverManagers.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              ) : (
                <select className="w-full border rounded px-2 py-1" value={handoverRecipientId || ''} onChange={e => setHandoverRecipientId(e.target.value)}>
                  <option value="">-- اختر موظف الاستقبال --</option>
                  {handoverStaffList.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-600 mb-1">المبلغ</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={handoverAmount} onChange={e => setHandoverAmount(Number(e.target.value))} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-200 px-3 py-1 rounded" onClick={() => { setShowHandoverModal(false); }}>{handoverLoading ? '...' : 'إلغاء'}</button>
              <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={submitHandoverAndClose} disabled={handoverLoading}>{handoverLoading ? 'جاري...' : 'إغلاق وتسجيل التسليم'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
