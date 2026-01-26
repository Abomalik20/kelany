import React, { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { canAccessPage } from '../utils/permissions';
import { getTodayStrLocal } from '../utils/checkShift';

function StatusBadge({ status }) {
  const map = {
    pending: { text: 'قيد الانتظار', cls: 'bg-yellow-100 text-yellow-800' },
    confirmed: { text: 'مؤكد', cls: 'bg-green-100 text-green-800' },
    checked_in: { text: 'تم الدخول', cls: 'bg-blue-100 text-blue-800' },
    checked_out: { text: 'تم الخروج', cls: 'bg-gray-100 text-gray-800' },
    cancelled: { text: 'ملغي', cls: 'bg-red-100 text-red-800' },
    no_show: { text: 'لم يحضر', cls: 'bg-orange-100 text-orange-800' },
  };
  const v = map[status] || { text: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${v.cls}`}>{v.text}</span>;
}

function CheckInOutCard({ res, type, onCheckIn, onCheckOut }) {
  const isArrival = type === 'arrival';
  const isDeparture = type === 'departure';
  const isInhouse = type === 'inhouse';

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-3 flex flex-col gap-2 text-sm" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{res.guest_name || 'نزيل غير محدد'}</div>
          <div className="text-xs text-gray-500 truncate">
            {res.guest_phone || ''}
            {res.guest_phone && res.guest_email ? ' • ' : ''}
            {res.guest_email || ''}
          </div>
        </div>
        <StatusBadge status={res.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:text-sm">
        <div><span className="text-gray-500">الغرفة:</span> <span className="font-medium">{res.room_label || res.room_id}</span></div>
        <div><span className="text-gray-500">نوع الغرفة:</span> <span className="font-medium">{res.room_type_name || '-'}</span></div>
        <div><span className="text-gray-500">الدخول المحجوز:</span> <span className="font-medium">{res.check_in_date}</span></div>
        <div><span className="text-gray-500">الخروج المحجوز:</span> <span className="font-medium">{res.check_out_date}</span></div>
        <div><span className="text-gray-500">عدد النزلاء:</span> <span className="font-medium">{res.guests_count || 0}</span></div>
        <div><span className="text-gray-500">المتبقي:</span> <span className="font-medium text-red-700">{res.remaining_amount ?? 0}</span></div>
      </div>
      {res.special_requests && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          طلبات خاصة: {res.special_requests}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {isArrival && (res.status === 'pending' || res.status === 'confirmed') && (
          <button
            type="button"
            className="px-3 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onCheckIn && onCheckIn(res)}
          >
            تسجيل دخول
          </button>
        )}
        {isDeparture && res.status === 'checked_in' && (
          <button
            type="button"
            className="px-3 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onCheckOut && onCheckOut(res)}
          >
            تسجيل خروج
          </button>
        )}
        {isInhouse && res.status === 'checked_in' && (
          <span className="text-xs text-gray-500">مقيم حالياً</span>
        )}
      </div>
    </div>
  );
}

export default function CheckInOut() {
  const currentUser = useContext(AuthContext);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [logRows, setLogRows] = useState([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('reservations_overview')
          .select('*')
          .or(`check_in_date.eq.${date},check_out_date.eq.${date},and(is_current.eq.true,status.eq.checked_in)`);
        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        console.error('Load check-in/out overview failed', e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [date]);

  useEffect(() => {
    const loadLog = async () => {
      setLogLoading(true);
      try {
        const dateObj = new Date(date);
        if (Number.isNaN(dateObj.getTime())) {
          setLogRows([]);
          return;
        }

        const start = new Date(dateObj);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const { data, error } = await supabase
          .from('staff_activity_overview')
          .select('*')
          .eq('entity_type', 'reservation')
          .eq('action', 'status_change')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString());

        if (error) throw error;

        const onlyCheckInOut = (data || []).filter((r) => {
          const newStatus = r?.metadata?.new?.status;
          return newStatus === 'checked_in' || newStatus === 'checked_out';
        });

        setLogRows(onlyCheckInOut);
      } catch (e) {
        console.error('Load check-in/out activity log failed', e);
        setLogRows([]);
      } finally {
        setLogLoading(false);
      }
    };

    loadLog();
  }, [date]);

  const filtered = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => {
      const guest = (r.guest_name || '').toLowerCase();
      const phone = (r.guest_phone || '').toLowerCase();
      const room = (r.room_label || String(r.room_id || '')).toLowerCase();
      return guest.includes(term) || phone.includes(term) || room.includes(term);
    });
  }, [rows, search]);

  const arrivals = useMemo(() => (
    filtered.filter(r => r.check_in_date === date && ['pending', 'confirmed'].includes(r.status))
  ), [filtered, date]);

  const inhouse = useMemo(() => (
    filtered.filter(r => r.is_current && r.status === 'checked_in')
  ), [filtered]);

  const departures = useMemo(() => (
    filtered.filter(r => r.check_out_date === date && r.status === 'checked_in')
  ), [filtered, date]);

  const handleCheckIn = async (res) => {
    try {
      const ok = window.confirm(`تأكيد تسجيل دخول النزيل ${res.guest_name || ''} إلى الغرفة ${res.room_label || res.room_id}؟`);
      if (!ok) return;
      const payload = { status: 'checked_in' };
      if (currentUser && currentUser.id) payload.updated_by = currentUser.id;
      const { error } = await supabase.from('reservations').update(payload).eq('id', res.id);
      if (error) throw error;
      // إعادة التحميل
      const { data, error: e2 } = await supabase
        .from('reservations_overview')
        .select('*')
        .or(`check_in_date.eq.${date},check_out_date.eq.${date},and(is_current.eq.true,status.eq.checked_in)`);
      if (!e2) setRows(data || []);
      window.alert('تم تسجيل الدخول بنجاح.');
    } catch (e) {
      console.error('Check-in failed', e);
      window.alert('تعذّر تسجيل الدخول للحجز: ' + (e.message || e));
    }
  };

  const handleCheckOut = async (res) => {
    try {
      const ok = window.confirm(`تأكيد تسجيل خروج النزيل ${res.guest_name || ''} من الغرفة ${res.room_label || res.room_id}؟`);
      if (!ok) return;
      const payload = { status: 'checked_out' };

      // خروج مبكر (قبل تاريخ المغادرة المحجوز) مع تحديث تاريخ المغادرة ليصبح اليوم وتسجيل الملاحظة
      const todayStr = getTodayStrLocal();
      const isEarlyCheckout = res.check_out_date && todayStr < String(res.check_out_date);

      if (isEarlyCheckout) {
        const choice = window.prompt(
          `تنبيه: هذا خروج مبكر قبل تاريخ المغادرة المحجوز (${res.check_out_date}).\n` +
          'اكتب 1: خروج مبكر مع استرداد\n' +
          'اكتب 2: خروج مبكر بدون استرداد\n' +
          'اترك الحقل فارغًا لإلغاء العملية.'
        );

        if (!choice) {
          window.alert('تم إلغاء تسجيل الخروج.');
          return;
        }

        const trimmed = String(choice).trim();
        let tag = '';
        if (trimmed === '1') {
          tag = '[خروج مبكر - مع استرداد]';
        } else if (trimmed === '2') {
          tag = '[خروج مبكر - بدون استرداد]';
        } else {
          window.alert('اختيار غير صحيح، تم إلغاء العملية.');
          return;
        }

        const prevNotes = (res.notes || '').trim();
        payload.notes = prevNotes ? `${prevNotes}\n${tag}` : tag;

        // حدث تاريخ المغادرة ليصبح اليوم لتفريغ الغرفة فورًا في نظام التوفّر
        try {
          await supabase.rpc('extend_reservation', {
            p_reservation_id: res.id,
            p_new_check_out: todayStr,
            p_staff_user_id: currentUser?.id || null,
          });
          // في حال نجاح الـ RPC ستُحدَّث القيم على الخادم
        } catch (e2) {
          console.warn('early checkout date adjust failed', e2);
          // كحل احتياطي، حدّث تاريخ المغادرة مباشرة لضمان تحرير الغرفة
          payload.check_out_date = todayStr;
        }
      }

      if (currentUser && currentUser.id) payload.updated_by = currentUser.id;
      const { error } = await supabase.from('reservations').update(payload).eq('id', res.id);
      if (error) throw error;
      const { data, error: e2 } = await supabase
        .from('reservations_overview')
        .select('*')
        .or(`check_in_date.eq.${date},check_out_date.eq.${date},and(is_current.eq.true,status.eq.checked_in)`);
      if (!e2) setRows(data || []);
      window.alert('تم تسجيل الخروج بنجاح.');
    } catch (e) {
      console.error('Check-out failed', e);
      window.alert('تعذّر تسجيل الخروج للحجز: ' + (e.message || e));
    }
  };

  if (!canAccessPage(currentUser, 'checkin-out')) {
    return (
      <div className="p-8" dir="rtl">
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          لا تملك صلاحية الوصول إلى صفحة تسجيل الدخول/الخروج. هذه الصفحة مخصصة للإدارة والاستقبال.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">تسجيل دخول/خروج النزلاء</h2>
          <p className="text-sm text-gray-500">شاشة استقبال مخصصة لوصول ومغادرة النزلاء مع ربط مباشر بالحجوزات.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className="border rounded px-3 py-2 bg-white hover:bg-gray-50 text-sm"
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
          >
            اليوم
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            className="border rounded pl-9 pr-3 py-2 w-full text-sm"
            placeholder="بحث بالاسم / الهاتف / الغرفة"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 flex flex-col">
          <span className="text-xs text-blue-700">وصول اليوم</span>
          <span className="text-2xl font-bold text-blue-700">{arrivals.length}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex flex-col">
          <span className="text-xs text-emerald-700">مقيمون الآن</span>
          <span className="text-2xl font-bold text-emerald-700">{inhouse.length}</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-3 flex flex-col">
          <span className="text-xs text-amber-700">مغادرون اليوم</span>
          <span className="text-2xl font-bold text-amber-700">{departures.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">...جاري التحميل</div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">وصول اليوم</h3>
              <span className="text-xs text-gray-500">الحجوزات المؤكدة / قيد الانتظار بتاريخ اليوم</span>
            </div>
            {arrivals.length === 0 ? (
              <div className="text-sm text-gray-500 bg-white rounded border border-dashed border-gray-200 p-4">لا توجد وصولات مجدولة لهذا اليوم.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {arrivals.map(r => (
                  <CheckInOutCard key={r.id} res={r} type="arrival" onCheckIn={handleCheckIn} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">مقيمون الآن</h3>
              <span className="text-xs text-gray-500">كل الحجوزات بحالة تم الدخول وحالية</span>
            </div>
            {inhouse.length === 0 ? (
              <div className="text-sm text-gray-500 bg-white rounded border border-dashed border-gray-200 p-4">لا يوجد نزلاء مقيمون حاليًا حسب التواريخ.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inhouse.map(r => (
                  <CheckInOutCard key={r.id} res={r} type="inhouse" />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">مغادرون اليوم</h3>
              <span className="text-xs text-gray-500">الحجوزات التي تاريخ خروجها اليوم</span>
            </div>
            {departures.length === 0 ? (
              <div className="text-sm text-gray-500 bg-white rounded border border-dashed border-gray-200 p-4">لا توجد مغادرات مجدولة لهذا اليوم.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {departures.map(r => (
                  <CheckInOutCard key={r.id} res={r} type="departure" onCheckOut={handleCheckOut} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">سجل الدخول والخروج لليوم</h3>
              <span className="text-xs text-gray-500">يعرض كل عمليات تغيير الحالة إلى تم الدخول / تم الخروج في هذا اليوم</span>
            </div>
            {logLoading ? (
              <div className="text-sm text-gray-500 bg-white rounded border border-dashed border-gray-200 p-4">...جاري تحميل سجل الدخول/الخروج</div>
            ) : logRows.length === 0 ? (
              <div className="text-sm text-gray-500 bg-white rounded border border-dashed border-gray-200 p-4">لا توجد عمليات تسجيل دخول/خروج مسجَّلة لهذا اليوم.</div>
            ) : (
              <div className="bg-white rounded border border-gray-200 overflow-hidden">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-gray-50 text-right">
                    <tr>
                      <th className="px-3 py-2">الوقت</th>
                      <th className="px-3 py-2">الموظف</th>
                      <th className="px-3 py-2">النوع</th>
                      <th className="px-3 py-2">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map((r) => {
                      const dt = r.created_at ? new Date(r.created_at) : null;
                      const timeStr = dt
                        ? dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : '';
                      const newStatus = r?.metadata?.new?.status;
                      const kind = newStatus === 'checked_in' ? 'تسجيل دخول' : 'تسجيل خروج';
                      return (
                        <tr key={r.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-1 whitespace-nowrap text-gray-600">{timeStr}</td>
                          <td className="px-3 py-1">
                            <div className="text-xs md:text-sm font-medium">{r.staff_name || 'غير محدد'}</div>
                            <div className="text-[10px] md:text-xs text-gray-500">{r.staff_username || ''}</div>
                          </td>
                          <td className="px-3 py-1 text-xs md:text-sm">{kind}</td>
                          <td className="px-3 py-1 text-xs md:text-sm max-w-xl whitespace-normal break-words">{r.details}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
