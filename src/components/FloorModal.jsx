import React, { useEffect, useState } from 'react';

export default function FloorModal({ initialData = null, onClose, onSave }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('active');
  const [description, setDescription] = useState('');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [capacity, setCapacity] = useState('');
  const [needsInspection, setNeedsInspection] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.floor_name || initialData.name || ('الطابق ' + (initialData.floor_number || '')));
      setStatus(initialData.status || 'active');
      setDescription(initialData.description || '');
      setMaintenanceNote(initialData.maintenance_note || '');
      setCapacity(initialData.capacity !== undefined && initialData.capacity !== null ? String(initialData.capacity) : '');
      setNeedsInspection(Boolean(initialData.needs_inspection));
    }
  }, [initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      id: initialData.floor_id || initialData.id,
      name: name || null,
      status: status,
      description: description || null,
      maintenance_note: maintenanceNote || null,
      capacity: capacity === '' ? null : Number(capacity),
      needs_inspection: needsInspection,
    };
    onSave && onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-lg mt-12">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">تعديل طابق</h3>
          <button onClick={onClose} className="text-gray-500">إغلاق ✖</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">رقم الطابق</label>
            <input value={initialData?.floor_number || ''} disabled className="w-full border rounded px-3 py-2 bg-gray-50" />
          </div>
          <div>
            <label className="block text-sm mb-1">اسم الطابق</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm mb-1">الحالة</label>
            <select value={status} onChange={(e)=>setStatus(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="maintenance">صيانة</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">سعة الطابق (عدد الغرف)</label>
            <input value={capacity} onChange={(e)=>setCapacity(e.target.value)} type="number" className="w-full border rounded px-3 py-2" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm mb-1">ملاحظة الصيانة</label>
            <input value={maintenanceNote} onChange={(e)=>setMaintenanceNote(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm mb-1">الوصف</label>
            <textarea value={description} onChange={(e)=>setDescription(e.target.value)} className="w-full border rounded px-3 py-2 h-28" />
          </div>

          <div className="col-span-2 flex items-center gap-4 mt-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={needsInspection} onChange={(e)=>setNeedsInspection(e.target.checked)} />
              <span className="text-sm">يحتاج فحص</span>
            </label>
          </div>

          <div className="col-span-2 flex gap-3 justify-start mt-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">حفظ التعديلات</button>
            <button type="button" onClick={onClose} className="bg-gray-100 px-4 py-2 rounded">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
