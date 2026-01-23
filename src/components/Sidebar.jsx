import React, { useState } from 'react';
import { DashboardIcon, BuildingIcon, OccupancyIcon, CardIcon, ScheduleIcon, UserIcon, SettingsIcon } from './Icons';
import { getRoleLabel } from '../constants/roles';
import { canAccessPage } from '../utils/permissions';

export default function Sidebar({ onNavigate, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('sidebar_collapsed') === '1';
    } catch (_) {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      } catch (_) {}
      return next;
    });
  };
  const nav = (page, e) => {
    if (onNavigate) {
      e.preventDefault && e.preventDefault();
      try { console.log('Sidebar nav ->', page); } catch (_) {}
      onNavigate(page);
      // تحديث العنوان فقط بدون إعادة تحميل الصفحة
      try { window.history.pushState({}, '', `/${page}`); } catch (_) {}
    }
  };

  return (
    <aside className={`bg-[#16213e] text-white ${collapsed ? 'w-16' : 'w-64'} h-screen flex flex-col justify-between shadow-xl relative transition-all duration-200 sticky top-0 z-50 flex-none`} dir="rtl">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="absolute -left-3 top-24 z-60 w-8 h-8 rounded-full bg-[#facc15] border border-[#92400e] flex items-center justify-center hover:bg-[#fde68a] shadow-lg"
        title={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
      >
        <svg
          className="w-4 h-4 text-[#111827]"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {collapsed ? (
            // سهم يشير للداخل (توسيع)
            <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            // سهم يشير للخارج (طي)
            <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>
      <div>
        <div className="p-6 text-2xl font-bold border-b border-[#1f2a48] flex items-center justify-between gap-2">
          <span className="truncate">فندق الكيلاني</span>
          {!collapsed && (
            <span className="text-xs font-normal mt-1 text-[#ffd700] whitespace-nowrap">نظام إدارة متكامل</span>
          )}
        </div>
        <nav className="mt-6 flex flex-col gap-2 px-2 text-base">
          {(!currentUser || canAccessPage(currentUser, 'dashboard')) && (
            <a
              href="/dashboard"
              onClick={(e)=>nav('dashboard', e)}
              className="py-2 px-3 rounded flex items-center gap-3 bg-[#1f2a48] text-[#ffd700]"
            >
              <DashboardIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>لوحة التحكم</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'reports') && (
            <a
              href="/reports"
              onClick={(e)=>nav('reports', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <CardIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>التقارير والإحصائيات</span>
            </a>
          )}
          {
            // Replace separate links with a single aggregated page link when user can access any of those sections
          }
          {currentUser && (canAccessPage(currentUser, 'buildings') || canAccessPage(currentUser, 'floors') || canAccessPage(currentUser, 'rooms') || canAccessPage(currentUser, 'room-types')) && (
            <a
              href="/aggregate"
              onClick={(e)=>nav('aggregate', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <BuildingIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>المجمّع</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'reservations') && (
            <a
              href="/reservations"
              onClick={(e)=>nav('reservations', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <ScheduleIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>الحجوزات الشاملة</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'housekeeping') && (
            <a
              href="/housekeeping"
              onClick={(e)=>nav('housekeeping', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <OccupancyIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>إدارة التنظيف</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'laundry') && (
            <a
              href="/laundry"
              onClick={(e)=>nav('laundry', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <CardIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>اللاندري / المخزون</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'accounting') && (
            <a
              href="/accounting"
              onClick={(e)=>nav('accounting', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <CardIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>المحاسبة الذكية</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'checkin-out') && (
            <a
              href="/checkin-out"
              onClick={(e)=>nav('checkin-out', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <OccupancyIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>تسجيل دخول/خروج</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'guests') && (
            <a
              href="/guests"
              onClick={(e)=>nav('guests', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <UserIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>النزلاء</span>
            </a>
          )}

          {currentUser && canAccessPage(currentUser, 'activity-log') && (
            <a
              href="/activity-log"
              onClick={(e)=>nav('activity-log', e)}
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <CardIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>سجل النشاطات</span>
            </a>
          )}

          {/* روابط مستقبلية مثل الغرف الفارغة / البطاقات الذكية يمكن تفعيلها لاحقًا */}
          {currentUser && canAccessPage(currentUser, 'users') && (
            <a
              href="/users"
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <UserIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>المستخدمون</span>
            </a>
          )}
          {currentUser && canAccessPage(currentUser, 'settings') && (
            <a
              href="/settings"
              className="py-2 px-3 rounded hover:bg-[#1f2a48] flex items-center gap-3"
            >
              <SettingsIcon className="w-5 h-5"/>
              <span className={`truncate ${collapsed ? 'hidden' : 'inline'}`}>إعدادات النظام</span>
            </a>
          )}
        </nav>
      </div>
      <div className={`p-4 border-t border-[#1f2a48] flex ${collapsed ? 'flex-col items-center gap-1' : 'flex-col gap-2'}`}>
        {!collapsed && (
          <div className="text-sm text-gray-100">
            {currentUser ? (
              <>
                <div className="font-semibold truncate">{currentUser.name}</div>
                <div className="text-xs text-gray-300">{getRoleLabel(currentUser.role)}</div>
              </>
            ) : (
              <span>مستخدم النظام</span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (onLogout) onLogout(); }}
          className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded text-sm w-full"
        >
          خروج
        </button>
      </div>
    </aside>
  );
}
