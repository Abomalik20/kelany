import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import RoomTypeCard from '../components/RoomTypeCard';
import RoomTypeModal from '../components/RoomTypeModal';
import { AuthContext } from '../App.jsx';
import { canDeleteCore } from '../utils/permissions';

export default function RoomTypes() {
  const currentUser = useContext(AuthContext);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_types_active')
        .select('*');
      if (error) throw error;
      setTypes(data || []);
    } catch (e) {
      console.error('Failed loading room types', e);
      setTypes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const seedDefaults = async () => {
    try {
      const defaults = [
        {
          code: 'SINGLE', name: 'Single Room', name_ar: 'غرفة مفردة', base_price: 500, max_guests: 1,
          features: ['WiFi','TV','AC','Minibar'], description: 'Standard single room with one bed', display_order: 10, is_active: true
        },
        {
          code: 'DOUBLE', name: 'Double Room', name_ar: 'غرفة مزدوجة', base_price: 800, max_guests: 2,
          features: ['WiFi','TV','AC','Minibar'], description: 'Standard double room with two beds', display_order: 20, is_active: true
        },
        {
          code: 'DELUXE', name: 'Deluxe Suite', name_ar: 'جناح ديلوكس', base_price: 2000, max_guests: 4,
          features: ['WiFi','TV','AC','Minibar'], description: 'Premium deluxe suite', display_order: 30, is_active: true
        },
        {
          code: 'TRIPLE', name: 'Triple Room', name_ar: 'غرفة ثلاثية', base_price: 1200, max_guests: 3,
          features: ['WiFi','TV','AC','Minibar'], description: 'Standard triple room', display_order: 40, is_active: true
        },
        {
          code: 'SUITE', name: 'Suite', name_ar: 'جناح', base_price: 1500, max_guests: 4,
          features: ['WiFi','TV','AC','Minibar'], description: 'Suite', display_order: 50, is_active: true
        },
      ];

      const codes = defaults.map(d => d.code);
      const { data: existing, error: err1 } = await supabase.from('room_types').select('code').in('code', codes);
      if (err1) throw err1;
      const existingCodes = (existing || []).map(r => (r.code || '').toUpperCase());
      const toInsert = defaults.filter(d => !existingCodes.includes((d.code || '').toUpperCase()));
      if (toInsert.length === 0) {
        window.alert('الأنواع الافتراضية موجودة بالفعل.');
        return;
      }
      const { error: err2 } = await supabase.from('room_types').insert(toInsert);
      if (err2) throw err2;
      await load();
      window.alert('تم إنشاء الأنواع الافتراضية بنجاح.');
    } catch (e) {
      console.error('Seeding defaults failed', e);
      window.alert('تعذّر إنشاء الأنواع الافتراضية: ' + (e.message || e));
    }
  };

  const handleCreate = () => { setEditing(null); setShowModal(true); };
  const handleEdit = (rt) => { setEditing(rt); setShowModal(true); };
  const handleDelete = async (rt) => {
    try {
      if (!canDeleteCore(currentUser)) {
        window.alert('لا تملك صلاحية حذف أنواع الغرف. هذه الصلاحية متاحة للمدير فقط، وسيتم لاحقًا تنظيم صلاحيات أكثر تفصيلاً.');
        return;
      }
      if (!rt || !rt.id) return;
      const confirmText = window.prompt('لتأكيد الحذف اكتب: ok', '');
      if (!confirmText || String(confirmText).trim().toLowerCase() !== 'ok') {
        window.alert('تم إلغاء الحذف.');
        return;
      }
      // سجّل من قام بالحذف قبل التنفيذ
      try {
        await supabase.from('room_types').update({ updated_by: currentUser?.id || null }).eq('id', rt.id);
      } catch (_) {}
      const { error } = await supabase.from('room_types').delete().eq('id', rt.id);
      if (error) throw error;
      await load();
    } catch (e) {
      console.error('Failed deleting room type', e);
      const msg = String(e?.message || e || '').toLowerCase();
      if (msg.includes('foreign') || msg.includes('constraint') || msg.includes('violat')) {
        try {
          const { error: err2 } = await supabase.from('room_types').update({ is_active: false, updated_by: currentUser?.id || null }).eq('id', rt.id);
          if (err2) throw err2;
          await load();
          window.alert('تعذّر الحذف بسبب ارتباطات، تم إخفاؤه (غير نشط).');
        } catch (e2) {
          console.error('Soft-hide failed', e2);
          window.alert('تعذّر حذف/إخفاء النوع: ' + (e2.message || e2));
        }
      } else {
        window.alert('حصل خطأ أثناء الحذف: ' + (e.message || e));
      }
    }
  };

  const handleSave = async (payload) => {
    try {
      const name = (payload.name || '').trim();
      const code = (payload.code || '').trim();
      const basePrice = Number(payload.base_price);
      const maxGuests = Number(payload.max_guests);

      // تحقق من الحقول الأساسية قبل الحفظ
      if (!name || !code || !basePrice || !maxGuests) {
        window.alert('يرجى تعبئة الحقول الأساسية: الاسم، الرمز، السعر الأساسي، والحد الأقصى للنزلاء.');
        return;
      }

      // تحقق فوري من تكرار الكود (بدون حساسية لحالة الحروف)
      const normalizedCode = code.toLowerCase();
      const hasDuplicateCode = types.some(t => {
        if (!t || !t.code) return false;
        // تجاهل السجل الجاري تعديله
        if (editing && editing.id && t.id === editing.id) return false;
        return String(t.code).toLowerCase() === normalizedCode;
      });
      if (hasDuplicateCode) {
        window.alert('كود نوع الغرفة مستخدم بالفعل لنوع غرفة آخر. يرجى اختيار كود مختلف (النظام لا يفرّق بين الحروف الكبيرة والصغيرة).');
        return;
      }

      const cleaned = {
        code,
        name,
        name_ar: payload.name_ar?.trim() || null,
        base_price: basePrice,
        max_guests: maxGuests,
        features: Array.isArray(payload.features) ? payload.features : (payload.features || '').split(',').map(s=>s.trim()).filter(Boolean),
        description: payload.description?.trim() || null,
        display_order: payload.display_order != null && payload.display_order !== '' ? Number(payload.display_order) : null,
        is_active: payload.is_active !== undefined ? !!payload.is_active : true,
      };

      if (editing && editing.id) {
        cleaned.updated_by = currentUser?.id || null;
      } else {
        cleaned.created_by = currentUser?.id || null;
      }

      if (editing && editing.id) {
        const { error } = await supabase.from('room_types').update(cleaned).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('room_types').insert([cleaned]);
        if (error) throw error;
      }
      setShowModal(false);
      load();
    } catch (e) {
      console.error('Failed saving room type', e);
      const msg = String(e?.message || e || '').toLowerCase();
      if (msg.includes('room_types_code_unique_ci') || msg.includes('duplicate key') || msg.includes('unique constraint')) {
        window.alert('تعذّر حفظ نوع الغرفة: كود النوع مستخدم بالفعل لنوع غرفة أخرى (التحقق يتم بدون حساسية لحالة الحروف). يرجى اختيار كود مختلف.');
      } else {
        window.alert('حصل خطأ أثناء حفظ نوع الغرفة: ' + (e.message || e));
      }
    }
  };

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">أنواع الغرف</h2>
          <p className="text-sm text-gray-500">إدارة الأنواع وتصنيفات الغرف والأسعار</p>
        </div>
        <div className="flex gap-3">
          <button onClick={seedDefaults} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">إنشاء الأنواع الافتراضية</button>
          <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">إضافة نوع جديد +</button>
        </div>
      </div>

      {loading ? (
        <div>تحميل...</div>
      ) : types.length === 0 ? (
        <div className="p-6 bg-white rounded shadow">لا توجد أنواع غرف بعد. اضغط "إضافة نوع جديد" لإنشاء أول نوع.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
          {types.map(t => (
            <RoomTypeCard key={t.id} type={t} onEdit={() => handleEdit(t)} onDelete={() => handleDelete(t)} />
          ))}
        </div>
      )}

      {showModal && (
        <RoomTypeModal initialData={editing} onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
    </div>
  );
}
