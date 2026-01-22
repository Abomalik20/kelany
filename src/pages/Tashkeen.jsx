import React, { useEffect, useMemo, useState, useCallback, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { getRoomStatusColor, getRoomStatusLabelAr, getOccupancyColor } from '../utils/status';
import ReservationModal from '../components/ReservationModal';
import { AuthContext } from '../App.jsx';

function StatusStrip({ status }) {
  const color = getRoomStatusColor(status);
  return <div className="h-1" style={{ backgroundColor: color }} />;
}

function CleanBadge({ value }) {
  const map = {
    clean: { text: 'نظيفة', cls: 'bg-green-100 text-green-700' },
    in_cleaning: { text: 'جاري تنظيف', cls: 'bg-amber-100 text-amber-700' },
    needs_cleaning: { text: 'تحتاج نظافة', cls: 'bg-red-100 text-red-700' },
  };
  const v = map[value] || map.clean;
  return <span className={`text-xs px-2 py-1 rounded ${v.cls}`}>{v.text}</span>;
}

function RoomTile({ room, resv, date, onDropReservation }) {
  const capacity = Number(room.max_guests || room.capacity || 0);
  const [beds, setBeds] = useState([]);
  // TODO: قد نستخدم loadingBeds لاحقًا لمتابعة تحميل الأسرة
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [resGuests, setResGuests] = useState([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState([]);
  const [showDetails, setShowDetails] = useState(false);

  const occupiedBeds = useMemo(() => {
    if (!resv) return 0;
    const gc = Number(resv.guests_count || 0);
    return Math.max(0, Math.min(gc, capacity || 0));
  }, [resv, capacity]);

  const loadBeds = useCallback(async () => {
    try {
      setLoadingBeds(true);
      const { data, error } = await supabase.rpc('get_room_beds_status', { p_room_id: room.id, p_date: date });
      if (error) throw error;
      setBeds(data || []);
    } catch (e) {
      console.warn('get_room_beds_status failed, fallback to capacity squares', e?.message || e);
      setBeds([]);
    } finally {
      setLoadingBeds(false);
    }
  }, [room.id, date]);

  useEffect(() => { loadBeds(); }, [loadBeds]);

  const loadReservationGuests = useCallback(async () => {
    if (!resv || !resv.id) { setResGuests([]); return; }
    try {
      setLoadingGuests(true);
      const { data, error } = await supabase.rpc('list_reservation_guests', { p_reservation_id: resv.id });
      if (error) throw error;
      setResGuests(data || []);
    } catch (e) {
      console.warn('list_reservation_guests failed', e?.message || e);
      setResGuests([]);
    } finally {
      setLoadingGuests(false);
    }
  }, [resv]);

  useEffect(() => { loadReservationGuests(); }, [loadReservationGuests]);

  useEffect(() => {
    const term = (guestSearch || '').trim();
    if (!term) { setGuestResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('guests')
          .select('id, full_name, phone, email')
          .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(10);
        if (error) throw error;
        setGuestResults(data || []);
      } catch (e) {
        console.warn('guest search failed', e?.message || e);
        setGuestResults([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [guestSearch]);

  const assignMainGuestToBed = async (bed, explicitGuestId = null) => {
    try {
      if (!resv) return;
      const { error } = await supabase.rpc('assign_bed_for_reservation', {
        p_reservation_id: resv.id,
        p_room_bed_id: bed.bed_id,
        p_guest_id: explicitGuestId || selectedGuestId || resv.guest_id || null,
        p_start: resv.check_in_date,
        p_end: resv.check_out_date,
      });
      if (error) throw error;
      await loadBeds();
      await loadReservationGuests();
    } catch (e) {
      window.alert('تعذّر إسناد السرير: ' + (e.message || e));
    }
  };

  const unassignBed = async (assignmentId) => {
    try {
      const { error } = await supabase.rpc('unassign_bed', { p_assignment_id: assignmentId });
      if (error) throw error;
      await loadBeds();
      await loadReservationGuests();
    } catch (e) {
      window.alert('تعذّر إلغاء إسناد السرير: ' + (e.message || e));
    }
  };

  const addGuestToReservation = async (guestId) => {
    try {
      if (!resv || !resv.id || !guestId) return;
      const { error } = await supabase.rpc('add_reservation_guest', { p_reservation_id: resv.id, p_guest_id: guestId, p_role: 'additional' });
      if (error) throw error;
      setSelectedGuestId(guestId);
      setGuestSearch('');
      setGuestResults([]);
      await loadReservationGuests();
      await loadBeds();
      const empty = (beds || []).find(b => !b.assignment_id);
      if (empty) {
        await assignMainGuestToBed(empty, guestId);
      } else {
        window.alert('لا توجد أسِرّة فارغة في هذه الغرفة لهذا اليوم.');
      }
    } catch (e) {
      window.alert('تعذّر إضافة الضيف للحجز: ' + (e.message || e));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    try {
      const payload = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!payload || !payload.id) return;
      if (String(payload.room_id) === String(room.id)) return; // نفس الغرفة لا حاجة للنقل
      onDropReservation && onDropReservation(payload, room);
    } catch (_) {}
  };

  const Beds = () => {
    if (beds.length > 0) {
      return (
        <div className="flex flex-wrap gap-2" aria-label={`الأسِرّة`}>
          {beds.map(b => {
            const filled = !!b.assignment_id;
            return (
              <div
                key={b.bed_id}
                className={`px-2 py-1 rounded border text-xs flex items-center gap-2 ${filled ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'}`}
                style={{ borderColor: getOccupancyColor(filled ? 'occupied' : 'empty') }}
                title={filled ? `مشغول: ${b.guest_name || '—'}` : 'فارغ'}
              >
                <button className="underline" onClick={() => { if (!filled && resv) assignMainGuestToBed(b); }}>
                  {b.bed_code}
                </button>
                {filled && (
                  <>
                    <span>– {b.guest_name || 'مجهول'}</span>
                    <button className="ml-2 text-red-600 hover:text-red-700" title="إلغاء" onClick={() => unassignBed(b.assignment_id)}>إلغاء ✖</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    const items = [];
    for (let i = 0; i < (capacity || 0); i++) {
      const filled = i < occupiedBeds;
      items.push(
        <div key={i} className="w-5 h-3 rounded-sm border" style={{ backgroundColor: getOccupancyColor(filled ? 'occupied' : 'empty'), borderColor: getOccupancyColor(filled ? 'occupied' : 'empty') }} title={filled ? 'مشغول' : 'فارغ'} />
      );
    }
    return (
      <div className="flex flex-wrap gap-1" aria-label={`الأسِرّة: ${occupiedBeds}/${capacity}`}>
        {items}
      </div>
    );
  };

  const hasResv = !!resv;
  const statusLabel = getRoomStatusLabelAr(room.status);

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`rounded-md shadow-sm border overflow-hidden text-xs transition-colors duration-150 ${
        hasResv ? 'bg-white border-gray-200' : 'bg-emerald-50 border-emerald-100'
      }`}
      dir="rtl"
    >
      <StatusStrip status={room.status} />
      <div className="p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-gray-800 text-sm" title="الغرفة">{room.room_code || room.room_label}</div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500" title="النوع والحالة">
            <span className="truncate max-w-[80px]">{room.room_type_name_ar || room.room_type_name}</span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] text-white"
              style={{ backgroundColor: getRoomStatusColor(room.status) }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
            <div className="flex items-center justify_between mb-1 text-[11px] text-gray-600">
          <div className="truncate max-w-[55%]">{room.floor_name} – {room.building_name}</div>
          <CleanBadge value={room.cleanliness} />
        </div>
        <div className="mb-2">
          <Beds />
        </div>
        {resv ? (
          <div
            draggable
            onDragStart={(e)=>{
              e.dataTransfer.setData('application/json', JSON.stringify({
                id: resv.id,
                room_id: resv.room_id,
                check_in_date: resv.check_in_date,
                check_out_date: resv.check_out_date
              }));
            }}
            className="px-2 py-1 rounded text-[11px] bg-blue-50 border border-blue-200 text-blue-700 cursor-grab"
            title={`النزيل: ${resv.guest_name || '—'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{resv.guest_name || 'نزيل'}</span>
              <span className="text-[10px] text-gray-500">{occupiedBeds}/{capacity}</span>
            </div>
            {resv.payer_type === 'agency' && resv.agency_name && (
              <div className="mt-0.5" title={`شركة/جهة: ${resv.agency_name}`}>
                <span className="inline-flex max-w-full items-center px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-[9px] font-semibold truncate">
                  <span className="mr-1">شركة</span>
                  <span className="truncate">{resv.agency_name}</span>
                </span>
              </div>
            )}
            <div className="text-[10px] text-gray-500 mt-0.5">من {resv.check_in_date} إلى {resv.check_out_date}</div>
            <button
              type="button"
              className="mt-1 text-[11px] text-blue-600 hover:text-blue-700 underline"
              onClick={()=>setShowDetails(v=>!v)}
            >
              {showDetails ? 'إخفاء تفاصيل الضيوف' : 'إظهار تفاصيل الضيوف والأسِرّة'}
            </button>
            {/* Reservation guests panel (collapsible) */}
            {showDetails && (
              <div className="mt-1 p-1.5 bg-gray-50 border border-gray-200 rounded">
                <div className="text-[11px] font-semibold mb-1">ضيوف الحجز</div>
                {loadingGuests ? (
                  <div className="text-[11px] text-gray-500">جاري التحميل...</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {resGuests.length === 0 ? (
                      <span className="text-[11px] text-gray-500">لا يوجد ضيوف إضافيون.</span>
                    ) : resGuests.map(g => (
                      <label key={g.reservation_guest_id} className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${selectedGuestId===g.guest_id ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-gray-300 text-gray-700'}`}>
                        <input type="radio" name={`sel-${resv.id}`} className="mr-1" checked={selectedGuestId===g.guest_id} onChange={()=>setSelectedGuestId(g.guest_id)} />
                        {g.full_name}
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input value={guestSearch} onChange={(e)=>setGuestSearch(e.target.value)} className="border rounded px-2 py-0.5 text-[11px] flex-1" placeholder="بحث: الاسم/الهاتف/البريد" />
                  {guestResults.length > 0 && (
                    <div className="absolute mt-8 bg-white border rounded shadow p-2 text-[11px] max-h-36 overflow-auto z-10">
                      {guestResults.map(gr => (
                        <div key={gr.id} className="px-2 py-1 hover:bg-gray-100 cursor-pointer" onClick={()=>addGuestToReservation(gr.id)}>
                          {gr.full_name} <span className="text-gray-500">({gr.phone || gr.email || gr.id.slice(0,8)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-gray-500">اختر ضيفًا، ثم اضغط على سرير فارغ لإسناده.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400">لا يوجد حجز في هذا التاريخ</div>
        )}
      </div>
    </div>
  );
}

export default function Tashkeen({ selectedDate, onDateChange, searchQuery = '', refreshTick = 0 }) {
  const currentUser = useContext(AuthContext);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [rooms, setRooms] = useState([]);
  const [resvs, setResvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBuilding, setFilterBuilding] = useState('all');
  const [filterFloor, setFilterFloor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingResv, setEditingResv] = useState(null);

  const loadRooms = useCallback(async () => {
    // محاولة أولى: عرض rooms_overview إن وُجد
    try {
      const { data, error } = await supabase
        .from('rooms_overview')
        .select('id, room_code, room_label, status, cleanliness, max_guests, room_type_name_ar, room_type_name, building_id, building_name, floor_id, floor_name')
        .order('room_code');
      if (error) throw error;
      if (data && data.length > 0) {
        setRooms(data);
        return;
      }
    } catch (e) {
      console.warn('rooms_overview unavailable, falling back to base tables:', e?.message || e);
    }

    // بديل: الجداول الأساسية + عمليات إغناء عميلًا
    try {
      const [roomsRes, typesRes, buildingsRes, floorsRes] = await Promise.all([
        supabase.from('rooms').select('id, room_code, status, cleanliness, room_type_id, building_id, floor_id').order('room_code'),
        supabase.from('room_types_active').select('id, name, name_ar, max_guests').order('display_order'),
        supabase.from('buildings').select('id, name').order('name'),
        supabase.from('floors').select('id, name, floor_number, number, building_id').order('id'),
      ]);

      // لو فشل room_types_active جرّب room_types العادية
      let types = typesRes.data || [];
      if (typesRes.error || types.length === 0) {
        try {
          const alt = await supabase.from('room_types').select('id, name, name_ar, max_guests').order('id');
          if (!alt.error) types = alt.data || [];
        } catch (_) {}
      }

      const typeMap = new Map();
      types.forEach(t => typeMap.set(String(t.id), t));
      const bMap = new Map();
      (buildingsRes.data || []).forEach(b => bMap.set(String(b.id), b));
      const fMap = new Map();
      (floorsRes.data || []).forEach(f => fMap.set(String(f.id), f));

      const enriched = (roomsRes.data || []).map(r => {
        const t = typeMap.get(String(r.room_type_id));
        const b = bMap.get(String(r.building_id));
        const f = fMap.get(String(r.floor_id));
        const room_label = r.room_code || (r.id ? `غرفة #${String(r.id).slice(0,8)}` : 'غرفة');
        const building_name = b?.name || 'مبنى';
        const floor_name = f?.name || (f?.floor_number ? `الطابق ${f.floor_number}` : (f?.number ? `الطابق ${f.number}` : 'طابق'));
        return {
          id: r.id,
          room_code: r.room_code,
          room_label,
          status: r.status,
          cleanliness: r.cleanliness,
          max_guests: t?.max_guests || 0,
          room_type_name_ar: t?.name_ar,
          room_type_name: t?.name,
          building_id: r.building_id,
          building_name,
          floor_id: r.floor_id,
          floor_name,
        };
      });
      setRooms(enriched);
    } catch (e2) {
      console.error('Fallback loadRooms failed', e2);
      setRooms([]);
    }
  }, []);

  const loadResvsForDate = useCallback(async (d) => {
    try {
      // الحجز الذي يغطي اليوم d: check_in <= d AND check_out > d (يوم الخروج متاح لحجز جديد)
      const { data, error } = await supabase
        .from('reservations')
        .select('id, room_id, guest_id, guests_count, status, check_in_date, check_out_date, nightly_rate, total_amount, amount_paid, currency, payment_method, payer_type, agency_name, special_requests, notes, guests(full_name)')
        .in('status', ['pending','confirmed','checked_in'])
        .lte('check_in_date', d)
        .gt('check_out_date', d);
      if (error) throw error;
      const mapped = (data || []).map(r => ({
        id: r.id,
        room_id: r.room_id,
        guest_id: r.guest_id,
        guests_count: r.guests_count,
        status: r.status,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        nightly_rate: r.nightly_rate,
        total_amount: r.total_amount,
        amount_paid: r.amount_paid,
        currency: r.currency,
        payment_method: r.payment_method,
        payer_type: r.payer_type,
        agency_name: r.agency_name,
        special_requests: r.special_requests,
        notes: r.notes,
        guest_name: (r.guests && r.guests.full_name) ? r.guests.full_name : undefined,
      }));
      setResvs(mapped);
    } catch (e) {
      console.error('loadResvsForDate failed', e);
      setResvs([]);
    }
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRooms(), loadResvsForDate(date)]);
    setLoading(false);
  }, [date, loadRooms, loadResvsForDate]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  // Sync external date
  useEffect(() => {
    if (selectedDate && selectedDate !== date) {
      setDate(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // External refresh
  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  useEffect(() => {
    const ch = supabase.channel('tashkeen-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => { loadResvsForDate(date); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => { loadRooms(); })
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch(_) {} };
  }, [date, loadRooms, loadResvsForDate]);

  const resvByRoom = useMemo(() => {
    const m = new Map();
    resvs.forEach(r => { m.set(String(r.room_id), r); });
    return m;
  }, [resvs]);

  const filteredRooms = useMemo(() => {
    let base = rooms;

    // فلاتر المبنى / الدور / حالة الغرفة
    if (filterBuilding !== 'all') {
      base = base.filter(r => String(r.building_id || r.building_name || '') === filterBuilding);
    }
    if (filterFloor !== 'all') {
      base = base.filter(r => String(r.floor_id || r.floor_name || '') === filterFloor);
    }
    if (filterStatus !== 'all') {
      base = base.filter(r => String(r.status || '').toLowerCase() === filterStatus);
    }

    const term = (searchQuery || '').trim().toLowerCase();
    if (!term) return base;
    const resvByRoomLocal = new Map();
    resvs.forEach(r => { resvByRoomLocal.set(String(r.room_id), r); });
    return base.filter(r => {
      const roomMatch = (r.room_code || r.room_label || '').toLowerCase().includes(term);
      const rv = resvByRoomLocal.get(String(r.id));
      const guestMatch = rv ? ((rv.guest_name || '').toLowerCase().includes(term)) : false;
      return roomMatch || guestMatch;
    });
  }, [rooms, resvs, searchQuery, filterBuilding, filterFloor, filterStatus]);

  const buildingOptions = useMemo(() => {
    const m = new Map();
    rooms.forEach(r => {
      const key = String(r.building_id || r.building_name || '');
      if (!key) return;
      if (!m.has(key)) m.set(key, r.building_name || 'مبنى');
    });
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [rooms]);

  const floorOptions = useMemo(() => {
    const m = new Map();
    rooms.forEach(r => {
      const key = String(r.floor_id || r.floor_name || '');
      if (!key) return;
      if (!m.has(key)) m.set(key, r.floor_name || 'طابق');
    });
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [rooms]);

  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const roomsWithResv = new Set(resvs.map(r => String(r.room_id))).size;
    const totalBeds = rooms.reduce((sum, r) => sum + Number(r.max_guests || 0), 0);
    const occupiedBeds = resvs.reduce((sum, r) => sum + Number(r.guests_count || 0), 0);
    const emptyBeds = Math.max(0, totalBeds - occupiedBeds);
    return { totalRooms, roomsWithResv, totalBeds, occupiedBeds, emptyBeds };
  }, [rooms, resvs]);

  const handleOpenEdit = (roomId) => {
    const r = resvs.find(x => String(x.room_id) === String(roomId));
    if (!r) return;
    setEditingResv(r);
  };

  const handleOpenCreate = (room) => {
    if (!room) return;
    setEditingResv({
      id: null,
      guest_id: null,
      room_id: room.id,
      check_in_date: date,
      check_out_date: date,
      guests_count: 1,
      status: 'confirmed',
      nightly_rate: null,
      total_amount: null,
      amount_paid: 0,
      currency: 'EGP',
      payment_method: 'cash',
      payer_type: 'guest',
      agency_name: '',
      special_requests: '',
      notes: '',
      pending_guest_ids: [],
    });
  };

  const handleSaveFromModal = async (payload) => {
    try {
      if (!payload) return;
      // تحقق من وجود وردية نشطة للمستخدم الحالي
      const staffId = currentUser && currentUser.id ? currentUser.id : null;
      const { data: shiftData, error: shiftError } = await supabase
        .from('reception_shifts')
        .select('id')
        .eq('user_id', staffId)
        .eq('active', true)
        .single();
      if (shiftError || !shiftData || !shiftData.id) {
        window.alert('لا يمكنك تنفيذ أي عملية بدون وجود وردية نشطة. يرجى فتح وردية أولاً.');
        return;
      }

      const cleaned = { ...payload };
      const pendingExtras = Array.isArray(cleaned.pending_guest_ids) ? cleaned.pending_guest_ids : [];
      delete cleaned.pending_guest_ids;

      if (editingResv && editingResv.id) {
        const { error } = await supabase.from('reservations').update(cleaned).eq('id', editingResv.id);
        if (error) throw error;
        // إلحاق ضيوف إضافيين إن وُجدوا
        if (editingResv.id && pendingExtras.length > 0) {
          for (const gid of pendingExtras) {
            try { await supabase.rpc('add_reservation_guest', { p_reservation_id: editingResv.id, p_guest_id: gid, p_role: 'additional' }); } catch(_) {}
          }
        }
      } else {
        const { data, error } = await supabase.from('reservations').insert([cleaned]).select('id').single();
        if (error) throw error;
        const newId = data?.id;
        if (newId && pendingExtras.length > 0) {
          for (const gid of pendingExtras) {
            try { await supabase.rpc('add_reservation_guest', { p_reservation_id: newId, p_guest_id: gid, p_role: 'additional' }); } catch(_) {}
          }
        }
      }

      await loadResvsForDate(date);
      setEditingResv(null);
    } catch (e) {
      console.error('Failed to save reservation from Tashkeen', e);
      const msg = String(e?.message || e || '').toLowerCase();
      let userMsg = 'تعذّر حفظ الحجز.';
      if (msg.includes('overlapping reservation')) userMsg = 'تعذّر الحفظ: هناك تعارض في التواريخ مع حجز آخر لنفس الغرفة.';
      else if (msg.includes('check_out_date must be after check_in_date')) userMsg = 'تعذّر الحفظ: تاريخ الخروج يجب أن يكون بعد تاريخ الدخول.';
      else if (msg.includes('row-level security')) userMsg = 'تعذّر الحفظ: لا تملك الصلاحية لحفظ الحجز (RLS).';
      else if (msg.includes('not-null')) userMsg = 'تعذّر الحفظ: بعض الحقول المطلوبة غير مكتملة.';
      else if (msg.includes('invalid input syntax')) userMsg = 'تعذّر الحفظ: مشكلة في صيغة البيانات المدخلة.';
      window.alert(userMsg);
    }
  };

  const groups = useMemo(() => {
    // تجميع حسب المبنى ثم الطابق
    const byBuilding = new Map();
    filteredRooms.forEach(r => {
      const bKey = String(r.building_id || r.building_name || '—');
      const fKey = String(r.floor_id || r.floor_name || '—');
      if (!byBuilding.has(bKey)) byBuilding.set(bKey, { label: r.building_name || 'مبنى', floors: new Map() });
      const bObj = byBuilding.get(bKey);
      if (!bObj.floors.has(fKey)) bObj.floors.set(fKey, { label: r.floor_name || 'طابق', rooms: [] });
      bObj.floors.get(fKey).rooms.push(r);
    });
    // تحويل إلى مصفوفة قابلة للعرض
    return Array.from(byBuilding.values()).map(b => ({
      label: b.label,
      floors: Array.from(b.floors.values()).map(f => ({ label: f.label, rooms: f.rooms }))
    }));
  }, [filteredRooms]);

  const onDropReservation = async (payload, targetRoom) => {
    try {
      const targetRes = resvByRoom.get(String(targetRoom.id));
      const staffId = currentUser && currentUser.id ? currentUser.id : null;

      // إذا كانت الغرفة المستهدفة بها حجز آخر لنفس اليوم، اعرض خيار تبديل الغرف بين الحجزين
      if (targetRes && String(targetRes.id) !== String(payload.id)) {
        const okSwap = window.confirm(
          `الغرفة ${targetRoom.room_code || targetRoom.room_label} تحتوي على حجز آخر في هذا اليوم.\n` +
          'هل تريد تبديل الغرف بين الحجزين مع الاحتفاظ بنفس التواريخ؟'
        );
        if (!okSwap) return;

        const { error: swapError } = await supabase.rpc('swap_room_reservations', {
          p_reservation_id1: payload.id,
          p_reservation_id2: targetRes.id,
          p_staff_user_id: staffId,
        });
        if (swapError) throw swapError;
        await loadResvsForDate(date);
        window.alert('تم تبديل الغرف بين الحجوزات بنجاح.');
        return;
      }

      // في حالة عدم وجود حجز في الغرفة المستهدفة: نقل عادي لنفس التواريخ
      const ok = window.confirm(`نقل الحجز إلى ${targetRoom.room_code || targetRoom.room_label} لنفس التواريخ؟`);
      if (!ok) return;
      const { error } = await supabase.rpc('move_reservation', {
        p_reservation_id: payload.id,
        p_new_room_id: targetRoom.id,
        p_new_check_in: payload.check_in_date,
        p_new_check_out: payload.check_out_date,
      });
      if (error) throw error;
      await loadResvsForDate(date);
      window.alert('تم نقل الحجز بنجاح.');
    } catch (e) {
      console.error('move failed', e);
      window.alert('تعذّر نقل الحجز: ' + (e.message || e));
    }
  };

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <div className="mb-6 bg-white rounded-lg shadow border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 pt-4 pb-3">
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-1">التسكين (عرض إشغال الأسِرّة)</h2>
            <p className="text-sm text-gray-500">عرض بصري لسعة الغرف وعدد الأسِرّة المشغولة في التاريخ المحدد، مع إمكانية توزيع الضيوف على الأسِرّة بسهولة.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={date}
              onChange={(e)=>{ setDate(e.target.value); onDateChange && onDateChange(e.target.value); }}
              title="اختر التاريخ"
            />
            <button
              className="border rounded px-3 py-2 bg-white hover:bg-gray-50 text-sm"
              onClick={()=>{ const t = new Date().toISOString().slice(0,10); setDate(t); onDateChange && onDateChange(t); }}
            >
              اليوم
            </button>
          </div>
        </div>
        {/* شريط إحصائيات مختصر */}
        <div className="px-4 pb-3 border-t border-gray-100 bg-slate-50/80">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-xs md:text-sm text-gray-700 mt-3">
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex flex-col">
              <span className="text-[11px] text-gray-500">إجمالي الغرف</span>
              <span className="text-base font-semibold">{stats.totalRooms}</span>
            </div>
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex flex-col">
              <span className="text-[11px] text-gray-500">غرف بها حجز اليوم</span>
              <span className="text-base font-semibold">{stats.roomsWithResv}</span>
            </div>
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex flex-col">
              <span className="text-[11px] text-gray-500">إجمالي الأسِرّة</span>
              <span className="text-base font-semibold">{stats.totalBeds}</span>
            </div>
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex flex-col">
              <span className="text-[11px] text-gray-500">أسِرّة مشغولة</span>
              <span className="text-base font-semibold text-blue-700">{stats.occupiedBeds}</span>
            </div>
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex flex-col">
              <span className="text-[11px] text-gray-500">أسِرّة فارغة تقريبًا</span>
              <span className="text-base font-semibold text-emerald-700">{stats.emptyBeds}</span>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 border-t border-gray-100 bg-slate-50/60">
          {/* فلاتر سريعة */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-1">
              <span className="text-gray-600">المبنى:</span>
              <select
                className="border rounded px-2 py-1 text-xs sm:text-sm"
                value={filterBuilding}
                onChange={(e)=>{ setFilterBuilding(e.target.value); setFilterFloor('all'); }}
              >
                <option value="all">الكل</option>
                {buildingOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-600">الدور:</span>
              <select
                className="border rounded px-2 py-1 text-xs sm:text-sm"
                value={filterFloor}
                onChange={(e)=>setFilterFloor(e.target.value)}
              >
                <option value="all">الكل</option>
                {floorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-600">حالة الغرفة:</span>
              <select
                className="border rounded px-2 py-1 text-xs sm:text-sm"
                value={filterStatus}
                onChange={(e)=>setFilterStatus(e.target.value)}
              >
                <option value="all">الكل</option>
                <option value="available">متاحة</option>
                <option value="reserved">محجوزة</option>
                <option value="occupied">مشغولة</option>
                <option value="maintenance">صيانة</option>
              </select>
            </div>
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-xs sm:text-sm text-blue-800 leading-relaxed">
            <div>- اسحب بطاقة النزيل من غرفة إلى أخرى لنقل الحجز لنفس المدة.</div>
            <div>- كل مستطيل صغير يمثل سريرًا؛ الممتلئ يعني مشغول حسب عدد الضيوف في الحجز.</div>
            <div>- يمكنك تغيير التاريخ من الأعلى لمشاهدة إشغال يوم معيّن.</div>
            <div className="mt-2 text-[11px] sm:text-xs text-blue-900 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: getOccupancyColor('occupied') }}></span> <span>سرير مشغول</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: getOccupancyColor('empty') }}></span> <span>سرير فارغ</span></div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">جاري التحميل...</div>
      ) : groups.length === 0 ? (
        <div className="text-gray-500">لا توجد غرف.</div>
      ) : (
        <div className="space-y-8">
          {groups.map((b, bi) => (
            <div key={bi}>
              <div className="text-lg font-bold text-gray-800 mb-3">{b.label}</div>
              <div className="space-y-5">
                {b.floors.map((f, fi) => (
                  <div key={fi} className="border border-gray-200 rounded-lg bg-white/70">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                      <div className="text-sm font-semibold text-gray-700">{f.label}</div>
                      <div className="text-[11px] text-gray-500">عدد الغرف: {f.rooms.length}</div>
                    </div>
                    <div className="px-3 py-3">
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {f.rooms.map((room) => {
                          const hasResv = !!resvByRoom.get(String(room.id));
                          return (
                            <div key={room.id} className="relative group">
                              <RoomTile
                                room={room}
                                resv={resvByRoom.get(String(room.id))}
                                date={date}
                                onDropReservation={onDropReservation}
                              />
                              {hasResv ? (
                                <button
                                  type="button"
                                  className="absolute top-1 left-1 text-[10px] bg-white/90 border border-blue-300 text-blue-700 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={()=>handleOpenEdit(room.id)}
                                >
                                  تعديل الحجز
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="absolute top-1 left-1 text-[10px] bg-white/90 border border-emerald-300 text-emerald-700 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={()=>handleOpenCreate(room)}
                                >
                                  حجز جديد
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingResv && (
        <ReservationModal
          initialData={editingResv}
          onClose={()=>setEditingResv(null)}
          onSave={handleSaveFromModal}
          onAfterAction={async ()=>{ await loadResvsForDate(date); }}
        />
      )}
    </div>
  );
}
