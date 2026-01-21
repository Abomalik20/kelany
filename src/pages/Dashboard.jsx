import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function Dashboard() {
  const [stats, setStats] = useState({
    visits: 0,
    reservations: 0,
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    guestBalance: 0,
    cashboxBalance: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    todayCheckins: 0,
    todayCheckouts: 0,
    currentVisits: 0,
    pendingPayments: 0,
    occupancyRate: 0,
    lastTransaction: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const { count: guestsCount } = await supabase.from('guests').select('*', { count: 'exact', head: true });
        const { count: reservationsCount } = await supabase.from('reservations').select('*', { count: 'exact', head: true });
        const { data: rooms, count: totalRoomsCount } = await supabase.from('rooms').select('*', { count: 'exact' });
        const availableRooms = rooms ? rooms.filter(r => r.status === 'متاحة').length : 0;
        const occupiedRooms = rooms ? rooms.filter(r => r.status === 'مشغولة').length : 0;
        const { data: guestPayments } = await supabase.from('financial_transactions').select('amount,transaction_type,created_at');
        const guestBalance = guestPayments ? guestPayments.filter(t => t.transaction_type === 'دفع').reduce((sum, t) => sum + Number(t.amount), 0) : 0;
        const cashboxBalance = guestPayments ? guestPayments.reduce((sum, t) => sum + Number(t.amount), 0) : 0;
        const totalRevenue = cashboxBalance;
        const today = new Date().toISOString().slice(0, 10);
        const todayRevenue = guestPayments ? guestPayments.filter(t => t.created_at && t.created_at.startsWith(today)).reduce((sum, t) => sum + Number(t.amount), 0) : 0;
        const { data: reservations } = await supabase.from('reservations').select('check_in_date,check_out_date,status');
        const todayCheckins = reservations ? reservations.filter(r => r.check_in_date === today).length : 0;
        const todayCheckouts = reservations ? reservations.filter(r => r.check_out_date === today).length : 0;
        const currentVisits = reservations ? reservations.filter(r => r.status === 'نشطة').length : 0;
        const pendingPayments = guestPayments ? guestPayments.filter(t => t.transaction_type === 'معلقة').length : 0;
        const occupancyRate = totalRoomsCount && occupiedRooms ? Math.round((occupiedRooms / totalRoomsCount) * 100) : 0;
        const { data: lastTrans } = await supabase.from('financial_transactions').select('*').order('created_at', { ascending: false }).limit(1);

        setStats({
          visits: guestsCount || 0,
          reservations: reservationsCount || 0,
          totalRooms: totalRoomsCount || 0,
          availableRooms,
          occupiedRooms,
          guestBalance,
          cashboxBalance,
          totalRevenue,
          todayRevenue,
          todayCheckins,
          todayCheckouts,
          currentVisits,
          pendingPayments,
          occupancyRate,
          lastTransaction: lastTrans && lastTrans.length > 0 ? lastTrans[0] : null,
        });
      } catch (err) {
        console.error('fetchStats error', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-xl">جاري تحميل البيانات...</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 bg-gray-50 min-h-screen" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="bg-yellow-400 text-white px-4 py-2 rounded">نسخة احتياطية</button>
          <button className="bg-white border rounded p-2"><span role="img" aria-label="تنبيه">🔔</span></button>
        </div>
        <div className="text-gray-600">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>

      {/* عنوان */}
      <h1 className="text-2xl font-bold text-gray-800">لوحة التحكم الذكية</h1>

      {/* إجراءات سريعة */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gradient-to-l from-blue-400 to-purple-400 rounded-lg p-4 text-white">
        <a href="/checkin" className="flex flex-col items-center gap-2 hover:scale-105 transition">
          <span className="text-2xl">🔑</span>
          <span>تسجيل دخول</span>
        </a>
        <a href="/reservation" className="flex flex-col items-center gap-2 hover:scale-105 transition">
          <span className="text-2xl">📅</span>
          <span>حجز جديد</span>
        </a>
        <a href="/guests" className="flex flex-col items-center gap-2 hover:scale-105 transition">
          <span className="text-2xl">👤</span>
          <span>إضافة نزيل</span>
        </a>
        <a href="/rooms" className="flex flex-col items-center gap-2 hover:scale-105 transition">
          <span className="text-2xl">🏨</span>
          <span>إضافة غرفة</span>
        </a>
      </div>

      {/* إحصائيات عامة */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 flex flex-col items-center shadow">
          <span className="text-2xl">👥</span>
          <div className="text-lg font-bold">{stats.visits}</div>
          <div className="text-gray-500">الزيارات</div>
        </div>
        <div className="bg-white rounded-lg p-4 flex flex-col items-center shadow">
          <span className="text-2xl">📅</span>
          <div className="text-lg font-bold">{stats.reservations}</div>
          <div className="text-gray-500">الحجوزات</div>
        </div>
        <div className="bg-white rounded-lg p-4 flex flex-col items-center shadow">
          <span className="text-2xl">🏢</span>
          <div className="text-lg font-bold">{stats.totalRooms}</div>
          <div className="text-gray-500">إجمالي الغرف</div>
        </div>
        <div className="bg-white rounded-lg p-4 flex flex-col items-center shadow">
          <span className="text-2xl text-green-500">✅</span>
          <div className="text-lg font-bold">{stats.availableRooms}</div>
          <div className="text-gray-500">الغرف المتاحة</div>
        </div>
        <div className="bg-white rounded-lg p-4 flex flex-col items-center shadow">
          <span className="text-2xl text-red-500">⛔</span>
          <div className="text-lg font-bold">{stats.occupiedRooms}</div>
          <div className="text-gray-500">الغرف المشغولة</div>
        </div>
      </div>

      {/* الإحصائيات المالية */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-yellow-100 rounded-lg p-4 flex flex-col items-center">
          <div className="text-lg font-bold text-yellow-700">{stats.guestBalance} جنيه</div>
          <div className="text-gray-600">رصيد النزلاء</div>
        </div>
        <div className="bg-yellow-200 rounded-lg p-4 flex flex-col items-center">
          <div className="text-lg font-bold text-yellow-800">{stats.cashboxBalance} جنيه</div>
          <div className="text-gray-600">رصيد الخزنة</div>
        </div>
        <div className="bg-blue-100 rounded-lg p-4 flex flex-col items-center">
          <div className="text-lg font-bold text-blue-700">{stats.totalRevenue} جنيه</div>
          <div className="text-gray-600">إجمالي الإيرادات</div>
        </div>
        <div className="bg-green-100 rounded-lg p-4 flex flex-col items-center">
          <div className="text-lg font-bold text-green-700">{stats.todayRevenue} جنيه</div>
          <div className="text-gray-600">إيرادات اليوم</div>
        </div>
      </div>

      {/* حركة اليوم وحالة الإشغال */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="font-bold mb-2">حركة اليوم</div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between"><span>تسجيل دخول اليوم</span><span>{stats.todayCheckins}</span></div>
            <div className="flex justify-between"><span>تسجيل خروج اليوم</span><span>{stats.todayCheckouts}</span></div>
            <div className="flex justify-between"><span>الزيارات الحالية</span><span>{stats.currentVisits}</span></div>
            <div className="flex justify-between"><span>مدفوعات معلقة</span><span>{stats.pendingPayments}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="font-bold mb-2">حالة الإشغال</div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-full bg-gray-200 rounded h-3">
              <div className="bg-blue-500 h-3 rounded" style={{width: `${stats.occupancyRate}%`}}></div>
            </div>
            <span className="text-sm">{stats.occupancyRate}%</span>
          </div>
          <div className="flex justify-between">
            <span>متاحة: {stats.availableRooms}</span>
            <span>مشغولة: {stats.occupiedRooms}</span>
          </div>
        </div>
      </div>

      {/* آخر المعاملات المالية */}
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="font-bold mb-2">آخر المعاملات المالية</div>
        {stats.lastTransaction ? (
          <div className="flex justify-between items-center">
            <span>{stats.lastTransaction.id} - {stats.lastTransaction.description}</span>
            <span className="text-green-700 font-bold">+{stats.lastTransaction.amount} جنيه</span>
            <span className="text-gray-500 text-sm">{stats.lastTransaction.created_at?.slice(0,10)}</span>
          </div>
        ) : (
          <div className="text-gray-400">لا توجد معاملات مالية</div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
