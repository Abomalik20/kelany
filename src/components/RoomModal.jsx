import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function RoomModal({ initialData, buildings, floors, roomTypes, onClose, onSave }) {
  const [building_id, setBuilding] = useState(initialData?.building_id || '');
  const [floor_id, setFloor] = useState(initialData?.floor_id || '');
  const [room_type_id, setRoomType] = useState(initialData?.room_type_id || '');
  const [room_code, setRoomCode] = useState(initialData?.room_code || '');
  const [status, setStatus] = useState(initialData?.status || 'available');
  const [cleanliness, setCleanliness] = useState(initialData?.cleanliness || 'clean');
  const [description, setDescription] = useState(initialData?.description || '');
  const [featuresText, setFeaturesText] = useState(() => {
    const feats = Array.isArray(initialData?.features) ? initialData.features : [];
    return feats.join(', ');
  });
  const [image_url, setImageUrl] = useState(initialData?.image_url || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // إذا كان floor_id مرتبط بمبنى مختلف، نضبط المبنى تلقائياً
    if (floor_id && !building_id) {
      const f = floors.find(fl => String(fl.id) === String(floor_id));
      if (f) setBuilding(f.building_id);
    }
  }, [floor_id, building_id, floors]);

  const floorsForBuilding = useMemo(() => {
    if (!building_id) return floors;
    const filtered = floors.filter(f => String(f.building_id) === String(building_id));
    return filtered.length > 0 ? filtered : floors; // لو فشل الربط بسبب اختلاف أنواع المعرفات، نعرض كل الطوابق
  }, [floors, building_id]);

  const uploadImage = async (file) => {
    try {
      if (!file) return;
      const ext = file.name.split('.').pop();
      const path = `room-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('room-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('room-images').getPublicUrl(path);
      setImageUrl(data?.publicUrl || path);
    } catch (e) {
      console.error('Upload failed', e);
      window.alert('تعذّر رفع الصورة: ' + (e.message || e));
    }
  };

  const validate = () => {
    const e = {};
    if (!building_id) e.building_id = 'اختر المبنى.';
    if (!floor_id) e.floor_id = 'اختر الطابق.';
    if (!room_type_id) e.room_type_id = 'اختر نوع الغرفة.';
    if (!room_code || String(room_code).trim().length === 0) e.room_code = 'اكتب رقم/رمز الغرفة.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        building_id,
        floor_id,
        room_type_id,
        room_code,
        status,
        cleanliness,
        description,
        features: featuresText,
        image_url,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
        <div className="px-6 py-4 border-b">
          <h3 className="text-xl font-bold">{initialData ? 'تعديل الغرفة' : 'إضافة غرفة جديدة'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm">المبنى *</label>
              <select className="mt-1 border rounded w-full px-3 py-2" value={building_id} onChange={e=>{ setBuilding(e.target.value); setErrors(prev=>({ ...prev, building_id: undefined })); }}>
                <option value="">اختر المبنى</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {errors.building_id && <div className="text-red-600 text-xs mt-1">{errors.building_id}</div>}
            </div>
            <div>
              <label className="text-sm">الطابق *</label>
              <select className="mt-1 border rounded w-full px-3 py-2" value={floor_id} onChange={e=>{ setFloor(e.target.value); setErrors(prev=>({ ...prev, floor_id: undefined })); }}>
                <option value="">اختر الطابق</option>
                {floorsForBuilding.map(f => {
                  const label = f.name || f.floor_name || (f.floor_number ? `الطابق ${f.floor_number}` : (f.number ? `الطابق ${f.number}` : `طابق #${f.id}`));
                  return <option key={f.id} value={f.id}>{label}</option>;
                })}
              </select>
              {errors.floor_id && <div className="text-red-600 text-xs mt-1">{errors.floor_id}</div>}
            </div>
            <div>
              <label className="text-sm">نوع الغرفة *</label>
              <select className="mt-1 border rounded w-full px-3 py-2" value={room_type_id} onChange={e=>{ setRoomType(e.target.value); setErrors(prev=>({ ...prev, room_type_id: undefined })); }}>
                <option value="">اختر النوع</option>
                {roomTypes.map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.name_ar} ({Number(rt.base_price)} جنيه)</option>
                ))}
              </select>
              {errors.room_type_id && <div className="text-red-600 text-xs mt-1">{errors.room_type_id}</div>}
            </div>
            <div>
              <label className="text-sm">رقم الغرفة *</label>
              <div className="flex gap-2">
                <input className="mt-1 border rounded w-full px-3 py-2" value={room_code} onChange={e=>{ setRoomCode(e.target.value); setErrors(prev=>({ ...prev, room_code: undefined })); }} placeholder="A101" />
              </div>
              {errors.room_code && <div className="text-red-600 text-xs mt-1">{errors.room_code}</div>}
            </div>
            <div>
              <label className="text-sm">الحالة *</label>
              <select className="mt-1 border rounded w-full px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="available">متاحة</option>
                <option value="reserved">محجوزة</option>
                <option value="occupied">مشغولة</option>
                <option value="maintenance">صيانة</option>
              </select>
            </div>
            <div>
              <label className="text-sm">حالة النظافة *</label>
              <select className="mt-1 border rounded w-full px-3 py-2" value={cleanliness} onChange={e=>setCleanliness(e.target.value)}>
                <option value="clean">نظيفة</option>
                <option value="in_cleaning">جاري تنظيف</option>
                <option value="needs_cleaning">تحتاج نظافة</option>
              </select>
            </div>
            <div>
              <label className="text-sm">الوصف</label>
              <textarea className="mt-1 border rounded w-full px-3 py-2" rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="وصف إضافي..." />
            </div>
            <div>
              <label className="text-sm">المميزات</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={featuresText} onChange={e=>setFeaturesText(e.target.value)} placeholder="WiFi، تلفاز، تكييف، ميني بار" />
            </div>
            <div>
              <label className="text-sm">صورة الغرفة</label>
              <div className="mt-1 flex items-center gap-3">
                <input className="border rounded px-3 py-2 flex-1" value={image_url} onChange={e=>setImageUrl(e.target.value)} placeholder="رابط الصورة (اختياري)" />
                <label className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded cursor-pointer">
                  رفع ملف
                  <input type="file" className="hidden" onChange={(e)=>uploadImage(e.target.files?.[0])} />
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm">السعر المحسوب</label>
              <div className="mt-1 border rounded w-full px-3 py-2 bg-green-50 text-green-700">
                {(() => {
                  const rt = roomTypes.find(r=>String(r.id)===String(room_type_id));
                  const price = Number(rt?.base_price || 0);
                  return `${price} جنيه/ليلة`;
                })()}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">إلغاء</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
