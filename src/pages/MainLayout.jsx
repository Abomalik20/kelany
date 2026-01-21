import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from './Dashboard';
import ReceptionDashboard from './ReceptionDashboard.jsx';
import Buildings from './Buildings';
import Floors from './Floors';
import RoomTypes from './RoomTypes';
import Rooms from './Rooms';
import Calendar from './Calendar';
import Tashkeen from './Tashkeen';
import Guests from './Guests';
import Reservations from './Reservations';
import BookingHub from './BookingHub';
import Users from './Users';
import ActivityLog from './ActivityLog';
import CheckInOut from './CheckInOut';
import Housekeeping from './Housekeeping';
import Laundry from './Laundry';
import Accounting from './Accounting.jsx';
import Reports from './Reports.jsx';
import Settings from './Settings.jsx';

export default function MainLayout({ currentUser, onLogout }) {
  const [page, setPage] = useState('dashboard');
  try { console.log('MainLayout mounted'); } catch(_) {}

  useEffect(() => {
    const normalize = (p) => (p || '').replace(/^\/+/, '').replace(/\/+$/, '').split('?')[0].split('#')[0];
    const rawPath = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/dashboard';
    const path = normalize(rawPath) || 'dashboard';
    if (path) setPage(path);
    const onPop = () => {
      try {
        const p = normalize(window.location.pathname) || 'dashboard';
        console.log('popstate ->', p);
        setPage(p);
      } catch (_) {}
    };
    try { window.addEventListener('popstate', onPop); } catch (_) {}
    return () => { try { window.removeEventListener('popstate', onPop); } catch (_) {} };
  }, []);

  const renderPage = () => {
    try { console.log('Render page:', page); } catch(_) {}
    switch (page) {
      case 'dashboard':
        if (currentUser && currentUser.role === 'reception') {
          return <ReceptionDashboard />;
        }
        return <Dashboard />;
      case 'buildings':
        return <Buildings />;
      case 'floors':
        return <Floors />;
      case 'room-types':
        return <RoomTypes />;
      case 'rooms':
        return <Rooms />;
      case 'schedules':
        return <Calendar />;
      case 'calendar':
        return <Calendar />;
      case 'tashkeen':
        return <Tashkeen />;
      case 'guests':
        return <Guests />;
      case 'reservations':
        return <BookingHub />;
      case 'checkin-out':
        return <CheckInOut />;
      case 'activity-log':
        return <ActivityLog />;
      case 'housekeeping':
        return <Housekeeping />;
      case 'laundry':
        return <Laundry />;
      case 'accounting':
        return <Accounting />;
      case 'reports':
        return <Reports />;
      case 'users':
        return <Users />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const handleNavigate = (p) => {
    try { console.log('handleNavigate ->', p); } catch(_) {}
    setPage(p);
  };

  // توحيد التنقل ليُستخدم من الشريط الجانبي ولوحة الاستقبال بدون إعادة تحميل
  useEffect(() => {
    try {
      window.__hotelNavigate = (p) => {
        try { console.log('__hotelNavigate ->', p); } catch (_) {}
        setPage(p);
        try { window.history.pushState({}, '', `/${p}`); } catch (_) {}
      };
    } catch (_) {}
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar onNavigate={handleNavigate} currentUser={currentUser} onLogout={onLogout} />
      <main className="flex-1 h-screen overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
