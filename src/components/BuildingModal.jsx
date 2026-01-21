import React, { useEffect, useState } from 'react';

export default function BuildingModal({ initialData = null, onClose, onSave }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [floors_count, setFloorsCount] = useState(0);
  const [status, setStatus] = useState('active');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setName(initialData.name || '');
      setFloorsCount(initialData.floors_count || 0);
      setStatus(initialData.status || 'active');
      setDescription(initialData.description || '');
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      code: code || null,
      name: name || null,
      description: description || null,
      floors_count: floors_count || 0,
      status: status,
      // floors_count stored on view only; keep consistent by letting caller manage floors
    };
    if (initialData && initialData.id) payload.id = initialData.id;
    await onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-lg mt-12">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{initialData ? 'تعديل مبنى' : 'إضافة مبنى'}</h3>
          <button onClick={onClose} className="text-gray-500">إغلاق ✖</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">رقم المبنى *</label>
            <input value={code} onChange={(e)=>setCode(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1">اسم المبنى *</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm mb-1">عدد الطوابق *</label>
            <input type="number" value={floors_count} onChange={(e)=>setFloorsCount(Number(e.target.value))} className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm mb-1">الحالة *</label>
            <select value={status} onChange={(e)=>setStatus(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm mb-1">الوصف</label>
            <textarea value={description} onChange={(e)=>setDescription(e.target.value)} className="w-full border rounded px-3 py-2 h-28" />
          </div>

          <div className="col-span-2 flex gap-3 justify-start mt-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">حفظ التعديلات 💾</button>
            <button type="button" onClick={onClose} className="bg-gray-100 px-4 py-2 rounded">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}
