import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState({
    total: 0,
    month: 0,
    week: 0,
    today: 0,
  });
  const [roomsStats, setRoomsStats] = useState({
    total: 0,
    available: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0,
    occupancyRate: 0,
  });
  const [general, setGeneral] = useState({
    guestsCount: 0,
    currentGuests: 0,
    totalReservations: 0,
  });
  const [topRoomType, setTopRoomType] = useState({ name: '-', count: 0 });
  const [latestReservations, setLatestReservations] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 6); // آخر 7 أيام
        const monthStartStr = monthStart.toISOString().slice(0, 10);
        const weekStartStr = weekStart.toISOString().slice(0, 10);

        // الإيرادات من جدول المحاسبة (إيرادات مؤكدة فقط، بدون تحويلات داخلية)
        let totalRevenue = 0;
        let monthRevenue = 0;
        let weekRevenue = 0;
        let todayRevenue = 0;
        try {
          const { data: tx, error: txError } = await supabase
            .from('accounting_transactions')
            .select('tx_date,amount')
            .eq('direction', 'income')
            .eq('status', 'confirmed')
            .neq('source_type', 'transfer');
          if (txError) throw txError;
          (tx || []).forEach((row) => {
            const amt = Number(row.amount || 0);
            if (!amt) return;
            const d = row.tx_date;
            totalRevenue += amt;
            if (d >= monthStartStr && d <= todayStr) monthRevenue += amt;
            if (d >= weekStartStr && d <= todayStr) weekRevenue += amt;
            if (d === todayStr) todayRevenue += amt;
          });
        } catch (e) {
          console.error('load revenue stats error', e);
        }
        setRevenue({ total: totalRevenue, month: monthRevenue, week: weekRevenue, today: todayRevenue });

        // إحصائيات الغرف من rooms_overview (مع فولبك لجدول rooms)
        let rooms = [];
        try {
          const { data, error } = await supabase
            .from('rooms_overview')
            .select('status,room_type_name_ar');
          if (error) throw error;
          rooms = data || [];
        } catch (e1) {
          console.warn('rooms_overview not available, fallback to rooms', e1?.message || e1);
          try {
            const { data, error } = await supabase
              .from('rooms')
              .select('status');
            if (error) throw error;
            rooms = data || [];
          } catch (e2) {
            console.error('fallback rooms load failed', e2);
            rooms = [];
          }
        }

        const totalRooms = rooms.length;
        const availableRooms = rooms.filter((r) => r.status === 'available' || r.status === 'متاحة').length;
        const reservedRooms = rooms.filter((r) => r.status === 'reserved' || r.status === 'محجوزة').length;
        const occupiedRooms = rooms.filter((r) => r.status === 'occupied' || r.status === 'مشغولة').length;
        const maintenanceRooms = rooms.filter((r) => r.status === 'maintenance' || r.status === 'صيانة').length;
        const occupancyRate = totalRooms && occupiedRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

        setRoomsStats({
          total: totalRooms,
          available: availableRooms,
          reserved: reservedRooms,
          occupied: occupiedRooms,
          maintenance: maintenanceRooms,
          occupancyRate,
        });

        // توزيع أنواع الغرف (أكثر نوع انتشارًا)
        const typeCounts = new Map();
        (rooms || []).forEach((r) => {
          const key = r.room_type_name_ar || 'غير محدد';
          typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
        });
        let bestType = { name: '-', count: 0 };
        typeCounts.forEach((count, name) => {
          if (count > bestType.count) bestType = { name, count };
        });
        setTopRoomType(bestType);

        // إحصائيات عامة: النزلاء، الحجوزات
        let guestsCount = 0;
        try {
          const { count } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true });
          guestsCount = count || 0;
        } catch (e) {
          console.error('load guests count error', e);
        }

        let totalReservations = 0;
        try {
          const { count } = await supabase
            .from('reservations')
            .select('*', { count: 'exact', head: true });
          totalReservations = count || 0;
        } catch (e) {
          console.error('load reservations count error', e);
        }

        let currentGuests = 0;
        try {
          const { data } = await supabase
            .from('reservations_overview')
            .select('id,is_current');
          currentGuests = (data || []).filter((r) => r.is_current).length;
        } catch (e) {
          console.error('load current guests error', e);
        }

        setGeneral({ guestsCount, currentGuests, totalReservations });

        // آخر الحجوزات
        try {
          const { data: latest } = await supabase
            .from('reservations_overview')
            .select('id,guest_name,room_label,check_in_date,total_amount')
            .order('check_in_date', { ascending: false })
            .limit(5);
          setLatestReservations(latest || []);
        } catch (e) {
          console.error('load latest reservations error', e);
          setLatestReservations([]);
        }
      } catch (e) {
        console.error('load reports dashboard error', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const todayLabel = (() => {
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
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" dir="rtl">
        <div className="text-gray-500 text-sm">جاري تحميل التقارير والإحصائيات...</div>
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold text-gray-800 mb-1 flex items-center gap-2 justify-end">
          <span className="text-2xl">📊</span>
          <span>التقارير والإحصائيات</span>
        </h1>
        <p className="text-sm text-gray-500">نظرة شاملة على أداء الفندق من حيث الإيرادات، حالة الغرف، والحجوزات.</p>
      </div>

      {/* صف كروت الإيرادات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">إجمالي الإيرادات</div>
            <div className="text-2xl">💎</div>
          </div>
          <div className="text-2xl font-bold">{revenue.total} جنيه</div>
        </div>
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">إيرادات الشهر</div>
            <div className="text-2xl">📅</div>
          </div>
          <div className="text-2xl font-bold">{revenue.month} جنيه</div>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 text-white shadow flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">إيرادات الأسبوع</div>
            <div className="text-2xl">📊</div>
          </div>
          <div className="text-2xl font-bold">{revenue.week} جنيه</div>
        </div>
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white shadow flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">إيرادات اليوم</div>
            <div className="text-2xl">🔥</div>
          </div>
          <div className="text-2xl font-bold">{revenue.today} جنيه</div>
        </div>
      </div>

      {/* صف كروت حالة الغرف */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-amber-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-amber-700 mb-1">غرف في الصيانة</div>
            <div className="text-2xl font-bold text-amber-900">{roomsStats.maintenance}</div>
          </div>
          <div className="text-3xl">🛠️</div>
        </div>
        <div className="bg-white border border-purple-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-purple-700 mb-1">غرف محجوزة</div>
            <div className="text-2xl font-bold text-purple-900">{roomsStats.reserved}</div>
          </div>
          <div className="text-3xl">📆</div>
        </div>
        <div className="bg-white border border-rose-100 rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-rose-700 mb-1">غرف مشغولة</div>
              <div className="text-2xl font-bold text-rose-900">{roomsStats.occupied}</div>
            </div>
            <div className="text-3xl">🔴</div>
          </div>
          <div className="text-[11px] text-rose-600 mt-1">نسبة الإشغال: {roomsStats.occupancyRate}% من {roomsStats.total} غرفة</div>
        </div>
        <div className="bg-white border border-emerald-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-emerald-700 mb-1">غرف متاحة</div>
            <div className="text-2xl font-bold text-emerald-900">{roomsStats.available}</div>
          </div>
          <div className="text-3xl">✅</div>
        </div>
      </div>

      {/* صف كروت الإحصاءات العامة */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">النزلاء المسجّلون في النظام</div>
            <div className="text-2xl font-bold text-gray-900">{general.guestsCount}</div>
          </div>
          <div className="text-3xl">👥</div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">النزلاء الحاليون (حجوزات نشطة)</div>
            <div className="text-2xl font-bold text-gray-900">{general.currentGuests}</div>
          </div>
          <div className="text-3xl">🛎️</div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">إجمالي الحجوزات</div>
            <div className="text-2xl font-bold text-gray-900">{general.totalReservations}</div>
          </div>
          <div className="text-3xl">📑</div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">إجمالي الغرف في النظام</div>
            <div className="text-2xl font-bold text-gray-900">{roomsStats.total}</div>
          </div>
          <div className="text-3xl">🏨</div>
        </div>
      </div>

      {/* كارت توزيع أنواع الغرف */}
      <div className="bg-white rounded-lg border p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">توزيع أنواع الغرف</h2>
          <p className="text-xs text-gray-500">أكثر نوع غرف متوفر حاليًا في الفندق.</p>
        </div>
        <div className="text-center md:text-right">
          <div className="text-sm text-gray-500 mb-1">النوع الأكثر انتشارًا</div>
          <div className="text-2xl font-bold text-blue-800">{topRoomType.name}</div>
          <div className="text-xs text-gray-500 mt-1">عدد الغرف: {topRoomType.count}</div>
        </div>
      </div>

      {/* جدول آخر الحجوزات */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-gray-800">آخر الحجوزات</div>
          <div className="text-xs text-gray-400">أحدث 5 حجوزات مسجّلة في النظام</div>
        </div>
        {latestReservations.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">لا توجد حجوزات مسجّلة لعرضها.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-right text-gray-600">
                  <th className="px-3 py-2">رقم الحجز</th>
                  <th className="px-3 py-2">النزيل</th>
                  <th className="px-3 py-2">الغرفة</th>
                  <th className="px-3 py-2">تاريخ الدخول</th>
                  <th className="px-3 py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {latestReservations.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{r.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{r.guest_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{r.room_label}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{r.check_in_date}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{r.total_amount ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* تذييل بسيط */}
      <div className="text-center text-[11px] text-gray-400 mt-4 pb-2">
        نظام إدارة فندق الكيلاني &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
