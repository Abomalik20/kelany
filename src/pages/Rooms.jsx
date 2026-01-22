import React, { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import RoomModal from '../components/RoomModal';
import RoomCard from '../components/RoomCard';
import { AuthContext } from '../App.jsx';
import { canDeleteCore } from '../utils/permissions';

export default function Rooms() {
  const currentUser = useContext(AuthContext);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [filterBuilding, setFilterBuilding] = useState('all');
  const [filterFloor, setFilterFloor] = useState('all');
  const [statusFilters, setStatusFilters] = useState({ available: true, reserved: true, occupied: true, maintenance: true });
  const [cleanFilters, setCleanFilters] = useState({ clean: true, in_cleaning: true, needs_cleaning: true });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState(new Set());

  // قراءة معرّفات المبنى/الطابق من الـ URL (مثلاً عند الانتقال من شاشة الطوابق)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const b = params.get('building');
      const f = params.get('floor');
      if (b) setFilterBuilding(b);
      if (f) setFilterFloor(f);
    } catch (_) {}
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const [{ data: bs, error: e1 }] = await Promise.all([
        supabase.from('buildings').select('id,name').order('name')
      ]);
      if (e1) throw e1;
      setBuildings(bs || []);

      // floors: جلب مرن مع محاولات بديلة لتفادي أخطاء ترتيب/أسماء الأعمدة
      let fs = [];
      let errFloors = null;
      try {
        const { data, error } = await supabase
          .from('floors')
          .select('id,name,floor_number,number,building_id')
          .order('id');
        if (error) throw error;
        fs = data || [];
      } catch (err) {
        errFloors = err;
        try {
          const { data, error } = await supabase
            .from('floors')
            .select('*');
          if (error) throw error;
          fs = data || [];
        } catch (err2) {
          console.error('Failed floors lookup (fallback also failed)', err2);
          fs = [];
        }
      }
      if (errFloors) console.warn('Floors initial fetch err:', errFloors?.message || errFloors);
      setFloors(fs);

      // room types
      try {
        const { data: rts, error } = await supabase
          .from('room_types_active')
          .select('id,name,name_ar,base_price,max_guests')
          .order('display_order');
        if (error) throw error;
        setRoomTypes(rts || []);
      } catch (errRt) {
        console.error('Failed room types lookup', errRt);
        setRoomTypes([]);
      }
    } catch (e) {
      console.error('Failed to load lookups', e);
    }
  }, []);

  const buildRoomsQuery = useCallback(() => {
    const q = supabase
      .from('rooms_overview')
      .select('*', { count: 'exact' })
      .order('room_code', { ascending: true });

    // حالة البحث
    const term = (debounced || '').trim();
    if (term) {
      // البحث عن الرمز أو الوصف
      q.or(`room_code.ilike.%${term}%,description.ilike.%${term}%`);
    }

    // تصفية الحالة
    const activeStatuses = Object.entries(statusFilters).filter(([,v])=>v).map(([k])=>k);
    if (activeStatuses.length > 0 && activeStatuses.length < 4) {
      q.in('status', activeStatuses);
    }

    // تصفية النظافة (إن وُجدت في العرض)
    const activeClean = Object.entries(cleanFilters).filter(([,v])=>v).map(([k])=>k);
    if (activeClean.length > 0 && activeClean.length < 3) {
      q.in('cleanliness', activeClean);
    }

    // ترقيم الصفحات
    const from = page * pageSize;
    const to = from + pageSize - 1;
    q.range(from, to);
    return q;
  }, [debounced, page, pageSize, statusFilters, cleanFilters]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      // المحاولة الأساسية: استخدام العرض rooms_overview مع التصفية والترقيم على الخادم
      const q = buildRoomsQuery();
      const { data, error, count } = await q;
      if (error) throw error;
      if (data && data.length > 0) {
        setRooms(data);
        setTotalCount(count || data.length);
        // تم جلب البيانات بنجاح من rooms_overview، أوقف حالة التحميل
        setLoading(false);
        return;
      }
      // لو العرض موجود لكنه لا يُرجع شيئًا رغم وجود غرف في المبنى/الطوابق الجديدة، نكمل للفولبك
      console.warn('rooms_overview returned empty result, falling back to base tables');
    } catch (e) {
      console.warn('rooms_overview unavailable or failed, falling back to base tables:', e?.message || e);
    }

    // فallback: بناء قائمة الغرف يدويًا من الجداول الأساسية (rooms + room_types + buildings + floors)
    try {
      const [roomsRes, typesRes, buildingsRes, floorsRes] = await Promise.all([
        supabase.from('rooms').select('id, room_code, status, cleanliness, room_type_id, building_id, floor_id').order('room_code'),
        supabase.from('room_types_active').select('id, name, name_ar, base_price, max_guests').order('display_order'),
        supabase.from('buildings').select('id, name').order('name'),
        supabase.from('floors').select('id, name, floor_number, number, building_id').order('id'),
      ]);

      let types = typesRes.data || [];
      if (typesRes.error || types.length === 0) {
        try {
          const alt = await supabase.from('room_types').select('id, name, name_ar, base_price, max_guests').order('id');
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
        const nightly = t?.base_price || 0;
        return {
          id: r.id,
          room_code: r.room_code,
          room_label,
          status: r.status,
          cleanliness: r.cleanliness,
          max_guests: t?.max_guests || 0,
          room_type_name_ar: t?.name_ar,
          room_type_name_en: t?.name,
          computed_price: nightly,
          building_id: r.building_id,
          building_name,
          floor_id: r.floor_id,
          floor_name,
        };
      });

      // تطبيق نفس منطق البحث وتصفية الحالة والنظافة ولكن على العميل
      let base = enriched;

      const term = (debounced || '').trim().toLowerCase();
      if (term) {
        base = base.filter(r => (
          (r.room_code || '').toLowerCase().includes(term) ||
          (r.room_label || '').toLowerCase().includes(term)
        ));
      }

      const activeStatuses = Object.entries(statusFilters).filter(([,v])=>v).map(([k])=>k);
      if (activeStatuses.length > 0 && activeStatuses.length < 4) {
        base = base.filter(r => activeStatuses.includes(r.status));
      }

      const activeClean = Object.entries(cleanFilters).filter(([,v])=>v).map(([k])=>k);
      if (activeClean.length > 0 && activeClean.length < 3) {
        base = base.filter(r => activeClean.includes(r.cleanliness));
      }

      const total = base.length;
      const from = page * pageSize;
      const to = from + pageSize;
      const paged = base.slice(from, to);

      setRooms(paged);
      setTotalCount(total);
    } catch (e2) {
      console.error('Fallback loadRooms from base tables failed', e2);
      setRooms([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [buildRoomsQuery, debounced, page, pageSize, statusFilters, cleanFilters]);

  useEffect(() => {
    loadLookups();
    loadRooms();
  }, [loadLookups, loadRooms]);

  // Realtime: auto-refresh on rooms/reservations changes
  useEffect(() => {
    const channel = supabase.channel('rooms-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        loadRooms();
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch(_) {} };
  }, [loadRooms]);

  // debounce للبحث
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // إعادة الجلب عند تغيّر عوامل التصفية أو البحث أو الصفحة
  useEffect(() => {
    loadRooms();
  }, [loadRooms, debounced, statusFilters, cleanFilters, filterBuilding, filterFloor, page, pageSize]);

  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      if (filterBuilding !== 'all') {
        const bKey = String(r.building_id || r.building_name || '');
        if (bKey !== String(filterBuilding)) return false;
      }
      if (filterFloor !== 'all') {
        const fKey = String(r.floor_id || r.floor_name || '');
        if (fKey !== String(filterFloor)) return false;
      }
      return true;
    });
  }, [rooms, filterBuilding, filterFloor]);

  const counters = useMemo(() => {
    const total = filteredRooms.length;
    const available = filteredRooms.filter(r => r.status === 'available').length;
    const reserved = filteredRooms.filter(r => r.status === 'reserved').length;
    const occupied = filteredRooms.filter(r => r.status === 'occupied').length;
    const maintenance = filteredRooms.filter(r => r.status === 'maintenance').length;
    return { total, available, reserved, occupied, maintenance };
  }, [filteredRooms]);

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit = (room) => { setEditing(room); setShowModal(true); };

  const handleDelete = async (room) => {
    try {
      if (!canDeleteCore(currentUser)) {
        window.alert('لا تملك صلاحية حذف الغرف. هذه الصلاحية متاحة للمدير فقط.');
        return;
      }
      if (!room || !room.id) return;
      const confirmText = window.prompt('لتأكيد الحذف اكتب: ok', '');
      if (!confirmText || String(confirmText).trim().toLowerCase() !== 'ok') {
        window.alert('تم إلغاء الحذف.');
        return;
      }
      // سجل من قام بالحذف عبر updated_by قبل تنفيذ الحذف
      try {
        await supabase.from('rooms').update({ updated_by: currentUser?.id || null }).eq('id', room.id);
      } catch (_) {}
      const { error } = await supabase.from('rooms').delete().eq('id', room.id);
      if (error) throw error;
      await loadRooms();
    } catch (e) {
      console.error('Delete room failed', e);
      window.alert('تعذّر حذف الغرفة: ' + (e.message || e));
    }
  };

  const handleSave = async (payload) => {
    // payload من RoomModal: يحوي القيم المطلوبة فقط
    try {
      const cleaned = {
        building_id: payload.building_id,
        floor_id: payload.floor_id,
        room_type_id: payload.room_type_id,
        room_code: (payload.room_code || '').trim(),
        // دعم جداول لديها room_number إلزامي
        room_number: (payload.room_code || '').trim(),
        status: payload.status || 'available',
        cleanliness: payload.cleanliness || 'clean',
        description: payload.description || null,
        features: Array.isArray(payload.features)
          ? payload.features
          : String(payload.features || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
        image_url: payload.image_url || null,
      };

      if (editing && editing.id) {
        cleaned.updated_by = currentUser?.id || null;
      } else {
        cleaned.created_by = currentUser?.id || null;
      }

      const doSave = async () => {
        if (editing && editing.id) {
          return supabase.from('rooms').update(cleaned).eq('id', editing.id);
        } else {
          return supabase.from('rooms').insert([cleaned]);
        }
      };

      let { error } = await doSave();
      if (error) {
        const msg = String(error.message || error).toLowerCase();
        // لو العمود room_number غير موجود، نحذفه ونعيد المحاولة
        if (msg.includes('room_number') && msg.includes('does not exist')) {
          delete cleaned.room_number;
          const res2 = await doSave();
          error = res2.error;
        }
        // لو فشل بسبب عمود غير موجود آخر، نحذف الحقل ونحاول
        if (error) {
          const m2 = String(error.message || error).toLowerCase();
          ['view_id','room_view_id'].forEach(k => { if (m2.includes(k)) delete cleaned[k]; });
        }
        if (error) throw error;
      }
      setShowModal(false);
      await loadRooms();
    } catch (e) {
      console.error('Save room failed', e);
      window.alert('حصل خطأ أثناء حفظ الغرفة: ' + (e.message || e));
    }
  };

  const floorsForBuilding = useMemo(() => {
    if (filterBuilding === 'all') return floors;
    const filtered = floors.filter(f => String(f.building_id) === String(filterBuilding));
    return filtered.length > 0 ? filtered : floors;
  }, [floors, filterBuilding]);

  // خيارات الفلترة للمباني مبنية أساساً على الغرف نفسها، مع رجوع احتياطي لقائمة المباني الكاملة
  const buildingFilterOptions = useMemo(() => {
    const m = new Map();
    rooms.forEach(r => {
      const key = String(r.building_id || r.building_name || '');
      if (!key) return;
      if (!m.has(key)) m.set(key, r.building_name || 'مبنى');
    });
    const fromRooms = Array.from(m.entries()).map(([value, label]) => ({ value, label }));
    if (fromRooms.length > 0) return fromRooms;
    return buildings.map(b => ({ value: String(b.id), label: b.name }));
  }, [rooms, buildings]);

  // خيارات فلترة الطوابق تعتمد على كل الطوابق في المبنى المحدد،
  // حتى لو لم يكن لبعضها غرف بعد (لعرضها وعدم إخفائها)
  const floorFilterOptions = useMemo(() => {
    return floorsForBuilding.map(f => {
      const label = f.name || f.floor_name || (f.floor_number ? `الطابق ${f.floor_number}` : (f.number ? `الطابق ${f.number}` : `طابق #${f.id}`));
      return { value: String(f.id), label };
    });
  }, [floorsForBuilding]);

  const toggleStatus = (key) => setStatusFilters(s => ({ ...s, [key]: !s[key] }));
  const toggleClean = (key) => setCleanFilters(s => ({ ...s, [key]: !s[key] }));
  const resetFilters = () => {
    setStatusFilters({ available: true, reserved: true, occupied: true, maintenance: true });
    setCleanFilters({ clean: true, in_cleaning: true, needs_cleaning: true });
    setFilterBuilding('all');
    setFilterFloor('all');
    setSearch('');
    setPage(0);
  };

  const Chip = ({ active, color, label, count, onClick, title }) => (
    <button
      title={title}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm border ${active ? `bg-${color}-100 text-${color}-700 border-${color}-300` : 'bg-white text-gray-600 border-gray-200'} hover:bg-gray-100`}
    >
      <span className="ml-2">{label}</span>
      <span className={`px-2 py-[1px] rounded text-xs ${active ? `bg-${color}-200 text-${color}-800` : 'bg-gray-200 text-gray-700'}`}>{count}</span>
    </button>
  );

  const selectedCount = selected.size;
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = useMemo(() => {
    if (filteredRooms.length === 0) return false;
    return filteredRooms.every(r => selected.has(r.id));
  }, [filteredRooms, selected]);

  const toggleSelectAllVisible = (checked) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) {
        filteredRooms.forEach(r => next.add(r.id));
      } else {
        filteredRooms.forEach(r => next.delete(r.id));
      }
      return next;
    });
  };

      const bulkUpdate = async (field, value) => {
    if (selected.size === 0) return;
    try {
      const ids = Array.from(selected);
          const { error } = await supabase.from('rooms').update({ [field]: value, updated_by: currentUser?.id || null }).in('id', ids);
      if (error) throw error;
      setSelected(new Set());
      await loadRooms();
    } catch (e) {
      console.error('Bulk update failed', e);
      window.alert('تعذّر تنفيذ الإجراء الجماعي: ' + (e.message || e));
    }
  };

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة الغرف</h2>
          <p className="text-sm text-gray-500">نظام متكامل لإدارة الغرف مع العدّادات والتصفيات</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">إضافة غرفة جديدة +</button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4 text-center">
          <div className="text-sm text-gray-500">صيانة</div>
          <div className="text-2xl font-bold text-red-600">{counters.maintenance}</div>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <div className="text-sm text-gray-500">محجوزة</div>
          <div className="text-2xl font-bold text-amber-600">{counters.reserved}</div>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <div className="text-sm text-gray-500">مشغولة</div>
          <div className="text-2xl font-bold text-pink-600">{counters.occupied}</div>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <div className="text-sm text-gray-500">متاحة</div>
          <div className="text-2xl font-bold text-green-600">{counters.available}</div>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <div className="text-sm text-gray-500">إجمالي</div>
          <div className="text-2xl font-bold text-blue-600">{counters.total}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          className="border rounded px-3 py-2"
          value={filterBuilding}
          onChange={e=>{
            setFilterBuilding(e.target.value);
            // عند تغيير المبنى نعيد تعيين الطابق لتجنب تركيبة مبنى/طابق غير منسجمة
            setFilterFloor('all');
            setPage(0);
          }}
        >
          <option value="all">كل المباني</option>
          {buildingFilterOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-2"
          value={filterFloor}
          onChange={e=>{
            setFilterFloor(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">كل الطوابق</option>
          {floorFilterOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          className="border rounded px-3 py-2 flex-1 min-w-[180px]"
          placeholder="بحث: رقم/وصف الغرفة"
          value={search}
          onChange={e=>{ setSearch(e.target.value); setPage(0); }}
        />
        <button className="border rounded px-3 py-2 text-gray-700 hover:bg-gray-100" onClick={resetFilters}>إعادة ضبط</button>
      </div>

      {/* Smart filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Chip title="حالة: متاحة" active={statusFilters.available} color="green" label="متاحة" count={filteredRooms.filter(r=>r.status==='available').length} onClick={()=>toggleStatus('available')} />
        <Chip title="حالة: محجوزة" active={statusFilters.reserved} color="amber" label="محجوزة" count={filteredRooms.filter(r=>r.status==='reserved').length} onClick={()=>toggleStatus('reserved')} />
        <Chip title="حالة: مشغولة" active={statusFilters.occupied} color="pink" label="مشغولة" count={filteredRooms.filter(r=>r.status==='occupied').length} onClick={()=>toggleStatus('occupied')} />
        <Chip title="حالة: صيانة" active={statusFilters.maintenance} color="red" label="صيانة" count={filteredRooms.filter(r=>r.status==='maintenance').length} onClick={()=>toggleStatus('maintenance')} />
        <span className="mx-2 text-gray-400">|</span>
        <Chip title="نظافة: نظيفة" active={cleanFilters.clean} color="green" label="نظيفة" count={filteredRooms.filter(r=>r.cleanliness==='clean').length} onClick={()=>toggleClean('clean')} />
        <Chip title="نظافة: جاري تنظيف" active={cleanFilters.in_cleaning} color="amber" label="جاري تنظيف" count={filteredRooms.filter(r=>r.cleanliness==='in_cleaning').length} onClick={()=>toggleClean('in_cleaning')} />
        <Chip title="نظافة: تحتاج نظافة" active={cleanFilters.needs_cleaning} color="red" label="تحتاج نظافة" count={filteredRooms.filter(r=>r.cleanliness==='needs_cleaning').length} onClick={()=>toggleClean('needs_cleaning')} />
      </div>

      {/* Select all toolbar */}
      {!loading && filteredRooms.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e)=>toggleSelectAllVisible(e.target.checked)}
          />
          <span className="text-sm text-gray-700">تحديد الكل (العناصر الظاهرة)</span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-1 bg-gray-200" />
              <div className="px-4 pt-4 h-6 bg-gray-100 mb-2" />
              <div className="px-4 pb-4 space-y-2">
                <div className="h-4 bg-gray-100" />
                <div className="h-4 bg-gray-100 w-2/3" />
                <div className="h-4 bg-gray-100 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="p-6 bg-white rounded shadow flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold mb-1">لا توجد نتائج مطابقة</div>
            <div className="text-gray-600">جرّب تعديل عوامل البحث أو أضف غرفة جديدة.</div>
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">إضافة غرفة</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredRooms.map(r => (
            <RoomCard
              key={r.id}
              room={r}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r)}
              onSelect={() => toggleSelect(r.id)}
              selected={selected.has(r.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-600">النتائج: {rooms.length} / الإجمالي: {totalCount}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>السابق</button>
          <span className="text-sm">صفحة {page+1}</span>
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>p+1)} disabled={(page+1)*pageSize>=totalCount}>التالي</button>
          <select className="border rounded px-2 py-1" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(0); }}>
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 right-6 bg-white border shadow-lg rounded p-3 flex items-center gap-2" dir="rtl">
          <div className="text-sm text-gray-700">المحدد: {selectedCount}</div>
          <select className="border rounded px-2 py-1" onChange={e=>{ const v=e.target.value; if (v) bulkUpdate('status', v); e.target.value=''; }}>
            <option value="">تغيير الحالة...</option>
            <option value="available">متاحة</option>
            <option value="reserved">محجوزة</option>
            <option value="occupied">مشغولة</option>
            <option value="maintenance">صيانة</option>
          </select>
          <select className="border rounded px-2 py-1" onChange={e=>{ const v=e.target.value; if (v) bulkUpdate('cleanliness', v); e.target.value=''; }}>
            <option value="">تغيير النظافة...</option>
            <option value="clean">نظيفة</option>
            <option value="in_cleaning">جاري تنظيف</option>
            <option value="needs_cleaning">تحتاج نظافة</option>
          </select>
          <button className="border rounded px-2 py-1" onClick={()=>setSelected(new Set())}>إلغاء التحديد</button>
        </div>
      )}

      {showModal && (
        <RoomModal
          initialData={editing}
          buildings={buildings}
          floors={floors}
          roomTypes={roomTypes}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
