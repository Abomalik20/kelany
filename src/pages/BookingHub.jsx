import React, { useState, useEffect, useRef } from 'react';
import Reservations from './Reservations';
import Tashkeen from './Tashkeen';
import Calendar from './Calendar';

export default function BookingHub() {
  const [tab, setTab] = useState('reservations');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0,10));
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const qTab = url.searchParams.get('tab');
      if (qTab && ['reservations','tashkeen','calendar'].includes(qTab)) {
        setTab(qTab);
      }
    } catch (_) {}
  }, []);

  const switchTab = (t) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
  };

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => switchTab(id)}
      className={`px-4 py-2 text-sm rounded-t ${tab===id ? 'bg-white text-gray-900 border border-b-0' : 'bg-[#1f2a48] text-white hover:bg-[#223459]'} `}
    >{label}</button>
  );

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      // Avoid triggering inside inputs/textareas
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (isTyping && !['t','r'].includes(k)) return;
      if (k === '1') { switchTab('reservations'); e.preventDefault(); }
      else if (k === '2') { switchTab('tashkeen'); e.preventDefault(); }
      else if (k === '3') { switchTab('calendar'); e.preventDefault(); }
      else if (k === 't') { setSelectedDate(new Date().toISOString().slice(0,10)); e.preventDefault(); }
      else if (k === 'r') { setRefreshTick(t=>t+1); e.preventDefault(); }
      else if (k === 'f') { try { searchRef.current?.focus(); } catch(_) {} e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="p-0" dir="rtl">
      <div className="sticky top-0 z-10 bg-[#15203a] border-b border-[#1f2a48]">
        <div className="px-6 pt-4">
          <h2 className="text-2xl font-bold text-white mb-2">الحجوزات الشاملة</h2>
        </div>
        <div className="px-6 flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            <TabButton id="reservations" label="الحجوزات" />
            <TabButton id="tashkeen" label="التسكين" />
            <TabButton id="calendar" label="التقويم" />
          </div>
          <div className="flex items-center gap-2 ml-auto my-2">
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={selectedDate}
              onChange={(e)=>setSelectedDate(e.target.value)}
              title="اختر التاريخ (Alt+T: اليوم)"
            />
            <button className="border rounded px-3 py-2 text-sm bg-white hover:bg-gray-50" title="اليوم (Alt+T)" onClick={()=>setSelectedDate(new Date().toISOString().slice(0,10))}>اليوم</button>
            <button className="border rounded px-3 py-2 text-sm bg-white hover:bg-gray-50" title="تحديث (Alt+R)" onClick={()=>setRefreshTick(t=>t+1)}>تحديث</button>
            <input
              ref={searchRef}
              type="text"
              className="border rounded px-3 py-2 text-sm w-56"
              placeholder="بحث: الاسم/الهاتف/الغرفة (Alt+F)"
              value={searchQuery}
              onChange={(e)=>setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="bg-white border rounded m-6 p-2">
        {tab === 'reservations' && (
          <div className="mt-2"><Reservations /></div>
        )}
        {tab === 'tashkeen' && (
          <div className="mt-2"><Tashkeen selectedDate={selectedDate} onDateChange={setSelectedDate} searchQuery={searchQuery} refreshTick={refreshTick} /></div>
        )}
        {tab === 'calendar' && (
          <div className="mt-2"><Calendar selectedDate={selectedDate} onDateChange={setSelectedDate} searchQuery={searchQuery} refreshTick={refreshTick} /></div>
        )}
      </div>
    </div>
  );
}
