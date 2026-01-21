import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import BuildingCard from '../components/BuildingCard';
import BuildingModal from '../components/BuildingModal';
import { AuthContext } from '../App.jsx';
import { canDeleteCore } from '../utils/permissions';

export default function Buildings() {
  const currentUser = useContext(AuthContext);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buildings_with_floor_count')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];

      // For each building attempt to fetch total rooms count (safe fallback)
      const withCounts = await Promise.all(rows.map(async (b) => {
        let totalRooms = 0;
        let availableRooms = 0;
        try {
          const tr = await supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('building_id', b.id);
          if (!tr.error) totalRooms = tr.count || 0;
        } catch (e) {}
        try {
          const ar = await supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('building_id', b.id).eq('is_available', true);
          if (!ar.error) availableRooms = ar.count || 0;
        } catch (e) {}
        return { ...b, total_rooms: totalRooms, available_rooms: availableRooms };
      }));

      setBuildings(withCounts);
    } catch (err) {
      console.error('Failed loading buildings', err);
      setBuildings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const handleEdit = (building) => {
    setEditing(building);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!canDeleteCore(currentUser)) {
      window.alert('لا تملك صلاحية حذف المباني. هذه الصلاحية متاحة للمدير فقط.');
      return;
    }
    if (!window.confirm('هل ترغب حقاً بحذف هذا المبنى؟')) return;
    const updatePayload = { is_deleted: true };
    if (currentUser && currentUser.id) {
      updatePayload.updated_by = currentUser.id;
    }
    await supabase.from('buildings').update(updatePayload).eq('id', id);
    load();
  };

  const handleSave = async (payload) => {
    try {
      // لا نرسل floors_count مباشرة لجدول المباني حتى لا يحدث خطأ لو العمود غير موجود في الـ DB
      const { floors_count, ...buildingFields } = payload || {};
      let buildingRecord = null;
      if (buildingFields.id) {
        if (currentUser && currentUser.id) {
          buildingFields.updated_by = currentUser.id;
        }
        const { error: updErr } = await supabase.from('buildings').update(buildingFields).eq('id', buildingFields.id);
        if (updErr) throw updErr;
        const { data: bdata, error: getErr } = await supabase.from('buildings').select('*').eq('id', buildingFields.id).single();
        if (getErr) throw getErr;
        buildingRecord = bdata;
      } else {
        if (currentUser && currentUser.id) {
          buildingFields.created_by = currentUser.id;
        }
        const { data: inserted, error: insertErr } = await supabase.from('buildings').insert([buildingFields]).select().single();
        if (insertErr) throw insertErr;
        buildingRecord = inserted;
      }

      // If floors_count provided, ensure floors exist for this building
      const floorsCount = Number(floors_count) || 0;
      console.log('handleSave: floors_count=', floors_count, 'floorsCount=', floorsCount, 'buildingRecord=', buildingRecord);
      if (buildingRecord && floorsCount > 0) {
        // fetch existing floor numbers
        const { data: existingFloors = [] } = await supabase.from('floors').select('floor_number').eq('building_id', buildingRecord.id);
        const existingSet = new Set(existingFloors.map(f => Number(f.floor_number)));
        const toInsert = [];
        for (let i = 1; i <= floorsCount; i++) {
          if (!existingSet.has(i)) {
            // insert minimal fields to avoid schema mismatch (don't assume 'name' column exists)
            toInsert.push({ building_id: buildingRecord.id, floor_number: i });
          }
        }
        console.log('Floors to insert:', toInsert.length, toInsert);
        if (toInsert.length) {
          const { error: floorsErr } = await supabase.from('floors').insert(toInsert);
          if (floorsErr) {
            console.error('Failed creating floors', floorsErr);
            window.alert('حصل خطأ أثناء إنشاء الطوابق: ' + (floorsErr.message || floorsErr));
          } else {
            console.log('Inserted floors count (requested):', toInsert.length);
            window.alert('تم إنشاء ' + toInsert.length + ' طابق/طوابق للمبنى بنجاح.');
          }
        } else {
          console.log('No new floors to insert');
        }
      }

    } catch (e) {
      console.error('Failed saving building', e);
      try {
        const msg = e && e.message ? e.message : JSON.stringify(e);
        window.alert('حصل خطأ أثناء حفظ المبنى: ' + msg);
      } catch (_) {}
    }
    setShowModal(false);
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة المباني</h2>
          <p className="text-sm text-gray-500">إدارة مباني وطوابق الفندق</p>
        </div>
        <div>
          <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">إضافة مبنى جديد +</button>
        </div>
      </div>

      {loading ? (
        <div>تحميل...</div>
      ) : buildings.length === 0 ? (
        <div className="p-6 bg-white rounded shadow">لا توجد مبانٍ بعد. اضغط "إضافة مبنى جديد" لإنشاء أول مبنى.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {buildings.map((b) => (
            <BuildingCard key={b.id} building={b} onEdit={() => handleEdit(b)} onDelete={() => handleDelete(b.id)} />
          ))}
        </div>
      )}

      {showModal && (
        <BuildingModal initialData={editing} onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
    </div>
  );
}
