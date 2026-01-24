import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager } from '../utils/permissions';
import { ensureOpenShift } from '../utils/checkShift';

const statusOptions = [
  { value: 'pending', label: 'قيد الانتظار' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'checked_in', label: 'تم الدخول' },
  { value: 'checked_out', label: 'تم الخروج' },
  { value: 'cancelled', label: 'ملغي' },
  { value: 'no_show', label: 'لم يحضر' },
];

export default function ReservationModal({ initialData, onClose, onSave, onAfterAction, groupMode = false }) {
  const [saving, setSaving] = useState(false);
  const [guests, setGuests] = useState([]);
  const [guestFilter, setGuestFilter] = useState('all'); // today | current | upcoming | inactive | all
  const [mainGuestSearch, setMainGuestSearch] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [totalAuto, setTotalAuto] = useState(true);
  const [multiRooms, setMultiRooms] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [roomAllocation, setRoomAllocation] = useState({});
  const [roomTypeFilters, setRoomTypeFilters] = useState([]); // array of selected room_type_ids for group/company bookings
  const [guestsCountManual, setGuestsCountManual] = useState(false);

  const [form, setForm] = useState({
    guest_id: null,
    room_id: null,
    check_in_date: '',
    check_out_date: '',
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
    // pending extra guests to attach on save (used mainly for new reservations)
    pending_guest_ids: [],
  });

  const currentUser = useContext(AuthContext);
  const isManagerUser = isManager(currentUser);
  const systemNotePrefixes = ['[تعديل تواريخ إقامة]', '[تعديل إجمالي/سعر]', '[إلغاء مع استرداد كامل]', '[إلغاء مع استرداد جزئي]', '[إلغاء بدون استرداد]'];

  const maxGuestsForSelected = useMemo(() => {
    const r = rooms.find(x => String(x.id) === String(form.room_id));
    return r?.max_guests || null;
  }, [rooms, form.room_id]);

  const roomTypes = useMemo(() => {
    const map = new Map();
    (rooms || []).forEach(r => {
      if (!r.room_type_id) return;
      const key = String(r.room_type_id);
      const existing = map.get(key) || {
        id: r.room_type_id,
        name: r.room_type_name || 'غير محدد',
        count: 0,
      };
      existing.count += 1;
      if (!existing.name && r.room_type_name) existing.name = r.room_type_name;
      map.set(key, existing);
    });
    return Array.from(map.values());
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    if (!groupMode || !roomTypeFilters || roomTypeFilters.length === 0) return rooms;
    const set = new Set((roomTypeFilters || []).map(x => String(x)));
    return (rooms || []).filter(r => set.has(String(r.room_type_id)));
  }, [rooms, groupMode, roomTypeFilters]);

  useEffect(()=>{
    const loadGuests = async ()=>{
      try {
        const { data, error } = await supabase
          .from('guests_overview')
          .select('id, full_name, phone, national_id, email, created_at, has_current_stay, has_upcoming_reservation, is_inactive')
          .order('full_name');
        if (error) throw error;
        setGuests(data || []);
      } catch (e) {
        console.error('Failed loading guests for reservation modal', e);
        setGuests([]);
      }
    };
    loadGuests();
  }, []);

  // Ensure the selected guest remains visible when editing, even if inactive
  useEffect(() => {
    if (!initialData || !initialData.guest_id || guests.length === 0) return;
    const current = guests.find(g => String(g.id) === String(initialData.guest_id));
    if (!current) return;
    if ((guestFilter === 'today' || guestFilter === 'current' || guestFilter === 'upcoming') && current.is_inactive) {
      setGuestFilter('all');
    }
  }, [initialData, guests, guestFilter]);

  useEffect(()=>{
    if (initialData) {
      // ط normalize طرق الدفع القديمة (مثل card/transfer/bank) إلى القيم الموحدة المستخدمة في الواجهة
      let pm = initialData.payment_method ?? 'cash';
      if (pm === 'card' || pm === 'transfer' || pm === 'bank') pm = 'instapay';

      setForm({
        guest_id: initialData.guest_id,
        room_id: initialData.room_id,
        check_in_date: initialData.check_in_date,
        check_out_date: initialData.check_out_date,
        guests_count: initialData.guests_count ?? 1,
        status: initialData.status ?? 'confirmed',
        nightly_rate: initialData.nightly_rate ?? null,
        total_amount: initialData.total_amount ?? null,
        amount_paid: initialData.amount_paid ?? 0,
        currency: initialData.currency ?? 'EGP',
        payment_method: pm,
        payer_type: initialData.payer_type ?? 'guest',
        agency_name: initialData.agency_name ?? '',
        special_requests: initialData.special_requests ?? '',
        notes: initialData.notes ?? '',
        pending_guest_ids: [],
      });
      // if initialData represents a group edit, populate multiRooms and selectedRoomIds
      if (initialData.group_reservations && Array.isArray(initialData.group_reservations) && initialData.group_reservations.length > 0) {
        setMultiRooms(true);
        setSelectedRoomIds(initialData.group_reservations.map(gr => gr.room_id).filter(Boolean));
      } else {
        setMultiRooms(false);
        setSelectedRoomIds(initialData.room_id ? [initialData.room_id] : []);
      }
    }
  }, [initialData]);

  // في وضع حجز الشركات/المجموعات: نفترض تلقائياً أن الدافع هو جهة خارجية ونفعّل الحجز المتعدد
  useEffect(() => {
    if (groupMode && !initialData) {
      setMultiRooms(true);
      setForm(f => ({
        ...f,
        payer_type: 'agency',
      }));
    }
  }, [groupMode, initialData]);

  const nights = useMemo(()=>{
    if (!form.check_in_date || !form.check_out_date) return 0;
    const start = new Date(form.check_in_date);
    const end = new Date(form.check_out_date);
    const diff = (end - start) / (1000*60*60*24);
    return diff > 0 ? diff : 0;
  }, [form.check_in_date, form.check_out_date]);

  useEffect(()=>{
    // في الحجز العادي (غرفة واحدة): احسب الإجمالي من سعر الليلة وعدد الليالي
    if (!groupMode || !multiRooms) {
      if (totalAuto && form.nightly_rate != null && nights>0) {
        const total = Math.round(Number(form.nightly_rate) * nights * 100) / 100;
        setForm(f=>({ ...f, total_amount: total }));
      }
    }
  }, [form.nightly_rate, nights, totalAuto, groupMode, multiRooms]);

  const remaining = useMemo(()=>{
    const t = Number(form.total_amount||0);
    const p = Number(form.amount_paid||0);
    return Math.max(0, Math.round((t - p) * 100) / 100);
  }, [form.total_amount, form.amount_paid]);

  // إجمالي تقريبي لكل الغرف في حجز الشركات/المجموعات (لكل ليلة حسب نوع الغرفة)
  const groupTotalEstimate = useMemo(() => {
    if (!groupMode || !multiRooms) return null;
    if (!form.check_in_date || !form.check_out_date) return null;
    if (!selectedRoomIds || selectedRoomIds.length === 0) return null;
    const nightsLocal = nights;
    if (!nightsLocal || nightsLocal <= 0) return null;
    let sum = 0;
    const ids = selectedRoomIds.map(x => String(x));
    ids.forEach(idStr => {
      const r = rooms.find(rt => String(rt.id) === idStr);
      if (!r) return;
      const nightlyLocal = r.base_price != null ? Number(r.base_price) || 0 : (form.nightly_rate != null ? Number(form.nightly_rate) || 0 : 0);
      if (!nightlyLocal) return;
      sum += nightlyLocal * nightsLocal;
    });
    return Math.round(sum * 100) / 100;
  }, [groupMode, multiRooms, selectedRoomIds, rooms, nights, form.check_in_date, form.check_out_date, form.nightly_rate]);

  // في حجز الشركات/المجموعات: اجعل الإجمالي في النموذج يطابق التجميعي لكل الغرف تلقائياً
  useEffect(() => {
    if (groupMode && multiRooms && totalAuto && groupTotalEstimate != null) {
      setForm(f => ({
        ...f,
        total_amount: groupTotalEstimate,
      }));
    }
  }, [groupMode, multiRooms, totalAuto, groupTotalEstimate]);

  // اقتراح توزيع الغرف على عدد الأفراد في وضع حجز الشركات/المجموعات
  const handleSuggestAllocation = async () => {
    if (!groupMode || initialData) return;
    const totalGuests = Number(form.guests_count || 0);
    if (!totalGuests || totalGuests <= 0) {
      alert('يرجى إدخال إجمالي عدد الأفراد أولاً.');
      return;
    }
    if (!form.check_in_date || !form.check_out_date) {
      alert('يرجى تحديد تاريخ الدخول وتاريخ الخروج قبل اقتراح التسكين.');
      return;
    }

    try {
      // تأكد أن قائمة الغرف محدثة بناءً على التواريخ
      if (!rooms || rooms.length === 0) {
        await loadAvailableRooms();
      }
    } catch (_) {}

    const list = (groupMode && roomTypeFilters && roomTypeFilters.length > 0
      ? (rooms || []).filter(r => roomTypeFilters.map(x => String(x)).includes(String(r.room_type_id)))
      : (rooms || []));
    if (!list.length) {
      alert('لا توجد غرف متاحة في هذه الفترة لاقتراح التسكين.');
      return;
    }

    // نستخدم قيمة max_guests لكل غرفة إن وجدت، وإلا نفترض سعة 2 كنقطة بداية
    const withCapacity = list.map(r => ({
      ...r,
      _capacity: r.max_guests != null ? Number(r.max_guests) || 0 : 2,
    })).filter(r => r._capacity > 0);

    if (!withCapacity.length) {
      alert('لا يوجد تعريف لسعة الغرف (max_guests) ولا يمكن اقتراح توزيع دقيق.');
      return;
    }

    // إستراتيجية جشعة: نرتب من الأكبر سعة إلى الأصغر ونختار حتى تغطية العدد المطلوب
    withCapacity.sort((a, b) => b._capacity - a._capacity);

    let remainingGuests = totalGuests;
    const allocation = {};
    const selectedIds = [];

    for (const r of withCapacity) {
      if (remainingGuests <= 0) break;
      const canTake = Math.min(r._capacity, remainingGuests);
      if (canTake <= 0) continue;
      const key = String(r.id);
      allocation[key] = canTake;
      selectedIds.push(r.id);
      remainingGuests -= canTake;
    }

    if (!selectedIds.length) {
      alert('تعذّر اقتراح توزيع: السعة المتاحة لا تكفي لأي جزء من المجموعة.');
      return;
    }

    setRoomAllocation(allocation);
    setSelectedRoomIds(selectedIds);
    setMultiRooms(true);

    // إجمالي مقترح (مجموع الأفراد الموزعين على الغرف)
    const autoTotal = Object.values(allocation).reduce((acc, v) => acc + Number(v || 0), 0);
    if (!guestsCountManual && autoTotal > 0) {
      setForm(f => ({
        ...f,
        guests_count: autoTotal,
      }));
    }

    if (remainingGuests > 0) {
      alert('تم اقتراح أفضل توزيع ممكن، لكن السعة المتاحة أقل من العدد المطلوب بالكامل.');
    } else {
      alert('تم اقتراح توزيع الغرف على الأفراد بنجاح، يمكنك مراجعة الغرف قبل تأكيد الحجز.');
    }
  };

  const filteredMainGuests = useMemo(() => {
    const term = (mainGuestSearch || '').trim().toLowerCase();
    const filteredByStatus = guests.filter(g => {
      if (guestFilter === 'all') return true;
      if (guestFilter === 'inactive') return g.is_inactive;
      if (guestFilter === 'current') return g.has_current_stay;
      if (guestFilter === 'upcoming') return g.has_upcoming_reservation;
      if (guestFilter === 'today') {
        const created = g.created_at ? String(g.created_at).slice(0,10) : null;
        const d = new Date(); const pad = (n)=>String(n).padStart(2,'0');
        const todayStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        return created === todayStr;
      }
      return true;
    });

    if (!term) return filteredByStatus;

    return filteredByStatus.filter(g => {
      const name = String(g.full_name || '').toLowerCase();
      const phone = String(g.phone || '').toLowerCase();
      const nid = String(g.national_id || '').toLowerCase();
      const email = String(g.email || '').toLowerCase();
      return (
        (name && name.includes(term)) ||
        (phone && phone.includes(term)) ||
        (nid && nid.includes(term)) ||
        (email && email.includes(term))
      );
    });
  }, [guests, guestFilter, mainGuestSearch]);

  const checkAvailability = async () => {
    const { data, error } = await supabase.rpc('check_room_availability', {
      p_room_id: form.room_id,
      p_check_in: form.check_in_date,
      p_check_out: form.check_out_date,
      p_reservation_id: initialData?.id || null,
    });
    if (error) throw error;
    return data; // expected boolean
  };

  const loadAllRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, room_number, room_code, status, cleanliness')
        .order('room_number', { ascending: true });
      if (error) throw error;
      setRooms((data||[]).map(r=>({
        id: r.id,
        room_label: r.room_number || r.room_code || ('غرفة #' + String(r.id).slice(0,8)),
        status: r.status,
        cleanliness: r.cleanliness
      })));
    } catch(e) {
      console.error('Failed loading rooms list', e);
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadAvailableRooms = useCallback(async () => {
    if (!form.check_in_date || !form.check_out_date) { await loadAllRooms(); return; }
    setRoomsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_available_rooms', {
        p_check_in: form.check_in_date,
        p_check_out: form.check_out_date,
        p_reservation_id: initialData?.id || null,
      });
      if (error) throw error;
      let list = (data||[]);
      if (initialData?.room_id && !list.some(r=>String(r.id)===String(initialData.room_id))) {
        try {
          const { data: cur } = await supabase.from('rooms').select('id, room_number, room_code, status, cleanliness, room_type_id').eq('id', initialData.room_id).single();
          let rt = null;
          try { rt = await supabase.from('room_types').select('id,name,name_ar,base_price,max_guests').eq('id', cur.room_type_id).single(); } catch {}
          const base_price = rt?.data?.base_price ?? null;
          const room_type_name = rt?.data?.name_ar || rt?.data?.name || null;
          const max_guests = rt?.data?.max_guests ?? null;
          if (cur) list = [{ id: cur.id, room_label: cur.room_number || cur.room_code || ('غرفة #' + String(cur.id).slice(0,8)), status: cur.status, cleanliness: cur.cleanliness, room_type_id: cur.room_type_id, room_type_name, base_price, max_guests }, ...list];
        } catch {}
      }
      setRooms(list);
    } catch (e) {
      console.warn('get_available_rooms RPC not available, falling back', e?.message || e);
      await loadAllRooms();
    } finally {
      setRoomsLoading(false);
    }
  }, [form.check_in_date, form.check_out_date, initialData, loadAllRooms]);

  useEffect(()=>{ loadAvailableRooms(); /* initial load and when dates change */ }, [loadAvailableRooms]);
  useEffect(()=>{ if (!form.check_in_date || !form.check_out_date) loadAllRooms(); }, [loadAllRooms, form.check_in_date, form.check_out_date]);

  // When room changes, default nightly_rate from room type base_price and clamp guests_count
  useEffect(()=>{
    const r = rooms.find(x => String(x.id) === String(form.room_id));
    if (r && r.base_price != null) {
      setForm(f => ({ ...f, nightly_rate: Number(r.base_price) }));
    }
  }, [form.room_id, rooms]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // check open shift for reception/housekeeping users
      try {
        const ok = await ensureOpenShift(currentUser);
        if (!ok) {
          window.alert('لا يمكنك إجراء هذه العملية بدون وردية مفتوحة. يرجى فتح وردية أولاً.');
          return;
        }
      } catch (_) {
        window.alert('تعذّر التحقق من حالة الوردية. حاول مجددًا أو افتح وردية يدوياً.');
        return;
      }
      setSaving(true);
      const hasAnyRoom = (multiRooms && (groupMode || !initialData))
        ? (selectedRoomIds && selectedRoomIds.length > 0)
        : !!form.room_id;
      const isCompanyPayer = String(form.payer_type) === 'agency';
      const guestRequired = !isCompanyPayer; // في حجوزات الشركات نسمح بدون نزيل رئيسي

      if ((guestRequired && !form.guest_id) || !hasAnyRoom || !form.check_in_date || !form.check_out_date) {
        alert('يرجى تعبئة جميع الحقول الأساسية');
        setSaving(false);
        return;
      }
      // Require explicit OK confirmation if room is not clean AND check-in is today
      try {
        const selectedRoom = rooms.find(x => String(x.id) === String(form.room_id));
        if (selectedRoom && selectedRoom.cleanliness && selectedRoom.cleanliness !== 'clean') {
          const today = new Date();
          const pad = (n)=> String(n).padStart(2,'0');
          const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
          if (String(form.check_in_date) === todayStr) {
            const confirmText = window.prompt('الغرفة غير نظيفة والدخول اليوم. لتأكيد الحجز اكتب: ok', '');
            if (!confirmText || String(confirmText).trim().toLowerCase() !== 'ok') {
              alert('تم إلغاء تأكيد الحجز لهذه الغرفة غير النظيفة.');
              setSaving(false);
              return;
            }
          }
        }
      } catch(_) {}
      // مرونة مطلوبة: لا منع صارم عند تجاوز الحد الأقصى المقترح لعدد النزلاء
      // Optional: availability check if RPC exists, otherwise rely on trigger
      try {
        // في الحجز الفردي فقط نتحقق من توافر الغرفة بالـ RPC (الحجز الجماعي يعتمد على التريجر في القاعدة)
        if (!(multiRooms && (groupMode || !initialData))) {
          const ok = await checkAvailability();
          if (ok === false) {
            alert('الغرفة غير متاحة في هذه الفترة');
            setSaving(false);
            return;
          }
        }
      } catch {
        // silently ignore if RPC not available
      }
      // Ensure nightly_rate snapshot from room type, and computed total
      const selected = rooms.find(x => String(x.id) === String(form.room_id));
      const nightly = form.nightly_rate ?? (selected && selected.base_price != null ? Number(selected.base_price) : null);
      const total = totalAuto ? (nightly != null && nights > 0 ? Math.round(nightly * nights * 100) / 100 : form.total_amount) : form.total_amount;

      const basePayload = { ...form, nightly_rate: nightly, total_amount: total };

        if (multiRooms && (groupMode || !initialData)) {
        const roomIds = (selectedRoomIds && selectedRoomIds.length > 0)
          ? selectedRoomIds
          : (form.room_id ? [form.room_id] : []);
        if (!roomIds.length) {
          alert('يرجى اختيار غرفة واحدة على الأقل للحجز الجماعي');
          setSaving(false);
          return;
        }
        const reservations = roomIds.map(rid => {
          const key = String(rid);
          const roomObj = rooms.find(r => String(r.id) === key);
          let guestsForRoom;
          if (groupMode && multiRooms) {
            if (roomAllocation && roomAllocation[key]) {
              guestsForRoom = roomAllocation[key];
            } else if (roomObj && roomObj.max_guests != null) {
              guestsForRoom = Number(roomObj.max_guests) || 1;
            } else {
              guestsForRoom = 1;
            }
          } else {
            guestsForRoom = roomAllocation && roomAllocation[key] ? roomAllocation[key] : basePayload.guests_count;
          }
          const roomNightly = roomObj && roomObj.base_price != null
            ? Number(roomObj.base_price) || 0
            : (nightly != null ? Number(nightly) || 0 : 0);
          const roomTotal = totalAuto && roomNightly && nights > 0
            ? Math.round(roomNightly * nights * 100) / 100
            : total;
          return {
            ...basePayload,
            room_id: rid,
            guests_count: guestsForRoom,
            nightly_rate: roomNightly || null,
            total_amount: roomTotal,
          };
        });
        onSave({ multi: true, reservations });
      } else {
        onSave(basePayload);
      }
    } catch(e) {
      console.error(e);
      alert('حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  };

  // Guests inside reservation (UI-only for now; parent handles saving extra guests via RPC)
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState([]);
  useEffect(() => {
    const term = (guestSearch||'').trim();
    if (!term) { setGuestResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('guests_overview')
          .select('id, full_name, phone, national_id, email, created_at, has_current_stay, has_upcoming_reservation, is_inactive')
          .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,national_id.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(10);
        if (error) throw error;
        setGuestResults(data||[]);
      } catch(e) { setGuestResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [guestSearch]);

  const addExtraGuestLocal = (guestId) => {
    // تحقق من وجود وردية نشطة قبل إضافة ضيف إضافي
    (async () => {
      // Only enforce shift for reception and housekeeping roles
      if (!(currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping'))) {
        setForm(f => ({ ...f, pending_guest_ids: Array.from(new Set([...(f.pending_guest_ids||[]), guestId])) }));
        setGuestSearch(''); setGuestResults([]);
        return;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: shifts } = await supabase
        .from('reception_shifts')
        .select('id,status')
        .eq('staff_user_id', currentUser?.id)
        .eq('shift_date', todayStr)
        .eq('status', 'open')
        .limit(1);
      if (!(shifts && shifts.length > 0)) {
        window.alert('لا يمكنك إضافة ضيف بدون وجود وردية نشطة. يرجى فتح وردية أولاً.');
        return;
      }
      setForm(f => ({ ...f, pending_guest_ids: Array.from(new Set([...(f.pending_guest_ids||[]), guestId])) }));
      setGuestSearch(''); setGuestResults([]);
    })();
  };

  const removeExtraGuestLocal = (guestId) => {
    setForm(f => ({ ...f, pending_guest_ids: (f.pending_guest_ids||[]).filter(id => String(id) !== String(guestId)) }));
  };

  // Advanced actions: move remaining nights / split reservation
  const [showMoveRemaining, setShowMoveRemaining] = useState(false);
  const [moveFromDate, setMoveFromDate] = useState('');
  const [moveRooms, setMoveRooms] = useState([]);
  const [moveRoomId, setMoveRoomId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);

  const [showSplit, setShowSplit] = useState(false);
  const [splitStart, setSplitStart] = useState('');
  const [splitEnd, setSplitEnd] = useState('');
  const [splitRooms, setSplitRooms] = useState([]);
  const [splitRoomId, setSplitRoomId] = useState('');
  const [splitLoading, setSplitLoading] = useState(false);

  const loadAvailableRoomsForRange = async (start, end, forMove) => {
    if (!start || !end) return;
    try {
      const { data, error } = await supabase.rpc('get_available_rooms', {
        p_check_in: start,
        p_check_out: end,
        p_reservation_id: initialData?.id || null,
      });
      if (error) throw error;
      if (forMove) {
        setMoveRooms(data || []);
        if (data && data.length > 0) setMoveRoomId(String(data[0].id));
      } else {
        setSplitRooms(data || []);
        if (data && data.length > 0) setSplitRoomId(String(data[0].id));
      }
    } catch (e) {
      console.warn('get_available_rooms for advanced action failed', e?.message || e);
      if (forMove) { setMoveRooms([]); } else { setSplitRooms([]); }
    }
  };

  const openMoveRemaining = async () => {
    if (!initialData || !initialData.id || !initialData.check_in_date || !initialData.check_out_date) {
      alert('هذه العملية متاحة فقط للحجوزات المحفوظة.');
      return;
    }
    const today = new Date();
    const pad = (n)=>String(n).padStart(2,'0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    const startBase = initialData.check_in_date;
    const endBase = initialData.check_out_date;
    const effectiveFrom = String(todayStr > startBase ? todayStr : startBase);
    if (!(effectiveFrom < endBase)) {
      alert('لا يوجد أيام متبقية يمكن نقلها ضمن هذا الحجز.');
      return;
    }
    setMoveFromDate(effectiveFrom);
    setShowMoveRemaining(true);
    await loadAvailableRoomsForRange(effectiveFrom, endBase, true);
  };

  const handleConfirmMoveRemaining = async () => {
    if (!moveFromDate || !moveRoomId) {
      alert('يرجى اختيار تاريخ البداية والغرفة المستهدفة.');
      return;
    }
    if (!initialData || !initialData.id || !initialData.check_out_date) return;
    try {
      setMoveLoading(true);
      const staffId = currentUser && currentUser.id ? currentUser.id : null;
      const { error } = await supabase.rpc('move_reservation_remaining_from_date', {
        p_reservation_id: initialData.id,
        p_from_date: moveFromDate,
        p_target_room_id: moveRoomId,
        p_staff_user_id: staffId,
      });
      if (error) throw error;
      alert('تم نقل باقي الأيام إلى الغرفة الجديدة بنجاح.');
      setShowMoveRemaining(false);
      if (onAfterAction) onAfterAction();
      onClose();
    } catch (e) {
      console.error('Failed to move remaining nights', e);
      const msg = String(e?.message || e || '').toLowerCase();
      let userMsg = 'تعذر تنفيذ عملية نقل باقي الأيام.';
      if (msg.includes('overlapping reservation')) userMsg = 'تعذر التنفيذ: يوجد تعارض مع حجز آخر في الغرفة الجديدة.';
      else if (msg.includes('check_out_date must be after check_in_date')) userMsg = 'تعذر التنفيذ: تاريخ الخروج يجب أن يكون بعد تاريخ البداية المحددة.';
      alert(userMsg);
    } finally {
      setMoveLoading(false);
    }
  };

  const openSplit = async () => {
    if (!initialData || !initialData.id || !initialData.check_in_date || !initialData.check_out_date) {
      alert('هذه العملية متاحة فقط للحجوزات المحفوظة.');
      return;
    }
    setSplitStart(initialData.check_in_date);
    setSplitEnd(initialData.check_out_date);
    setShowSplit(true);
    await loadAvailableRoomsForRange(initialData.check_in_date, initialData.check_out_date, false);
  };

  const handleConfirmSplit = async () => {
    if (!splitStart || !splitEnd || !splitRoomId) {
      alert('يرجى تحديد فترة الجزء المراد نقله والغرفة الجديدة.');
      return;
    }
    if (!initialData || !initialData.id) return;
    if (!(splitStart < splitEnd)) {
      alert('تاريخ نهاية الجزء يجب أن يكون بعد تاريخ بدايته.');
      return;
    }
    try {
      setSplitLoading(true);
      const staffId = currentUser && currentUser.id ? currentUser.id : null;
      const { error } = await supabase.rpc('split_and_move_reservation', {
        p_reservation_id: initialData.id,
        p_segment_start: splitStart,
        p_segment_end: splitEnd,
        p_target_room_id: splitRoomId,
        p_staff_user_id: staffId,
      });
      if (error) throw error;
      alert('تم نقل الجزء المحدد من الحجز إلى الغرفة الجديدة بنجاح.');
      setShowSplit(false);
      if (onAfterAction) onAfterAction();
      onClose();
    } catch (e) {
      console.error('Failed to split and move reservation', e);
      const msg = String(e?.message || e || '').toLowerCase();
      let userMsg = 'تعذر تنفيذ عملية تقسيم الحجز.';
      if (msg.includes('overlapping reservation')) userMsg = 'تعذر التنفيذ: يوجد تعارض مع حجز آخر في الغرفة الجديدة.';
      else if (msg.includes('check_out_date must be after check_in_date')) userMsg = 'تعذر التنفيذ: تاريخ نهاية الجزء يجب أن تكون بعد بدايته.';
      alert(userMsg);
    } finally {
      setSplitLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center px-2 sm:px-3 py-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-[95vw] sm:max-w-xl md:max-w-2xl xl:max-w-3xl max-h-[85vh] overflow-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-bold">{initialData ? (groupMode ? 'تعديل حجز مجموعة' : 'تعديل حجز') : (groupMode ? 'حجز شركات / مجموعات' : 'حجز جديد')}</h3>
          <div className="flex items-center gap-2">
            {groupMode && form.payer_type === 'agency' && (
              <button type="button" className="px-2 py-1 text-xs border rounded bg-yellow-50" onClick={async ()=>{
                try {
                  const percentStr = window.prompt('أدخل نسبة الخصم المئوية (مثال: 10 لـ 10%)', '10');
                  if (!percentStr) return;
                  const percent = Number(String(percentStr).trim());
                  if (Number.isNaN(percent) || percent < 0 || percent > 100) { alert('نسبة غير صالحة'); return; }
                  const ok = window.confirm(`تطبيق خصم ${percent}% على هذا الحجز؟`);
                  if (!ok) return;
                  const payload = {
                    p_agency_name: form.agency_name,
                    p_check_in: form.check_in_date,
                    p_check_out: form.check_out_date,
                    p_percent: percent,
                    p_room_ids: (selectedRoomIds && selectedRoomIds.length>0) ? selectedRoomIds : null,
                    p_staff_user_id: currentUser?.id || null,
                  };
                  const { data, error } = await supabase.rpc('apply_group_discount', payload);
                  if (error) throw error;
                  alert(`تم تطبيق الخصم على ${ (data && data.length) || 0 } حجزًا.`);
                  // reload available rooms and keep modal open
                  await loadAvailableRooms();
                } catch (e) { console.error('Apply discount from modal failed', e); alert('تعذّر تطبيق الخصم: ' + (e.message || e)); }
              }}>تطبيق خصم</button>
            )}
            <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>إغلاق</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-3 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">النزيل</label>
              <div className="flex items-center justify-between mb-1 gap-1 text-[11px] text-gray-600">
                <span>اختر من النزلاء</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  <button type="button" className={`px-2 py-0.5 border rounded ${guestFilter==='today'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-gray-700'}`} onClick={()=>setGuestFilter('today')}>مضافون اليوم</button>
                  <button type="button" className={`px-2 py-0.5 border rounded ${guestFilter==='current'?'bg-emerald-600 text-white border-emerald-600':'bg-white text-gray-700'}`} onClick={()=>setGuestFilter('current')}>مقيمون حالياً</button>
                  <button type="button" className={`px-2 py-0.5 border rounded ${guestFilter==='upcoming'?'bg-amber-600 text-white border-amber-600':'bg-white text-gray-700'}`} onClick={()=>setGuestFilter('upcoming')}>قادِمون</button>
                  <button type="button" className={`px-2 py-0.5 border rounded ${guestFilter==='inactive'?'bg-gray-700 text-white border-gray-700':'bg-white text-gray-700'}`} onClick={()=>setGuestFilter('inactive')}>غير نشطين</button>
                  <button type="button" className={`px-2 py-0.5 border rounded ${guestFilter==='all'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700'}`} onClick={()=>setGuestFilter('all')}>الكل</button>
                </div>
              </div>
              <input
                className="border rounded w-full px-3 py-1 mb-1 text-xs"
                placeholder="بحث بالاسم / الهاتف / البطاقة / الإيميل"
                value={mainGuestSearch}
                onChange={e=>setMainGuestSearch(e.target.value)}
              />
              {mainGuestSearch && filteredMainGuests.length > 0 && (
                <div className="border rounded bg-white shadow text-xs max-h-40 overflow-auto mb-1">
                  {filteredMainGuests.slice(0, 12).map(g => (
                    <div
                      key={g.id}
                      className="px-2 py-1 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                      onClick={() => {
                        setForm(f => ({ ...f, guest_id: g.id }));
                        setMainGuestSearch(g.full_name || '');
                      }}
                    >
                      <span>
                        {g.full_name}{' '}
                        <span className="text-gray-500">
                          ({g.phone || g.national_id || g.email || String(g.id).slice(0,8)})
                        </span>
                      </span>
                      <span className="text-[10px] text-gray-500 ml-1">
                        {g.is_inactive ? 'غير نشط' : (g.has_current_stay ? 'مقيم حالياً' : (g.has_upcoming_reservation ? 'لديه حجز قادم' : ''))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <select className="border rounded w-full px-3 py-2" value={form.guest_id||''} onChange={e=>setForm(f=>({ ...f, guest_id: e.target.value||null }))}>
                <option value="">اختر النزيل</option>
                {filteredMainGuests
                  .map(g=> (
                    <option key={g.id} value={g.id}>
                      {g.full_name}
                      {g.is_inactive ? ' — غير نشط' : (g.has_current_stay ? ' — مقيم حالياً' : (g.has_upcoming_reservation ? ' — لديه حجز قادم' : ''))}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">الغرفة</label>
              {(() => {
                const r = rooms.find(x => String(x.id) === String(form.room_id));
                if (r && r.cleanliness && r.cleanliness !== 'clean') {
                  return (
                    <div className="mb-2 text-xs bg-yellow-50 text-yellow-800 border border-yellow-300 rounded px-2 py-1">
                      تنبيه: الغرفة غير نظيفة حالياً. لو الدخول اليوم سيطلب تأكيد.
                    </div>
                  );
                }
                return null;
              })()}
              {groupMode && !initialData && roomTypes.length > 0 && (
                <div className="mb-1 border rounded px-2 py-1 bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] text-gray-700">تحديد أنواع الغرف للتسكين</label>
                    <span className="text-[10px] text-gray-500">يمكن اختيار أكثر من نوع</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5 text-xs">
                    {roomTypes.map(rt => {
                      const checked = roomTypeFilters.some(id => String(id) === String(rt.id));
                      return (
                        <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const on = e.target.checked;
                              setRoomTypeFilters(prev => {
                                const set = new Set((prev || []).map(x => String(x)));
                                const idStr = String(rt.id);
                                if (on) set.add(idStr); else set.delete(idStr);
                                return Array.from(set);
                              });
                            }}
                          />
                          <span>
                            {rt.name} — متاح: {rt.count} غرفة
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    إن لم يتم اختيار أي نوع سيتم استخدام كل الغرف المتاحة في الاقتراح.
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mb-1 text-[11px] text-gray-600">
                <span>اختر الغرفة الرئيسية</span>
                {!initialData && !groupMode && (
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiRooms}
                      onChange={e => {
                        const checked = e.target.checked;
                        setMultiRooms(checked);
                        if (!checked) return;
                        // في الحجز الجماعي، يُفضّل أن يكون الدفع من شركة/جهة
                        setForm(f => ({ ...f, payer_type: f.payer_type === 'guest' ? 'agency' : f.payer_type }));
                        setSelectedRoomIds(prev => {
                          const base = new Set(prev || []);
                          if (form.room_id) base.add(form.room_id);
                          return Array.from(base);
                        });
                      }}
                    />
                    <span>حجز لعدّة غرف (شركة/مجموعة)</span>
                  </label>
                )}
              </div>
              <select className="border rounded w-full px-3 py-2" value={form.room_id||''} onChange={e=>setForm(f=>({ ...f, room_id: e.target.value||null }))}>
                <option value="">{roomsLoading ? '...جاري التحميل' : 'اختر الغرفة'}</option>
                {visibleRooms.map(r=> {
                  const suffix = r.cleanliness && r.cleanliness !== 'clean' ? ` - ${r.cleanliness==='in_cleaning' ? 'جاري تنظيف' : 'غير نظيفة'}` : '';
                  const typeInfo = r.room_type_name ? ` — ${r.room_type_name}` : '';
                  const priceInfo = r.base_price != null ? ` — ${r.base_price} ${form.currency==='EGP'?'جنيه':form.currency}` : '';
                  return <option key={r.id} value={r.id}>{(r.room_label || r.room_code || r.id) + typeInfo + priceInfo + suffix}</option>;
                })}
              </select>
              {multiRooms && (groupMode || !initialData) && (
                <div className="mt-2 border rounded p-2 bg-gray-50">
                  <div className="text-[11px] mb-1 text-gray-700">اختر كل الغرف المطلوب حجزها لنفس الشركة ونفس التواريخ:</div>
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                    {visibleRooms.map(r => {
                      const checked = selectedRoomIds.some(id => String(id) === String(r.id));
                      const typeInfo = r.room_type_name ? ` — ${r.room_type_name}` : '';
                      const priceInfo = r.base_price != null ? ` — ${r.base_price} ${form.currency==='EGP'?'جنيه':form.currency}` : '';
                      const capacityInfo = r.max_guests != null ? ` — سعة: ${r.max_guests}` : '';
                      return (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const isOn = e.target.checked;
                              setSelectedRoomIds(prev => {
                                const set = new Set((prev || []).map(x => String(x)));
                                const idStr = String(r.id);
                                if (isOn) set.add(idStr); else set.delete(idStr);
                                return Array.from(set);
                              });
                            }}
                          />
                          <span>
                            {r.room_label || r.room_code || r.id}
                            {typeInfo}{priceInfo}{capacityInfo}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">سيتم إنشاء حجز مستقل لكل غرفة مع نفس التواريخ ونفس بيانات الشركة.</div>
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1">
                {(() => {
                  const r = rooms.find(x => String(x.id) === String(form.room_id));
                  if (!r) return null;
                  const priceTxt = r.base_price != null ? `${r.base_price} ${form.currency==='EGP'?'جنيه':form.currency}` : 'غير محدد';
                  return (
                    <span>
                      نوع الغرفة: <b>{r.room_type_name || 'غير محدد'}</b>
                      {` — السعر الأساسي: ${priceTxt}`}
                      {maxGuestsForSelected ? ` — أقصى عدد: ${maxGuestsForSelected}` : ''}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1">تاريخ الدخول</label>
              <input type="date" className="border rounded w-full px-3 py-2" value={form.check_in_date} onChange={e=>setForm(f=>({ ...f, check_in_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs mb-1">تاريخ الخروج</label>
              <input type="date" className="border rounded w-full px-3 py-2" value={form.check_out_date} onChange={e=>setForm(f=>({ ...f, check_out_date: e.target.value }))} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs">عدد النزلاء</label>
                {groupMode && !initialData && (
                  <button
                    type="button"
                    className="text-[11px] px-2 py-0.5 rounded border border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50"
                    onClick={handleSuggestAllocation}
                  >
                    اقتراح توزيع على الغرف
                  </button>
                )}
              </div>
              <input
                type="number"
                min={1}
                className="border rounded w-full px-3 py-2"
                value={form.guests_count}
                onChange={e=>{
                  const val = Number(e.target.value)||1;
                  // نعتبره تعديل يدوي ثابت فقط إذا قلّل المستخدم العدد عن القيمة الحالية
                  const current = Number(form.guests_count || 0);
                  if (val < current) {
                    setGuestsCountManual(true);
                  }
                  setForm(f=>({ ...f, guests_count: val }));
                }}
              />
              {groupMode && !initialData && (
                <div className="mt-1 text-[11px] text-gray-600">
                  في حجز الشركات/المجموعات يمثل هذا الرقم إجمالي عدد الأفراد المطلوب تسكينهم.
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1">الحالة</label>
              <select className="border rounded w-full px-3 py-2" value={form.status} onChange={e=>setForm(f=>({ ...f, status: e.target.value }))}>
                {statusOptions.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">سعر الليلة</label>
              {groupMode && multiRooms ? (
                <input
                  type="number"
                  className="border rounded w-full px-3 py-2 bg-gray-100 text-gray-500"
                  value={''}
                  placeholder="يتم الحساب تلقائياً من أسعار كل غرفة"
                  disabled
                />
              ) : (
                <input
                  type="number"
                  className="border rounded w-full px-3 py-2"
                  value={form.nightly_rate ?? ''}
                  onChange={e=>setForm(f=>({ ...f, nightly_rate: (e.target.value===''? null : Number(e.target.value)) }))}
                />
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs mb-1">الإجمالي</label>
                {!groupMode && !multiRooms && (
                  <label className="flex items-center gap-1 text-[11px]">
                    <input type="checkbox" checked={totalAuto} onChange={e=>setTotalAuto(e.target.checked)} />
                    <span>حساب تلقائي</span>
                  </label>
                )}
              </div>
              <input
                type="number"
                className="border rounded w-full px-3 py-2"
                value={form.total_amount ?? ''}
                onChange={e=>setForm(f=>({ ...f, total_amount: (e.target.value===''? null : Number(e.target.value)) }))}
                disabled={totalAuto || (groupMode && multiRooms)}
              />
            </div>
            <div>
              <label className="block text-xs mb-1">المدفوع</label>
              <input type="number" className="border rounded w-full px-3 py-2" value={form.amount_paid ?? 0} onChange={e=>setForm(f=>({ ...f, amount_paid: Number(e.target.value)||0 }))} />
            </div>
          </div>

          {groupMode && multiRooms && groupTotalEstimate != null && (
            <div className="mt-1 text-[11px] text-emerald-700">
              إجمالي تقريبي لكل الغرف (حسب أسعار الأنواع وعدد الليالي):
              {' '}
              <span className="font-semibold">
                {groupTotalEstimate} {form.currency === 'EGP' ? 'جنيه' : form.currency}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">المتبقي</label>
              <div className="border rounded w-full px-3 py-2 bg-gray-50 text-red-700 font-semibold">{remaining} {form.currency === 'EGP' ? 'جنيه' : form.currency}</div>
            </div>
            <div>
              <label className="block text-xs mb-1">العملة</label>
              <select className="border rounded w-full px-3 py-2" value={form.currency} onChange={e=>setForm(f=>({ ...f, currency: e.target.value }))}>
                <option value="EGP">جنيه</option>
                <option value="SAR">ريال</option>
                <option value="USD">دولار</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">طريقة الدفع</label>
              <select className="border rounded w-full px-3 py-2" value={form.payment_method} onChange={e=>setForm(f=>({ ...f, payment_method: e.target.value }))}>
                <option value="cash">نقدي (خزنة)</option>
                <option value="instapay">إنستاباي / بطاقة بنكية</option>
                <option value="other">محفظة إلكترونية</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-emerald-50 rounded p-3">
            <div>
              <label className="block text-xs mb-1">من يدفع؟</label>
              <select className="border rounded w-full px-3 py-2" value={form.payer_type} onChange={e=>setForm(f=>({ ...f, payer_type: e.target.value }))}>
                <option value="guest">النزيل نفسه</option>
                <option value="agency">شركة/وكالة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">اسم الجهة</label>
              <input className="border rounded w-full px-3 py-2" placeholder="اسم الشركة أو الوكالة" value={form.agency_name} onChange={e=>setForm(f=>({ ...f, agency_name: e.target.value }))} disabled={form.payer_type!=='agency'} />
            </div>
            <div className="flex items-end">
              <div className="text-sm text-gray-600">المدفوع: <span className="text-blue-700 font-semibold">{form.amount_paid||0} {form.currency==='EGP'?'جنيه':form.currency}</span></div>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">طلبات خاصة</label>
            <textarea className="border rounded w-full px-3 py-2" rows={2} value={form.special_requests} onChange={e=>setForm(f=>({ ...f, special_requests: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm mb-1">ملاحظات</label>
            {isManagerUser ? (
              <textarea
                className="border rounded w-full px-3 py-2"
                rows={2}
                value={form.notes}
                onChange={e=>setForm(f=>({ ...f, notes: e.target.value }))}
              />
            ) : (
              <>
                {/* ملاحظات النظام (تتبع التغييرات الحساسة) للعرض فقط */}
                {(() => {
                  const lines = String(form.notes || '').split('\n');
                  const systemLines = lines.filter(line => systemNotePrefixes.some(p => line.trim().startsWith(p)));
                  const userLines = lines.filter(line => !systemNotePrefixes.some(p => line.trim().startsWith(p)));
                  return (
                    <>
                      {systemLines.length > 0 && (
                        <div className="border rounded w-full px-3 py-2 mb-2 bg-gray-50 text-xs text-gray-700 whitespace-pre-wrap">
                          {systemLines.join('\n')}
                        </div>
                      )}
                      <textarea
                        className="border rounded w-full px-3 py-2"
                        rows={2}
                        placeholder="اكتب ملاحظات إضافية (لا يمكن تعديل ملاحظات النظام)"
                        value={userLines.join('\n')}
                        onChange={e=>{
                          const newUser = e.target.value || '';
                          const combined = [
                            ...systemLines,
                            ...(newUser ? newUser.split('\n') : []),
                          ].join('\n').trim();
                          setForm(f=>({ ...f, notes: combined }));
                        }}
                      />
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {initialData && initialData.id && (
            <div className="border rounded p-3 bg-blue-50 space-y-2">
              <div className="text-sm font-semibold mb-1">عمليات متقدمة على الحجز</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  className="px-3 py-1 rounded border border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50"
                  onClick={openMoveRemaining}
                >
                  نقل باقي الأيام لغرفة أخرى
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded border border-indigo-500 text-indigo-700 bg-white hover:bg-indigo-50"
                  onClick={openSplit}
                >
                  تقسيم الحجز / نقل جزء
                </button>
              </div>

              {showMoveRemaining && (
                <div className="mt-2 border-t pt-2 space-y-2 text-xs">
                  <div className="font-semibold text-emerald-700 mb-1">نقل جميع الليالي المتبقية من تاريخ محدد</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                    <div>
                      <label className="block mb-0.5">من تاريخ</label>
                      <input
                        type="date"
                        className="border rounded w-full px-2 py-1"
                        value={moveFromDate}
                        min={initialData.check_in_date || ''}
                        max={initialData.check_out_date || ''}
                        onChange={async e => {
                          const v = e.target.value;
                          setMoveFromDate(v);
                          if (v && initialData.check_out_date && v < initialData.check_out_date) {
                            await loadAvailableRoomsForRange(v, initialData.check_out_date, true);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block mb-0.5">إلى أي غرفة؟</label>
                      <select
                        className="border rounded w-full px-2 py-1"
                        value={moveRoomId}
                        onChange={e=>setMoveRoomId(e.target.value || '')}
                      >
                        <option value="">اختر الغرفة الجديدة</option>
                        {moveRooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.room_label || r.room_code || r.id}
                          </option>
                        ))}
                      </select>
                      <div className="text-[11px] text-gray-500 mt-0.5">يتم استبعاد الغرف ذات التعارض التام أو الجزئي مع الفترة المتبقية.</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 border rounded text-xs"
                      onClick={()=>setShowMoveRemaining(false)}
                      disabled={moveLoading}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                      onClick={handleConfirmMoveRemaining}
                      disabled={moveLoading}
                    >
                      {moveLoading ? 'جارٍ التنفيذ...' : 'تأكيد نقل باقي الأيام'}
                    </button>
                  </div>
                </div>
              )}

              {showSplit && (
                <div className="mt-2 border-t pt-2 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-700 mb-1">تقسيم الحجز ونقل جزء فقط</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="block mb-0.5">بداية الجزء</label>
                      <input
                        type="date"
                        className="border rounded w-full px-2 py-1"
                        value={splitStart}
                        min={initialData.check_in_date || ''}
                        max={initialData.check_out_date || ''}
                        onChange={async e => {
                          const v = e.target.value;
                          setSplitStart(v);
                          if (v && splitEnd && v < splitEnd) {
                            await loadAvailableRoomsForRange(v, splitEnd, false);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block mb-0.5">نهاية الجزء</label>
                      <input
                        type="date"
                        className="border rounded w-full px-2 py-1"
                        value={splitEnd}
                        min={initialData.check_in_date || ''}
                        max={initialData.check_out_date || ''}
                        onChange={async e => {
                          const v = e.target.value;
                          setSplitEnd(v);
                          if (v && splitStart && splitStart < v) {
                            await loadAvailableRoomsForRange(splitStart, v, false);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block mb-0.5">الغرفة للجزء المنقول</label>
                      <select
                        className="border rounded w-full px-2 py-1"
                        value={splitRoomId}
                        onChange={e=>setSplitRoomId(e.target.value || '')}
                      >
                        <option value="">اختر الغرفة الجديدة</option>
                        {splitRooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.room_label || r.room_code || r.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500">يجب أن تكون الفترة المختارة بالكامل داخل فترة الحجز الأصلية، ويمكن أن تكون في البداية أو الوسط أو النهاية.</div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 border rounded text-xs"
                      onClick={()=>setShowSplit(false)}
                      disabled={splitLoading}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                      onClick={handleConfirmSplit}
                      disabled={splitLoading}
                    >
                      {splitLoading ? 'جارٍ التنفيذ...' : 'تأكيد تقسيم الحجز'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

            {/* Extra guests inside reservation (for new reservations, saved post-submit) */}
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-sm font-semibold mb-2">ضيوف إضافيون للحجز</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {(form.pending_guest_ids||[]).length === 0 ? (
                  <span className="text-xs text-gray-500">لا يوجد ضيوف إضافيون مضافون.</span>
                ) : (
                  (form.pending_guest_ids||[]).map(id => {
                    const g = guests.find(x => String(x.id) === String(id));
                    return (
                      <span key={id} className="px-2 py-1 text-xs rounded border bg-white">
                        {g?.full_name || id}
                        <button type="button" className="ml-2 text-red-600" onClick={()=>removeExtraGuestLocal(id)}>إزالة ✖</button>
                      </span>
                    );
                  })
                )}
              </div>
              <div className="relative">
                <input className="border rounded px-3 py-2 w-full text-sm" placeholder="بحث عن ضيف لإضافته للحجز" value={guestSearch} onChange={e=>setGuestSearch(e.target.value)} />
                {guestResults.length > 0 && (
                  <div className="absolute z-10 mt-1 bg-white border rounded shadow p-2 text-sm max-h-48 overflow-auto w-full">
                    {guestResults
                      .filter(gr => {
                        if (guestFilter === 'all') return true;
                        if (guestFilter === 'inactive') return gr.is_inactive;
                        if (guestFilter === 'current') return gr.has_current_stay;
                        if (guestFilter === 'upcoming') return gr.has_upcoming_reservation;
                        if (guestFilter === 'today') {
                          const created = gr.created_at ? String(gr.created_at).slice(0,10) : null;
                          const d = new Date(); const pad = (n)=>String(n).padStart(2,'0');
                          const todayStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
                          return created === todayStr;
                        }
                        return true;
                      })
                      .map(gr => (
                        <div key={gr.id} className="px-2 py-1 hover:bg-gray-100 cursor-pointer" onClick={()=>addExtraGuestLocal(gr.id)}>
                          {gr.full_name}{' '}
                          <span className="text-gray-500">({gr.phone || gr.email || String(gr.id).slice(0,8)})</span>
                          <span className="ml-1 text-[10px] text-gray-500">
                            {gr.is_inactive ? '— غير نشط' : (gr.has_current_stay ? '— مقيم حالياً' : (gr.has_upcoming_reservation ? '— لديه حجز قادم' : ''))}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[11px] text-gray-600">سيتم حفظ الضيوف الإضافيين مع الحجز، ويمكن توزيعهم على الأسِرّة من شاشة "التسكين".</div>
            </div>

          <div className="flex items-center justify-between border-t pt-3 sticky bottom-0 bg-white px-3">
            <div className="text-sm text-gray-500">ليالي: {nights}</div>
            <div className="flex gap-2">
              <button type="button" className="px-4 py-2 border rounded" onClick={onClose}>إلغاء</button>
              <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded" disabled={saving}>{saving? 'جارٍ الحفظ...' : (initialData ? 'تحديث الحجز' : 'تأكيد الحجز')}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
