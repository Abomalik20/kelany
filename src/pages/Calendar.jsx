import React, { useEffect, useMemo, useState, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { getReservationStatusColor, getReservationStatusLabelAr, ReservationStatus } from '../utils/status';
import { AuthContext } from '../App.jsx';

const daysOfWeek = (startDate) => {
  const days = [];
  const d = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const di = new Date(d);
    di.setDate(d.getDate() + i);
    days.push(di);
  }
  return days;
};


export default function Calendar({ selectedDate, onDateChange, searchQuery = '', refreshTick = 0 }) {
  const currentUser = useContext(AuthContext);
  const [rooms, setRooms] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  });
  const [drag, setDrag] = useState(null); // { res, startDate }
  const [showHelp, setShowHelp] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD for day details modal
  const [dragAction, setDragAction] = useState(null); // { type: 'extend'|'move', res, fromDay, targetRoom, targetDay, newEnd, newStart }
  const [moveMode, setMoveMode] = useState('full'); // 'full' or 'segment'
  const [segmentStart, setSegmentStart] = useState('');
  const [segmentEnd, setSegmentEnd] = useState('');

  const loadRooms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('rooms_overview').select('*').order('room_code');
      if (error) throw error;
      setRooms(data || []);
    } catch (e) {
      console.error('Calendar load failed', e);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (startDate, endDate) => {
    try {
      const { data, error } = await supabase.rpc('get_calendar_reservations', { p_start: startDate, p_end: endDate });
      if (error) throw error;
      setEvents(data || []);
    } catch (e) {
      console.error('Load calendar reservations failed', e);
      setEvents([]);
    }
  };

  useEffect(() => { loadRooms(); }, []);
  useEffect(() => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    loadEvents(start, end.toISOString().slice(0,10));
  }, [start]);

  // Sync with external selectedDate
  useEffect(() => {
    if (selectedDate && selectedDate !== start) {
      setStart(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // External refresh
  useEffect(() => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    loadRooms();
    loadEvents(start, end.toISOString().slice(0,10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const days = daysOfWeek(start);

  const dayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const dayStr = selectedDay;
    return (events || []).filter(e => dayStr >= e.start_date && dayStr < e.end_date)
      .sort((a,b) => {
        const ra = (a.room_label || '').localeCompare(b.room_label || '', 'ar');
        if (ra !== 0) return ra;
        return String(a.start_date || '').localeCompare(String(b.start_date || ''));
      });
  }, [selectedDay, events]);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return '';
    const d = new Date(selectedDay + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return selectedDay;
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [selectedDay]);

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">تقويم الحجوزات (أسبوع)</h2>
          <p className="text-sm text-gray-500">صُمّم ليسهّل على المبتدئ فهم الحالة والحركة</p>
          {showHelp && (
            <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 max-w-2xl">
              • اختر تاريخ بداية الأسبوع من المربع المجاور لعرض أسبوع كامل.<br />
              • مربعات ملوّنة تعني أيامًا محجوزة. اللون يوضّح الحالة (انظر الدليل أدناه).<br />
              • للتمديد: اسحب من مربع الحجز إلى يوم أبعد في نفس صف الغرفة.<br />
              • للنقل: اسحب من مربع الحجز إلى صف غرفة أخرى فارغة، وسيُنقل الحجز لنفس عدد الليالي.<br />
              • للتبديل: اسحب من مربع الحجز إلى صف غرفة أخرى مشغولة في نفس الفترة، وسيُعرض خيار لتبديل الغرف بين الحجزين.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input className="border rounded px-3 py-2" type="date" value={start} onChange={e=>{ setStart(e.target.value); onDateChange && onDateChange(e.target.value); }} />
          <button className="px-3 py-2 border rounded text-sm" onClick={()=>setShowHelp(s=>!s)}>{showHelp?'إخفاء التعليمات':'إظهار التعليمات'}</button>
        </div>
      </div>

      {/* دليل الألوان */}
      <div className="mb-4 bg-white border rounded p-3 text-xs max-w-2xl">
        <div className="font-semibold mb-2">دليل الألوان</div>
        <div className="flex flex-wrap gap-3">
          {[
            {k:'pending', name:'قيد الانتظار'},
            {k:'confirmed', name:'مؤكد'},
            {k:'checked_in', name:'تم الدخول'},
            {k:'checked_out', name:'تم الخروج'},
            {k:'canceled', name:'ملغي'},
            {k:'empty', name:'فارغ'}
          ].map((it,i)=> (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: it.k==='empty' ? ReservationStatus.empty.color : getReservationStatusColor(it.k) }} />
              <span>{it.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto bg-white rounded shadow relative">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="bg-gray-50">
              <th className="border-b px-3 py-2 text-right w-40">الغرفة</th>
              {days.map((d,i)=> {
                const dayStr = d.toISOString().slice(0,10);
                const today = new Date();
                today.setHours(0,0,0,0);
                const isToday = dayStr === today.toISOString().slice(0,10);
                return (
                  <th
                    key={i}
                    className={`border-b px-3 py-2 text-center w-32 ${isToday ? 'bg-emerald-50' : ''}`}
                  >
                    <button
                      type="button"
                      className="w-full text-xs sm:text-sm hover:bg-emerald-100 rounded px-1 py-1"
                      onClick={()=>setSelectedDay(dayStr)}
                    >
                      {d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'numeric' })}
                      {isToday && <span className="ml-1 text-[10px] text-emerald-700">اليوم</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center">تحميل...</td></tr>
            ) : rooms
              .filter(r => {
                const term = (searchQuery || '').trim();
                if (!term) return true;
                const roomMatch = (r.room_code || r.room_label || '').toLowerCase().includes(term.toLowerCase());
                const evInRoom = events.some(e => e.room_id === r.id && ((e.guest_names || e.guest_name || '').toLowerCase().includes(term.toLowerCase())));
                return roomMatch || evInRoom;
              })
              .map(r => (
              <tr key={r.id}>
                <td className="border-t px-3 py-2">{r.room_code} – {r.room_type_name_ar}</td>
                {days.map((d,i)=> {
                  const dayStr = d.toISOString().slice(0,10);
                  let ev = events.find(e => e.room_id === r.id && dayStr >= e.start_date && dayStr < e.end_date);
                  const term = (searchQuery || '').trim().toLowerCase();
                  if (ev && term) {
                    const namesLower = (ev.guest_names || ev.guest_name || '').toLowerCase();
                    if (!(namesLower.includes(term))) {
                      ev = null;
                    }
                  }
                  const bg = ev ? getReservationStatusColor(ev.status) : ReservationStatus.empty.color;
                  const payerInfo = ev && ev.payer_type === 'agency' && ev.agency_name ? `\nشركة: ${ev.agency_name}` : '';
                  const title = ev
                    ? `${ev.room_label} | ${ev.guest_names || ev.guest_name}${payerInfo}\n${ev.start_date} → ${ev.end_date} • ${getReservationStatusLabelAr(ev.status)}`
                    : 'فارغ';
                  const names = ev ? ((ev.guest_names || ev.guest_name || '')) : '';
                  const parts = names ? names.split('،').map(s => s.trim()).filter(Boolean) : [];
                  const primaryName = parts.length > 0 ? parts[0] : '';
                  const extraCount = parts.length > 1 ? (parts.length - 1) : 0;
                  return (
                    <td
                      key={i}
                      className="border-t px-3 py-2 select-none"
                      onMouseDown={() => { if (ev) setDrag({ res: ev, startDate: dayStr }); }}
                      onMouseUp={async () => {
                        if (!drag || !drag.res) return;

                        // نفس الغرفة: فتح مودال لتأكيد تعديل تاريخ الخروج
                        if (drag.res.room_id === r.id) {
                          if (drag.startDate !== dayStr) {
                            setDragAction({
                              type: 'extend',
                              res: drag.res,
                              fromDay: drag.startDate,
                              newEnd: dayStr,
                            });
                          }
                          setDrag(null);
                          return;
                        }

                        // غرفة أخرى: إمّا تبديل بين حجزين أو فتح مودال لنقل/تقسيم الحجز
                        try {
                          const targetEv = (events || []).find(e =>
                            e.room_id === r.id && dayStr >= e.start_date && dayStr < e.end_date
                          );
                          const staffId = currentUser && currentUser.id ? currentUser.id : null;

                          if (targetEv && String(targetEv.id) !== String(drag.res.id)) {
                            const okSwap = window.confirm(
                              `الغرفة ${r.room_code || r.room_label} تحتوي على حجز آخر في هذه الفترة.\n` +
                              'هل تريد تبديل الغرف بين الحجزين مع الاحتفاظ بنفس التواريخ؟'
                            );
                            if (!okSwap) return;

                            const { error: swapError } = await supabase.rpc('swap_room_reservations', {
                              p_reservation_id1: drag.res.id,
                              p_reservation_id2: targetEv.id,
                              p_staff_user_id: staffId,
                            });
                            if (swapError) throw swapError;
                            const end = new Date(start); end.setDate(end.getDate() + 6);
                            await loadEvents(start, end.toISOString().slice(0,10));
                          } else {
                            // لا يوجد حجز في الغرفة المستهدفة: افتح مودال يخيّر بين نقل كامل الحجز أو جزء منه
                            const nights = (new Date(drag.res.end_date) - new Date(drag.res.start_date)) / (1000*60*60*24);
                            const newStart = dayStr;
                            const endDate = new Date(newStart);
                            endDate.setDate(endDate.getDate() + nights);
                            const newEnd = endDate.toISOString().slice(0,10);

                            setMoveMode('full');
                            setSegmentStart(drag.startDate);
                            const defaultSegEnd = new Date(drag.startDate);
                            defaultSegEnd.setDate(defaultSegEnd.getDate() + 1);
                            const segEndStr = defaultSegEnd.toISOString().slice(0,10);
                            setSegmentEnd(segEndStr);

                            setDragAction({
                              type: 'move',
                              res: drag.res,
                              fromDay: drag.startDate,
                              targetRoom: r,
                              targetDay: dayStr,
                              newStart,
                              newEnd,
                            });
                          }
                        } catch (e) {
                          console.error('Move failed', e);
                          alert('تعذّر نقل / تبديل الحجز: ' + (e.message || e));
                        } finally {
                          setDrag(null);
                        }
                      }}
                        onMouseLeave={() => { /* ignore */ }}
                    >
                      <div className="h-8 rounded flex items-center justify-center" style={{ backgroundColor: bg, cursor: ev ? 'grab' : 'default' }} title={title}>
                        {ev && (
                          <div className="bg-white/95 text-gray-800 text-[10px] px-2 py-[2px] rounded-sm shadow-sm border border-white/80 max-w-full flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="truncate" aria-label="الساكن الرئيسي">{primaryName}</span>
                              {extraCount > 0 && (
                                <span className="text-gray-500" aria-label="عدد الضيوف الإضافيين">+{extraCount}</span>
                              )}
                            </div>
                            {ev.payer_type === 'agency' && ev.agency_name && (
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="inline-flex items-center px-1.5 py-px rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[9px] font-semibold truncate max-w-full">
                                  <span className="mr-1">شركة</span>
                                  <span className="truncate">{ev.agency_name}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedDay && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center px-2 sm:px-4 py-6" dir="rtl">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
            <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-sm sm:text-base">ملخّص اليوم</h3>
                <div className="text-xs text-gray-600 mt-0.5">{selectedDayLabel}</div>
              </div>
              <button className="text-gray-500 hover:text-gray-700 text-sm" onClick={()=>setSelectedDay(null)}>إغلاق</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="text-sm text-gray-700">عدد الحجوزات في هذا اليوم: <span className="font-semibold">{dayEvents.length}</span></div>
              {dayEvents.length === 0 ? (
                <div className="text-sm text-gray-500">لا توجد حجوزات في هذا اليوم.</div>
              ) : (
                <div className="overflow-x-auto border rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="text-right">
                        <th className="px-3 py-2">الغرفة</th>
                        <th className="px-3 py-2">النزيل / الضيوف</th>
                        <th className="px-3 py-2">الفترة</th>
                        <th className="px-3 py-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayEvents.map(ev => (
                        <tr key={ev.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{ev.room_label}</td>
                          <td className="px-3 py-2 text-xs">
                            <div>{ev.guest_names || ev.guest_name}</div>
                            {ev.payer_type === 'agency' && ev.agency_name && (
                              <div className="text-[10px] text-emerald-700 mt-0.5">شركة: {ev.agency_name}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{ev.start_date} → {ev.end_date}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] text-white"
                              style={{ backgroundColor: getReservationStatusColor(ev.status) }}
                            >
                              {getReservationStatusLabelAr(ev.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {dragAction && dragAction.type === 'extend' && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-2 sm:px-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-bold text-sm sm:text-base">تأكيد تعديل تاريخ الخروج</h3>
              <button className="text-gray-500 hover:text-gray-700 text-sm" onClick={() => setDragAction(null)}>إلغاء</button>
            </div>
            <div className="p-4 text-sm space-y-2">
              <div>النزيل: <span className="font-semibold">{dragAction.res.guest_names || dragAction.res.guest_name}</span></div>
              <div>الغرفة: <span className="font-semibold">{dragAction.res.room_label}</span></div>
              <div>الفترة الحالية: <span className="font-semibold">{dragAction.res.start_date} → {dragAction.res.end_date}</span></div>
              <div>تاريخ الخروج الجديد المقترح: <span className="font-semibold">{dragAction.newEnd}</span></div>
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">سيتم التحقق من عدم وجود تعارض قبل حفظ التعديل.</div>
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 border rounded text-sm"
                onClick={() => setDragAction(null)}
              >إلغاء</button>
              <button
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                onClick={async () => {
                  try {
                    const staffId = currentUser && currentUser.id ? currentUser.id : null;
                    const { error } = await supabase.rpc('extend_reservation', {
                      p_reservation_id: dragAction.res.id,
                      p_new_check_out: dragAction.newEnd,
                      p_staff_user_id: staffId,
                    });
                    if (error) throw error;
                    const end = new Date(start); end.setDate(end.getDate() + 6);
                    await loadEvents(start, end.toISOString().slice(0,10));
                    setDragAction(null);
                  } catch (e) {
                    console.error('Confirm extend failed', e);
                    alert('تعذّر تعديل تاريخ الخروج: ' + (e.message || e));
                  }
                }}
              >تأكيد التعديل</button>
            </div>
          </div>
        </div>
      )}
      {dragAction && dragAction.type === 'move' && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-2 sm:px-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-bold text-sm sm:text-base">تأكيد نقل الحجز</h3>
              <button className="text-gray-500 hover:text-gray-700 text-sm" onClick={() => setDragAction(null)}>إلغاء</button>
            </div>
            <div className="p-4 text-sm space-y-2">
              <div>النزيل: <span className="font-semibold">{dragAction.res.guest_names || dragAction.res.guest_name}</span></div>
              <div>من الغرفة: <span className="font-semibold">{dragAction.res.room_label}</span></div>
              <div>إلى الغرفة: <span className="font-semibold">{dragAction.targetRoom.room_code || dragAction.targetRoom.room_label}</span></div>
              <div>الفترة الأصلية: <span className="font-semibold">{dragAction.res.start_date} → {dragAction.res.end_date}</span></div>
              <div className="mt-2">
                <div className="font-semibold mb-1">نوع النقل المطلوب:</div>
                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="moveMode"
                      value="full"
                      checked={moveMode === 'full'}
                      onChange={() => setMoveMode('full')}
                    />
                    <span>نقل كامل الإقامة إلى هذه الغرفة (يبدأ من اليوم المختار في التقويم).</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="moveMode"
                      value="segment"
                      checked={moveMode === 'segment'}
                      onChange={() => setMoveMode('segment')}
                    />
                    <span>
                      نقل جزء من الإقامة فقط (مثلاً يوم واحد أو أكثر) إلى هذه الغرفة.<br />
                      <span className="text-xs text-gray-500">يمكنك اختيار الفترة داخل الحجز الأصلي.</span>
                    </span>
                  </label>
                </div>
              </div>
              {moveMode === 'segment' && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block mb-1">بداية الجزء المراد نقله</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 w-full"
                      value={segmentStart}
                      min={dragAction.res.start_date}
                      max={dragAction.res.end_date}
                      onChange={e => setSegmentStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">نهاية الجزء المراد نقله</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 w-full"
                      value={segmentEnd}
                      min={segmentStart || dragAction.res.start_date}
                      max={dragAction.res.end_date}
                      onChange={e => setSegmentEnd(e.target.value)}
                    />
                    <div className="text-[11px] text-gray-500 mt-1">النهاية تُعتبر يوم الخروج (غير مُشمول في الإقامة)، أي الفترة [من، إلى).</div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 border rounded text-sm"
                onClick={() => setDragAction(null)}
              >إلغاء</button>
              <button
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                onClick={async () => {
                  try {
                    const staffId = currentUser && currentUser.id ? currentUser.id : null;
                    const res = dragAction.res;
                    if (moveMode === 'full') {
                      const { error } = await supabase.rpc('move_reservation', {
                        p_reservation_id: res.id,
                        p_new_room_id: dragAction.targetRoom.id,
                        p_new_check_in: dragAction.newStart,
                        p_new_check_out: dragAction.newEnd,
                      });
                      if (error) throw error;
                    } else {
                      if (!segmentStart || !segmentEnd) {
                        alert('برجاء اختيار بداية ونهاية الجزء المراد نقله.');
                        return;
                      }
                      const { error } = await supabase.rpc('split_and_move_reservation', {
                        p_reservation_id: res.id,
                        p_segment_start: segmentStart,
                        p_segment_end: segmentEnd,
                        p_target_room_id: dragAction.targetRoom.id,
                        p_staff_user_id: staffId,
                      });
                      if (error) throw error;
                    }
                    const end = new Date(start); end.setDate(end.getDate() + 6);
                    await loadEvents(start, end.toISOString().slice(0,10));
                    setDragAction(null);
                  } catch (e) {
                    console.error('Confirm move failed', e);
                    alert('تعذّر تنفيذ عملية النقل: ' + (e.message || e));
                  }
                }}
              >تأكيد النقل</button>
            </div>
          </div>
        </div>
      )}
        {!loading && rooms.length===0 && (
          <div className="mt-4 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded px-3 py-2">
            لا توجد غرف معروضة. أضف غرفًا أولًا من صفحة الغرف لعرض التقويم.
          </div>
        )}
    </div>
  );
}
