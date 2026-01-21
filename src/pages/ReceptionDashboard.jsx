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
  const [search, setSearch] = useState('');
  const [pendingTx, setPendingTx] = useState([]);
  const [showExpense, setShowExpense] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [shiftStats, setShiftStats] = useState({ cashIncome: 0, cashExpense: 0, net: 0 });
  const [autoShiftEnabled, setAutoShiftEnabled] = useState(false);
    const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // حجوزات اليوم + المقيمون حاليًا
        const { data: todayRows } = await supabase
          .from('reservations_overview')
          .select('*')
          .or(`check_in_date.eq.${date},check_out_date.eq.${date},is_current.eq.true`);

        setReservations(todayRows || []);

        // حجوزات قادمة خلال 3 أيام
        const todayObj = new Date(date);
        const in3 = new Date(todayObj);
        in3.setDate(in3.getDate() + 3);
        const fromStr = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate() + 1)
          .toISOString()
          .slice(0, 10);
        const toStr = in3.toISOString().slice(0, 10);

        const { data: upc } = await supabase
          .from('reservations_overview')
          .select('*')
          .gte('check_in_date', fromStr)
          .lte('check_in_date', toStr);

        setUpcoming(upc || []);

        // تحصيلات اليوم المعلّقة التي سجّلها الاستقبال (من المحاسبة)
        const { data: tx } = await supabase
          .from('accounting_transactions')
          .select('id,tx_date,amount,payment_method,reservation_id,description,status')
          .eq('status', 'pending')
          .eq('source_type', 'reservation')
          .eq('tx_date', date)
          .order('created_at', { ascending: false });
        setPendingTx(tx || []);

        // إعداد: هل فتح الوردية تلقائيًا مفعّل من لوحة المدير؟
        let autoEnabled = false;
        try {
          const { data: setting, error: settingError } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'auto_reception_shifts')
            .maybeSingle();
          if (settingError && settingError.code !== 'PGRST116') throw settingError;
          autoEnabled = !!(setting && setting.value && setting.value.enabled === true);
        } catch (e) {
          console.error('load auto shift setting error', e);
        }
        setAutoShiftEnabled(autoEnabled);

        // تحميل الوردية الحالية وأرقام التحصيل النقدي الخاصة بها
        let shift = null;
        let stats = { cashIncome: 0, cashExpense: 0, net: 0 };
        if (currentUser && currentUser.id) {
          const { data: shifts } = await supabase
            .from('reception_shifts')
            .select('*')
            .eq('staff_user_id', currentUser.id)
            .eq('shift_date', date)
            .in('status', ['open', 'closed'])
            .order('opened_at', { ascending: false });

          // ابحث عن أحدث وردية مفتوحة أولاً
          shift = (shifts || []).find((s) => s.status === 'open') || (shifts && shifts[0]) || null;

          // لو لم توجد وردية، والإعداد مفعّل، والمستخدم استقبال → افتح وردية تلقائيًا
          if (!shift && autoEnabled && currentUser.role === 'reception') {
            try {
              const now = new Date();
              const hour = now.getHours();
              let slotLabel = 'وردية';
              if (hour >= 8 && hour < 16) slotLabel = 'وردية صباحية (8 ص - 4 م)';
              else if (hour >= 16 && hour < 24) slotLabel = 'وردية مسائية (4 م - 12 ص)';
              else slotLabel = 'وردية ليلية (12 ص - 8 ص)';

              const payload = {
                shift_date: date,
                staff_user_id: currentUser.id,
                status: 'open',
                opening_note: `تم فتح الوردية تلقائيًا - ${slotLabel}`,
              };
              const { data: autoShift, error: autoError } = await supabase
                .from('reception_shifts')
                .insert(payload)
                .select('*')
                .single();
              if (autoError) throw autoError;
              shift = autoShift;
            } catch (e) {
              console.error('auto open reception shift error', e);
            }
          }

          if (shift && shift.id) {
            const { data: cashTx } = await supabase
              .from('accounting_transactions')
              .select('direction,amount')
              .eq('payment_method', 'cash')
              .eq('reception_shift_id', shift.id);

            let inc = 0;
            let exp = 0;
            (cashTx || []).forEach((row) => {
              const amt = Number(row.amount || 0);
              if (!amt) return;
              if (row.direction === 'income') inc += amt;
              else exp += amt;
            });
            stats = { cashIncome: inc, cashExpense: exp, net: inc - exp };
          }
        }

        setCurrentShift(shift);
        setShiftStats(stats);
          // تفعيل وضع القراءة فقط إذا لم توجد وردية مفتوحة للمستخدم الحالي (وليس مدير)
          if (!shift || shift.status !== 'open') {
            if (currentUser && currentUser.role === 'reception') setReadOnly(true);
            else setReadOnly(false);
          } else {
            setReadOnly(false);
          }
      } catch (e) {
        console.error('load reception dashboard error', e);
        setReservations([]);
        setUpcoming([]);
        setPendingTx([]);
        setCurrentShift(null);
        setShiftStats({ cashIncome: 0, cashExpense: 0, net: 0 });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [date, currentUser && currentUser.id]);

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

  const filteredToday = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    if (!term) return reservations;
    return (reservations || []).filter((r) => {
      const guest = (r.guest_name || '').toLowerCase();
      const phone = (r.guest_phone || '').toLowerCase();
      const room = (r.room_label || String(r.room_id || '')).toLowerCase();
      return guest.includes(term) || phone.includes(term) || room.includes(term);
    });
  }, [reservations, search]);

  const arrivalsToday = useMemo(
    () => filteredToday.filter((r) => r.check_in_date === date && (r.status === 'pending' || r.status === 'confirmed')),
    [filteredToday, date]
  );
  const departuresToday = useMemo(
    () => filteredToday.filter((r) => r.check_out_date === date && r.status === 'checked_in'),
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
    const v = map[status] || { text: status || '-', cls: 'bg-slate-100 text-slate-700' };
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${v.cls}`}>{v.text}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" dir="rtl">
        <div className="text-gray-500 text-sm">جاري تحميل لوحة تحكم الاستقبال...</div>
      </div>
    );
  }

  const handleOpenShift = async () => {
    if (!currentUser || !currentUser.id) {
      alert('لا يمكن فتح وردية بدون مستخدم فعّال.');
      return;
    }
    if (currentShift && currentShift.status === 'open') {
      alert('هناك وردية مفتوحة بالفعل لهذا المستخدم.');
      return;
    }
    try {
      // تحقق من وجود تسليم نقدية من وردية سابقة لهذا الموظف
      const { data: handovers } = await supabase
        .from('reception_shift_handovers')
        .select('id,from_shift_id,amount,created_by,note')
        .eq('to_shift_id', null)
        .eq('to_manager_id', null)
        .eq('created_by', currentUser.id);
      if (handovers && handovers.length > 0) {
        const total = handovers.reduce((sum, h) => sum + Number(h.amount || 0), 0);
        const msg = `هناك نقدية معلقة من وردية سابقة بقيمة ${total} جنيه.
يرجى مراجعة النقدية والتأكيد أن المبلغ كامل قبل فتح الوردية.`;
        const confirm = window.confirm(msg + '\nاضغط موافق إذا استلمت كامل النقدية.');
        if (!confirm) {
          alert('يرجى مراجعة النقدية مع الموظف السابق قبل فتح الوردية.');
          return;
        }
        // تحديث handover لربطها بالوردية الجديدة بعد الفتح
      }
      const payload = {
        shift_date: date,
        staff_user_id: currentUser.id,
        status: 'open',
      };
      const { data, error } = await supabase
        .from('reception_shifts')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      // إذا كان هناك handover، اربطها بالوردية الجديدة
      if (handovers && handovers.length > 0 && data && data.id) {
        for (const h of handovers) {
          await supabase
            .from('reception_shift_handovers')
            .update({ to_shift_id: data.id })
            .eq('id', h.id);
        }
      }
      setCurrentShift(data || null);
      setShiftStats({ cashIncome: 0, cashExpense: 0, net: 0 });
      alert('تم فتح وردية استقبال جديدة بنجاح.');
    } catch (e) {
      console.error('open shift error', e);
      alert('تعذّر فتح الوردية: ' + (e.message || e));
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift || currentShift.status !== 'open') {
      alert('لا توجد وردية مفتوحة يمكن إغلاقها.');
      return;
    }
    const input = window.prompt('أدخل إجمالي النقدية الفعلية في الخزنة لهذه الوردية (جنيه):', '');
    if (input === null) return;
    const normalized = String(input).replace(',', '.');
    const counted = Number(normalized || 0);
    if (!(counted >= 0)) {
      alert('من فضلك أدخل مبلغًا رقميًا صالحًا.');
      return;
    }

    try {
      const { data: cashTx, error: txError } = await supabase
        .from('accounting_transactions')
        .select('direction,amount')
        .eq('payment_method', 'cash')
        .eq('reception_shift_id', currentShift.id);
      if (txError) throw txError;

      let inc = 0;
      let exp = 0;
      (cashTx || []).forEach((row) => {
        const amt = Number(row.amount || 0);
        if (!amt) return;
        if (row.direction === 'income') inc += amt;
        else exp += amt;
      });
      const expected = inc - exp;
      const diff = counted - expected;

      const { data: updated, error: updError } = await supabase
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
      if (updError) throw updError;

      setCurrentShift(updated || null);
      setShiftStats({ cashIncome: inc, cashExpense: exp, net: expected });

      // بعد الإغلاق: تخيير الموظف لمن يسلم النقدية
      const choice = window.prompt(`تم إغلاق الوردية.
    لمن تريد تسليم النقدية؟
    اكتب 1: للإدارة
    اكتب 2: للوردية التالية`);
      if (!choice) return;
      if (String(choice).trim() === '1') {
        // تسليم للإدارة
        const amount = counted;
        try {
          const payload = {
            from_shift_id: updated.id,
            to_manager_id: currentUser.id,
            amount,
            tx_date: updated.shift_date,
            note: 'تسليم نقدي من وردية الاستقبال إلى الإدارة بعد الإغلاق',
            created_by: currentUser.id,
          };
          const { error } = await supabase.from('reception_shift_handovers').insert(payload);
          if (error) throw error;
          alert('تم تسجيل تسليم النقدية للإدارة بنجاح.');
        } catch (e) {
          alert('حدث خطأ أثناء تسجيل التسليم للإدارة: ' + (e.message || e));
        }
      } else if (String(choice).trim() === '2') {
        // تسليم للوردية التالية
        // جلب قائمة موظفي الاستقبال المتاحين
        try {
          const { data: staff } = await supabase
            .from('staff_users')
            .select('id,full_name,role')
            .eq('role', 'reception');
          if (!staff || staff.length === 0) {
            alert('لا يوجد موظفون استقبال متاحون لبدء وردية جديدة.');
            return;
          }
          const names = staff.map((s, i) => `${i+1}: ${s.full_name}`).join('\n');
          const staffChoice = window.prompt('اختر الموظف الذي سيتسلم النقدية للوردية التالية:\n' + names);
          const idx = Number(staffChoice) - 1;
          if (isNaN(idx) || idx < 0 || idx >= staff.length) {
            alert('اختيار غير صحيح. يجب اختيار موظف صحيح لتسليم النقدية. لم يتم إغلاق الوردية.');
            // إعادة فتح حالة الوردية (إلغاء الإغلاق)
            setCurrentShift(updated ? { ...updated, status: 'open' } : currentShift);
            return;
          }
          const amount = counted;
          // الحل: إرسال to_shift_id = 0 (قيمة مؤقتة غير null) حتى يتم الربط لاحقًا
          const payload = {
            from_shift_id: updated.id,
            to_shift_id: 0, // قيمة مؤقتة تحقق شرط check constraint
            amount,
            tx_date: updated.shift_date,
            note: `تسليم نقدية من وردية ${currentUser.full_name} إلى ${staff[idx].full_name} بعد الإغلاق`,
            created_by: currentUser.id,
          };
          const { error } = await supabase.from('reception_shift_handovers').insert(payload);
          if (error) throw error;
          alert(`تم تسجيل تسليم النقدية للموظف ${staff[idx].full_name} بنجاح. يجب عليه فتح وردية جديدة وتأكيد الاستلام.`);
        } catch (e) {
          alert('حدث خطأ أثناء تسجيل التسليم للوردية التالية: ' + (e.message || e));
        }
      } else {
        alert('تم إغلاق الوردية بدون تسجيل تسليم نقدية. يمكنك تسجيلها يدويًا لاحقًا.');
      }
    } catch (e) {
      console.error('close shift error', e);
      alert('تعذّر إغلاق الوردية: ' + (e.message || e));
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 bg-gray-50 min-h-screen" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="bg-yellow-400 text-white px-4 py-2 rounded">نسخة احتياطية</button>
          <button className="bg-white border rounded p-2" title="الإشعارات">
            <span role="img" aria-label="تنبيه">🔔</span>
          </button>
        </div>
        <div className="text-gray-600 text-sm">{todayLabel}</div>
      </div>

      {/* العنوان */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">لوحة تحكم الاستقبال</h1>
        <p className="text-sm text-gray-500">متابعة سريعة لوصول ومغادرة النزلاء وحجوزات الأيام القريبة، مع إمكانية تسجيل مصروفات تشغيلية بسيطة بدون تفاصيل محاسبية.</p>
      </div>

      {/* إجراءات سريعة للتنقل بين شاشات الاستقبال التشغيلية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          type="button"
          disabled={readOnly}
          style={readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          onClick={() => {
            if (readOnly) return;
            try {
              if (window.__hotelNavigate) {
                window.__hotelNavigate('checkin-out');
              } else {
                window.location.href = '/checkin-out';
              }
            } catch (_) {
              window.location.href = '/checkin-out';
            }
          }}
          className="flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-3 shadow-sm transition-colors"
        >
          <div className="text-right">
            <div className="text-xs text-blue-100 mb-0.5">تسجيل دخول / وصول</div>
            <div className="text-sm font-semibold">شاشة Check-in/Out</div>
          </div>
          <div className="text-2xl">🔑</div>
        </button>

        <button
          type="button"
          onClick={() => {
            try {
              if (window.__hotelNavigate) {
                window.__hotelNavigate('checkin-out');
              } else {
                window.location.href = '/checkin-out';
              }
            } catch (_) {
              window.location.href = '/checkin-out';
            }
          }}
          className="flex items-center justify-between bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-3 shadow-sm transition-colors"
        >
          <div className="text-right">
            <div className="text-xs text-emerald-100 mb-0.5">تسجيل خروج / إنهاء إقامة</div>
            <div className="text-sm font-semibold">مغادرة النزلاء</div>
          </div>
          <div className="text-2xl">📤</div>
        </button>

        <button
          type="button"
          onClick={() => {
            try {
              if (window.__hotelNavigate) {
                window.__hotelNavigate('reservations');
              } else {
                window.location.href = '/reservations';
              }
            } catch (_) {
              window.location.href = '/reservations';
            }
          }}
          className="flex items-center justify-between bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-4 py-3 shadow-sm transition-colors"
        >
          <div className="text-right">
            <div className="text-xs text-amber-100 mb-0.5">إدارة الحجوزات</div>
            <div className="text-sm font-semibold">كل الحجوزات الشاملة</div>
          </div>
          <div className="text-2xl">📅</div>
        </button>

        <button
          type="button"
          disabled={readOnly}
          style={readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          onClick={() => { if (!readOnly) setShowExpense(true); }}
          className="flex items-center justify-between bg-rose-500 hover:bg-rose-600 text-white rounded-lg px-4 py-3 shadow-sm transition-colors"
        >
          <div className="text-right">
            <div className="text-xs text-rose-100 mb-0.5">تسجيل مصروف تشغيلي</div>
            <div className="text-sm font-semibold">إضافة مصروف يومي</div>
          </div>
          <div className="text-2xl">📉</div>
        </button>
      </div>

      {/* كروت ملخص اليوم */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-blue-700 mb-1">وصول اليوم</div>
            <div className="text-2xl font-bold text-blue-900">{arrivalsToday.length}</div>
          </div>
          <div className="text-3xl">📥</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-700 mb-1">مغادرة اليوم</div>
            <div className="text-2xl font-bold text-emerald-900">{departuresToday.length}</div>
          </div>
          <div className="text-3xl">📤</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-purple-700 mb-1">نزلاء مقيمون حاليًا</div>
            <div className="text-2xl font-bold text-purple-900">{inhouse.length}</div>
          </div>
          <div className="text-3xl">🛏️</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-700 mb-1">حجوزات قادمة (٣ أيام)</div>
            <div className="text-2xl font-bold text-amber-900">{upcoming3Days.length}</div>
          </div>
          <div className="text-3xl">📅</div>
        </div>
      </div>

      {/* ملخص وردية الاستقبال الحالية */}
      <div className="bg-white rounded-lg border p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-gray-800 text-sm">وردية الاستقبال الحالية</div>
          <div className="text-[11px] text-gray-500">تتبع تحصيل النقدية داخل الوردية فقط</div>
        </div>
        {!currentShift ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>لا توجد وردية مفتوحة حاليًا لهذا المستخدم في هذا اليوم.</span>
            <button
              type="button"
              onClick={handleOpenShift}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              فتح وردية جديدة
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-xs text-gray-700">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                التاريخ: <span className="font-medium">{currentShift.shift_date}</span>
              </span>
              <span>
                الحالة:
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    currentShift.status === 'open'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {currentShift.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                </span>
                {currentShift.status === 'closed' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const { data, error } = await supabase
                        .from('reception_shifts')
                        .update({ status: 'open', closed_at: null })
                        .eq('id', currentShift.id)
                        .select('*')
                        .single();
                      if (!error && data) {
                        setCurrentShift(data);
                        alert('تمت إعادة فتح الوردية بنجاح.');
                      } else {
                        alert('تعذر إعادة فتح الوردية: ' + (error?.message || error));
                      }
                    }}
                    className="ml-2 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  >
                    إعادة فتح الوردية
                  </button>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <span>
                إجمالي تحصيل نقدي (إيرادات):{' '}
                <span className="font-semibold text-green-700">{shiftStats.cashIncome}</span>
              </span>
              <span>
                إجمالي مصروفات نقدية داخل الوردية:{' '}
                <span className="font-semibold text-rose-700">{shiftStats.cashExpense}</span>
              </span>
              </div>
            )}
            {currentShift.status === 'open' && (
              <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
                <span className="text-[11px] text-amber-700">
                  عند نهاية الوردية، أدخل المبلغ الفعلي الموجود في الخزنة لإغلاق الوردية وحساب الفروق.
                </span>
                <button
                  type="button"
                  onClick={handleCloseShift}
                  className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs"
                >
                  إغلاق الوردية
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* بحث عن حجز */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            className="border rounded pl-9 pr-3 py-2 w-full text-sm"
            placeholder="بحث بالنزيل أو رقم الغرفة"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* حجوزات اليوم */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-gray-800 text-sm">وصول اليوم</div>
            <span className="text-xs text-gray-400">{arrivalsToday.length} حجز</span>
          </div>
          {arrivalsToday.length === 0 ? (
            <div className="py-4 text-xs text-gray-400 text-center">لا توجد وصولات اليوم.</div>
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {arrivalsToday.map((r) => (
                <div key={r.id} className="border rounded-lg px-3 py-2 text-xs hover:bg-blue-50 transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold truncate">{r.guest_name || 'نزيل'}</div>
                    {statusBadge(r.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-600">
                    <span>غرفة: <span className="font-medium">{r.room_label || r.room_id}</span></span>
                    <span>الدخول: <span className="font-medium">{r.check_in_date}</span></span>
                    <span>الليالي: <span className="font-medium">{r.nights}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-gray-800 text-sm">النزلاء المقيمون حاليًا</div>
            <span className="text-xs text-gray-400">{inhouse.length} حجز</span>
          </div>
          {inhouse.length === 0 ? (
            <div className="py-4 text-xs text-gray-400 text-center">لا يوجد نزلاء مقيمون حاليًا.</div>
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {inhouse.map((r) => (
                <div key={r.id} className="border rounded-lg px-3 py-2 text-xs hover:bg-purple-50 transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold truncate">{r.guest_name || 'نزيل'}</div>
                    {statusBadge(r.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-600">
                    <span>غرفة: <span className="font-medium">{r.room_label || r.room_id}</span></span>
                    <span>الخروج: <span className="font-medium">{r.check_out_date}</span></span>
                    <span>المتبقي: <span className="font-medium text-red-700">{r.remaining_amount ?? 0}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-gray-800 text-sm">مغادرة اليوم</div>
            <span className="text-xs text-gray-400">{departuresToday.length} حجز</span>
          </div>
          {departuresToday.length === 0 ? (
            <div className="py-4 text-xs text-gray-400 text-center">لا توجد مغادرات اليوم.</div>
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {departuresToday.map((r) => (
                <div key={r.id} className="border rounded-lg px-3 py-2 text-xs hover:bg-emerald-50 transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold truncate">{r.guest_name || 'نزيل'}</div>
                    {statusBadge(r.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-600">
                    <span>غرفة: <span className="font-medium">{r.room_label || r.room_id}</span></span>
                    <span>الخروج: <span className="font-medium">{r.check_out_date}</span></span>
                    <span>المتبقي: <span className="font-medium text-red-700">{r.remaining_amount ?? 0}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* حجوزات قادمة */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-gray-800 text-sm">حجوزات قادمة خلال ٣ أيام</div>
          <span className="text-xs text-gray-400">{upcoming3Days.length} حجز</span>
        </div>
        {upcoming3Days.length === 0 ? (
          <div className="py-4 text-xs text-gray-400 text-center">لا توجد حجوزات قادمة في الأيام الثلاثة القادمة.</div>
        ) : (
          <div className="overflow-x-auto max-h-64">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-right text-gray-600">
                  <th className="px-3 py-2">النزيل</th>
                  <th className="px-3 py-2">الغرفة</th>
                  <th className="px-3 py-2">الدخول</th>
                  <th className="px-3 py-2">الليالي</th>
                  <th className="px-3 py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {upcoming3Days.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{r.guest_name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{r.room_label || r.room_id}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{r.check_in_date}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{r.nights}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* تحصيلات اليوم المعلّقة */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-gray-800 text-sm">تحصيلات اليوم (قيد الاعتماد)</div>
          <span className="text-xs text-gray-400">{pendingTx.length} عملية</span>
        </div>
        <div className="text-[11px] text-amber-700 mb-2">
          هذه الأرقام تشغيلية فقط. الاعتماد النهائي ورصيد الخزنة يتم من خلال الإدارة.
        </div>
        {pendingTx.length === 0 ? (
          <div className="py-4 text-xs text-gray-400 text-center">لا توجد تحصيلات معلّقة اليوم.</div>
        ) : (
          <div className="overflow-x-auto max-h-56">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-right text-gray-600">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">طريقة الدفع</th>
                  <th className="px-3 py-2">الوصف</th>
                </tr>
              </thead>
              <tbody>
                {pendingTx.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-700">{t.tx_date}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-800">{Number(t.amount || 0)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-700">
                      {t.payment_method === 'cash' && 'نقدي (خزنة)'}
                      {t.payment_method === 'bank' && 'حساب بنكي'}
                      {t.payment_method === 'instapay' && 'إنستاباي / بطاقة بنكية'}
                      {t.payment_method === 'other' && 'محفظة إلكترونية'}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[11px] text-gray-700 max-w-xs truncate" title={t.description || ''}>{t.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExpense && (
        <AccountingExpenseModal
          onClose={() => setShowExpense(false)}
          onDone={() => {
            setShowExpense(false);
          }}
        />
      )}
    </div>
  );
}
