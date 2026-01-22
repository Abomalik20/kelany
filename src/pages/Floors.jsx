import React, { useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import RoomCard from '../components/RoomCard';
import FloorModal from '../components/FloorModal';
import { AuthContext } from '../App.jsx';
import { canDeleteCore } from '../utils/permissions';
import { HotelIcon, RoomsTotalIcon, RoomsAvailableIcon, RoomsReservedIcon, RoomsOccupiedIcon, RoomsMaintenanceIcon, MaintenanceIcon } from '../components/Icons';

export default function Floors() {
  const currentUser = useContext(AuthContext);
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);

  const loadBuildings = useCallback(async () => {
    const { data, error } = await supabase.from('buildings').select('*').order('created_at', { ascending: false });
    if (!error) {
      setBuildings(data || []);
      if (!selectedBuilding && data && data.length) setSelectedBuilding(data[0]);
    }
  }, [selectedBuilding]);

  const loadData = useCallback(async (buildingId) => {
    setLoading(true);
    try {
      const { data: fdata, error: ferr } = await supabase
        .from('building_floor_overview')
        .select('*')
        .eq('building_id', buildingId)
        .order('floor_number', { ascending: true });
      let mergedFloors = fdata || [];

      // Also fetch the raw floors rows to get any new columns (name, maintenance_note, capacity, needs_inspection)
      try {
        const { data: tableFloors, error: tfErr } = await supabase.from('floors').select('*').eq('building_id', buildingId);
        if (!tfErr && tableFloors) {
          // build map by id and by floor_number
          const byId = new Map(tableFloors.map(r => [String(r.id), r]));
          const byNumber = new Map(tableFloors.map(r => [String(r.floor_number), r]));

          mergedFloors = (mergedFloors || []).map(f => {
            const tableRow = (f.floor_id && byId.has(String(f.floor_id))) ? byId.get(String(f.floor_id)) : (byNumber.has(String(f.floor_number)) ? byNumber.get(String(f.floor_number)) : null);
            if (tableRow) {
              return {
                ...f,
                // prefer table values for new fields
                floor_id: tableRow.id || f.floor_id,
                floor_number: tableRow.floor_number ?? f.floor_number,
                floor_name: tableRow.floor_name ?? tableRow.name ?? f.floor_name,
                name: tableRow.name ?? f.name,
                status: tableRow.status ?? f.status,
                description: tableRow.description ?? f.description,
                maintenance_note: tableRow.maintenance_note ?? f.maintenance_note,
                capacity: tableRow.capacity ?? f.capacity,
                needs_inspection: tableRow.needs_inspection ?? f.needs_inspection,
              };
            }
            return f;
          });

          // include any table rows that are not present in the view
          const existingIds = new Set((mergedFloors || []).map(x => String(x.floor_id || x.id)));
          for (const tr of tableFloors) {
            if (!existingIds.has(String(tr.id))) {
              mergedFloors.push({
                floor_id: tr.id,
                building_id: tr.building_id,
                floor_number: tr.floor_number,
                floor_name: tr.floor_name ?? tr.name,
                name: tr.name,
                status: tr.status,
                description: tr.description,
                maintenance_note: tr.maintenance_note,
                capacity: tr.capacity,
                needs_inspection: tr.needs_inspection,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed fetching raw floors rows', e);
      }

      if (!ferr) setFloors(mergedFloors || []);

      const { data: rdata, error: rerr } = await supabase
        .from('rooms_by_floor')
        .select('*')
        .eq('building_id', buildingId)
        .order('room_code', { ascending: true });
      if (!rerr) setRooms(rdata || []);
    } catch (e) {
      console.error(e);
      setFloors([]);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);

  useEffect(() => {
    if (selectedBuilding) loadData(selectedBuilding.id);
  }, [selectedBuilding, loadData]);

  // الانتقال إلى شاشة الغرف مع تمرير معرّف الطابق (floor_id) وليس رقم الطابق
  const goToAddRooms = (buildingId, floorId) => {
    const url = `/rooms?building=${buildingId}&floor=${floorId}`;
    try { window.location.href = url; } catch (e) { console.log('navigate', url); }
  };

  const handleDeleteRoom = async (room) => {
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
      // تسجيل من قام بحذف الغرفة عبر updated_by قبل الحذف
      try {
        await supabase.from('rooms').update({ updated_by: currentUser?.id || null }).eq('id', room.id);
      } catch (_) {}
      const { error } = await supabase.from('rooms').delete().eq('id', room.id);
      if (error) throw error;
      const bId = room.building_id || (selectedBuilding && selectedBuilding.id);
      if (bId) await loadData(bId);
    } catch (e) {
      console.error('Delete room from Floors failed', e);
      window.alert('تعذّر حذف الغرفة: ' + (e.message || e));
    }
  };

  const handleEditFloor = async (floor) => {
    console.log('handleEditFloor - floor:', floor);
    // fetch full row from floors table to populate modal with all fields
    try {
      if (floor.floor_id) {
        const { data: full, error: fullErr } = await supabase.from('floors').select('*').eq('id', floor.floor_id).single();
        if (!fullErr && full) {
          setEditingFloor({ ...floor, ...full });
        } else {
          console.warn('Could not fetch full floor row, using view row', fullErr);
          setEditingFloor(floor);
        }
      } else {
        setEditingFloor(floor);
      }
    } catch (e) {
      console.warn('Error fetching full floor row', e);
      setEditingFloor(floor);
    }
    setShowFloorModal(true);
  };

  const handleSaveFloor = async (payload) => {
    console.group('handleSaveFloor');
    console.log('payload:', payload);
    try {
      const id = payload.id;
      if (!id) throw new Error('Missing floor id');

      // Build a bulk update payload with all editable fields
      const updatePayload = {};
      if (payload.status !== undefined) updatePayload.status = payload.status;
      if (payload.description !== undefined) updatePayload.description = payload.description;
      if (payload.name !== undefined) updatePayload.name = payload.name;
      if (payload.maintenance_note !== undefined) updatePayload.maintenance_note = payload.maintenance_note;
      if (payload.capacity !== undefined && payload.capacity !== null) updatePayload.capacity = Number(payload.capacity);
      if (payload.needs_inspection !== undefined) updatePayload.needs_inspection = Boolean(payload.needs_inspection);
      // من قام بالتعديل على الطابق
      updatePayload.updated_by = currentUser?.id || null;

      console.log('Attempting bulk update with payload:', updatePayload);

      // Try updating; if the DB complains about a missing column, remove it from payload and retry.
      let attempts = 0;
      // TODO: قد نستخدم lastResult لاحقًا لمتابعة نتيجة آخر تحديث
      // let lastResult = null;
      while (attempts < 6) {
        attempts += 1;
        const res = await supabase.from('floors').update(updatePayload).eq('id', id);
        console.log('bulk update attempt', attempts, res);
        if (!res.error) {
          // lastResult = res;
          break;
        }
        // lastResult = res;
        const em = (res.error.message || '').toLowerCase();
        // تم تصحيح regex لإزالة الـ backslash غير الضروري
        const colMatch = em.match(/column "([^"]+)"/);
        if (colMatch && colMatch[1]) {
          const col = colMatch[1];
          if (updatePayload.hasOwnProperty(col)) {
            console.warn('Removing column from payload and retrying:', col);
            delete updatePayload[col];
            continue;
          }
        }
        // try other message format
        const m2 = em.match(/could not find the '([^']+)'/);
        if (m2 && m2[1] && updatePayload.hasOwnProperty(m2[1])) {
          console.warn('Removing column (alt message) from payload and retrying:', m2[1]);
          delete updatePayload[m2[1]];
          continue;
        }
        // otherwise cannot recover
        throw res.error;
      }

      // fetch the updated floor row for verification
      try {
        const { data: refData, error: refErr } = await supabase.from('floors').select('*').eq('id', id).single();
        console.log('Refetched floor row:', { refData, refErr });
        if (!refErr && refData) {
          setFloors(prev => prev.map(fl => {
            // view rows use `floor_id` whereas table has `id`
            if ((fl.floor_id && String(fl.floor_id) === String(refData.id)) || (fl.id && String(fl.id) === String(refData.id))) {
                return {
                  ...fl,
                  floor_id: refData.id,
                  floor_number: refData.floor_number ?? fl.floor_number,
                  floor_name: refData.floor_name ?? refData.name ?? fl.floor_name,
                  name: refData.name ?? fl.name,
                  status: refData.status ?? fl.status,
                  description: refData.description ?? fl.description,
                  maintenance_note: refData.maintenance_note ?? fl.maintenance_note,
                  capacity: refData.capacity ?? fl.capacity,
                  needs_inspection: refData.needs_inspection ?? fl.needs_inspection,
                };
            }
            return fl;
          }));
        }
      } catch (re) {
        console.warn('Failed refetching floor row', re);
      }

      setShowFloorModal(false);
      if (selectedBuilding) loadData(selectedBuilding.id);
    } catch (e) {
      console.error('Failed saving floor', e);
      // show more details to the user so they can paste the error
      try {
        const msg = e && e.message ? e.message : JSON.stringify(e);
        window.alert('حصل خطأ أثناء حفظ الطابق: ' + msg);
      } catch (ae) {
        window.alert('حصل خطأ أثناء حفظ الطابق. فتح الـ Console لمزيد من التفاصيل.');
      }
    }
    console.groupEnd();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-400">
            <HotelIcon className="w-12 h-12" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">إدارة الطوابق</h2>
            <p className="text-sm text-gray-500">عرض وطباعة طوابق وغرف المبنى{selectedBuilding ? ` — ${selectedBuilding.name}` : ''}</p>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <div className="flex gap-4 overflow-auto">
          {buildings.map((b) => (
            <button key={b.id}
              onClick={() => setSelectedBuilding(b)}
              className={`min-w-[160px] p-4 rounded shadow flex flex-col items-start justify-center ${selectedBuilding && selectedBuilding.id === b.id ? 'border-2 border-blue-400 bg-white' : 'bg-white/80'}`}>
              <div className="text-sm text-gray-500">مبنى {b.code}</div>
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs mt-2 inline-flex items-center gap-2">
                {b.status === 'maintenance' ? (
                  <span className="px-2 py-1 rounded text-yellow-800 bg-yellow-100">صيانة</span>
                ) : b.status === 'inactive' ? (
                  <span className="px-2 py-1 rounded text-gray-700 bg-gray-100">غير نشط</span>
                ) : (
                  <span className="px-2 py-1 rounded text-white bg-green-500">نشط</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Summary boxes */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          {(() => {
            // aggregate counts from floors
            const totals = floors.reduce((acc, f) => {
              acc.total += Number(f.total_rooms || 0);
              acc.available += Number(f.available_rooms || 0);
              acc.occupied += Number(f.occupied_rooms || 0);
              acc.reserved += Number(f.reserved_rooms || 0);
              acc.maintenance += Number(f.maintenance_rooms || 0);
              return acc;
            }, { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 });
            return [
              { key: 'total', label: 'إجمالي الغرف', value: totals.total, color: 'bg-white', iconBg: 'bg-indigo-100 text-indigo-700', icon: <RoomsTotalIcon className="w-8 h-8" /> },
              { key: 'available', label: 'متاحة', value: totals.available, color: 'bg-green-50', iconBg: 'bg-green-100 text-green-700', icon: <RoomsAvailableIcon className="w-8 h-8" /> },
              { key: 'reserved', label: 'محجوزة', value: totals.reserved, color: 'bg-amber-50', iconBg: 'bg-amber-100 text-amber-700', icon: <RoomsReservedIcon className="w-8 h-8" /> },
              { key: 'occupied', label: 'مشغولة', value: totals.occupied, color: 'bg-rose-50', iconBg: 'bg-rose-100 text-rose-700', icon: <RoomsOccupiedIcon className="w-8 h-8" /> },
              { key: 'maintenance', label: 'صيانة', value: totals.maintenance, color: 'bg-yellow-50', iconBg: 'bg-yellow-100 text-yellow-700', icon: <RoomsMaintenanceIcon className="w-8 h-8" /> },
            ].map(box => (
              <div key={box.key} className={`p-4 rounded shadow ${box.color}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">{box.label}</div>
                    <div className="text-2xl font-bold mt-1">{box.value}</div>
                  </div>
                  <div className={`p-2 rounded-full ${box.iconBg}`}>
                    {box.icon}
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {loading ? (
        <div>تحميل...</div>
      ) : (
        <div className="space-y-6">
          {floors.length === 0 ? (
            <div className="p-6 bg-white rounded shadow">لا توجد طوابق لعرضها في هذا المبنى.</div>
          ) : (
            floors.map((f) => (
              <section key={f.floor_id} className="bg-white rounded shadow">
                <div
                  className="p-4 flex items-center justify-between"
                  style={
                    f.status === 'maintenance'
                      ? { background: 'linear-gradient(90deg,#ff416c,#ff4b2b)' }
                      : f.status === 'inactive'
                      ? { background: 'linear-gradient(90deg,#757f9a,#d7dde8)' }
                      : { background: 'linear-gradient(90deg,#6a11cb,#2575fc)' }
                  }
                >
                  <div className="text-white">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold">{f.floor_name || f.name || `الطابق ${f.floor_number}`}</div>
                      {f.status === 'maintenance' && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs">
                          <MaintenanceIcon className="w-4 h-4" />
                          <span>صيانة</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm opacity-90">{f.total_rooms} إجمالي · {f.available_rooms} متاحة · {f.occupied_rooms} مشغولة</div>
                    { (f.description) && (
                      <div className="text-xs opacity-90 mt-1">{f.description}</div>
                    ) }
                    { (f.maintenance_note) && (
                      <div className="text-xs opacity-90 mt-1">ملاحظة: {f.maintenance_note}</div>
                    ) }
                    { (f.capacity !== undefined && f.capacity !== null) && (
                      <div className="text-xs opacity-90 mt-1">سعة: {f.capacity}</div>
                    ) }
                  </div>
                  <div className="text-white text-sm flex items-center gap-3">
                    <button onClick={() => handleEditFloor(f)} className="bg-white/20 px-3 py-1 rounded text-white">تعديل الطابق</button>
                    <button onClick={() => goToAddRooms(f.building_id, f.floor_id)} className="bg-white/10 px-3 py-1 rounded text-white border border-white/40">إضافة غرفة</button>
                    <div>{selectedBuilding && selectedBuilding.name}</div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex gap-4 overflow-x-auto">
                    {rooms.filter(r => r.floor_id === f.floor_id).length === 0 ? (
                      <div className="w-full py-8 text-center">
                        <div className="text-gray-400 mb-4">لا توجد غرف في هذا الطابق</div>
                        <button onClick={() => goToAddRooms(f.building_id, f.floor_id)} className="bg-blue-600 text-white px-4 py-2 rounded">إضافة غرف</button>
                      </div>
                    ) : (
                      rooms.filter(r => r.floor_id === f.floor_id).map((r) => (
                        <RoomCard
                          key={r.id}
                          room={r}
                          onEdit={() => goToAddRooms(r.building_id, r.floor_id)}
                          onDelete={() => handleDeleteRoom(r)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </section>
            ))
          )}

          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">مخطط المبنى الكامل</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="p-2">الطابق</th>
                    <th className="p-2">عدد الغرف</th>
                    <th className="p-2">متاحة</th>
                    <th className="p-2">مشغولة</th>
                    <th className="p-2">محجوزة</th>
                    <th className="p-2">صيانة</th>
                    <th className="p-2">معدل الاشغال</th>
                  </tr>
                </thead>
                <tbody>
                  {floors.map((f) => (
                    <tr key={f.floor_id} className="border-t">
                      <td className="p-2">الطابق {f.floor_number}</td>
                      <td className="p-2">{f.total_rooms}</td>
                      <td className="p-2 text-green-600">{f.available_rooms}</td>
                      <td className="p-2 text-red-600">{f.occupied_rooms}</td>
                      <td className="p-2 text-yellow-600">{f.reserved_rooms}</td>
                      <td className="p-2">{f.maintenance_rooms}</td>
                      <td className="p-2">{Math.round((f.occupancy_rate || 0) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {showFloorModal && (
        <FloorModal
          initialData={editingFloor}
          onClose={() => setShowFloorModal(false)}
          onSave={handleSaveFloor}
        />
      )}
    </div>
  );
}
