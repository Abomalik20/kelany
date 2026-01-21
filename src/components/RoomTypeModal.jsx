import React, { useEffect, useState } from 'react';

export default function RoomTypeModal({ initialData = null, onClose, onSave }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [price, setPrice] = useState('');
  const [maxGuests, setMaxGuests] = useState('');
  const [features, setFeatures] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setName(initialData.name || '');
      setNameAr(initialData.name_ar || '');
      setPrice(initialData.base_price != null ? String(initialData.base_price) : '');
      setMaxGuests(initialData.max_guests != null ? String(initialData.max_guests) : '');
      setFeatures(Array.isArray(initialData.features) ? initialData.features.join(', ') : '');
      setDescription(initialData.description || '');
      setDisplayOrder(initialData.display_order != null ? String(initialData.display_order) : '');
      setIsActive(initialData.is_active !== undefined ? !!initialData.is_active : true);
    } else {
      setIsActive(true);
    }
  }, [initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave && onSave({
      code,
      name,
      name_ar: nameAr,
      base_price: price,
      max_guests: maxGuests,
      features,
      description,
      display_order: displayOrder,
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50" dir="rtl">
      <div className="bg-white rounded-lg w-full max-w-3xl p-6 shadow-lg mt-12">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">{initialData ? 'تعديل نوع غرفة' : 'إضافة نوع غرفة'}</h3>
          <button onClick={onClose} className="text-gray-500">إغلاق ✖</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">الاسم بالإنجليزية *</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1">رمز النوع *</label>
            <input value={code} onChange={(e)=>setCode(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm mb-1">السعر الأساسي (جنيه) *</label>
            <input value={price} onChange={(e)=>setPrice(e.target.value)} type="number" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1">الاسم بالعربية *</label>
            <input value={nameAr} onChange={(e)=>setNameAr(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm mb-1">الحد الأقصى للأشخاص *</label>
            <input value={maxGuests} onChange={(e)=>setMaxGuests(e.target.value)} type="number" className="w-full border rounded px-3 py-2" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm mb-1">المميزات</label>
            <input value={features} onChange={(e)=>setFeatures(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="WiFi, TV, AC, Minibar" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm mb-1">الوصف</label>
            <textarea value={description} onChange={(e)=>setDescription(e.target.value)} className="w-full border rounded px-3 py-2 h-24" />
          </div>

          <div>
            <label className="block text-sm mb-1">ترتيب العرض</label>
            <input value={displayOrder} onChange={(e)=>setDisplayOrder(e.target.value)} type="number" className="w-full border rounded px-3 py-2" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e)=>setIsActive(e.target.checked)} />
            <span className="text-sm">نشط</span>
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
