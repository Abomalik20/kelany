import React, { useState, useContext } from 'react';
import { AuthContext } from '../App.jsx';
import { ensureOpenShift } from '../utils/checkShift';
import { supabase } from '../supabaseClient';

export default function GuestModal({ initialData, onClose, onSave }) {
  const currentUser = useContext(AuthContext);
  const deriveFromFullName = (full) => {
    const parts = String(full || '').trim().split(/\s+/);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  };

  const initialNames = (() => {
    const fn = initialData?.first_name || '';
    const ln = initialData?.last_name || '';
    if ((fn.trim().length + ln.trim().length) === 0 && initialData?.full_name) {
      return deriveFromFullName(initialData.full_name);
    }
    return { first: fn, last: ln };
  })();

  const [first_name, setFirstName] = useState(initialNames.first || '');
  const [last_name, setLastName] = useState(initialNames.last || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [nationality, setNationality] = useState(initialData?.nationality || '');
  const [national_id, setNationalId] = useState(initialData?.national_id || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [city, setCity] = useState(initialData?.city || '');
  const [country, setCountry] = useState(initialData?.country || '');
  const [is_vip, setIsVip] = useState(!!initialData?.is_vip);
  const [avatar_url, setAvatarUrl] = useState(initialData?.avatar_url || '');
  const [id_doc_type, setIdDocType] = useState(initialData?.id_doc_type || 'national_id');
  const [id_doc_number, setIdDocNumber] = useState(initialData?.id_doc_number || '');
  const [id_doc_url, setIdDocUrl] = useState(initialData?.id_doc_url || '');
  const [id_doc_uploaded_at, setIdDocUploadedAt] = useState(initialData?.id_doc_uploaded_at || null);
  const [idUploading, setIdUploading] = useState(false);
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Sync when initialData changes (e.g., selecting an existing duplicate)
  React.useEffect(() => {
    const fn = initialData?.first_name || '';
    const ln = initialData?.last_name || '';
    let names = { first: fn, last: ln };
    if ((fn.trim().length + ln.trim().length) === 0 && initialData?.full_name) {
      names = deriveFromFullName(initialData.full_name);
    }
    setFirstName(names.first || '');
    setLastName(names.last || '');
    setEmail(initialData?.email || '');
    setPhone(initialData?.phone || '');
    setNationality(initialData?.nationality || '');
    setNationalId(initialData?.national_id || '');
    setAddress(initialData?.address || '');
    setCity(initialData?.city || '');
    setCountry(initialData?.country || '');
    setIsVip(!!initialData?.is_vip);
    setAvatarUrl(initialData?.avatar_url || '');
    setIdDocType(initialData?.id_doc_type || 'national_id');
    setIdDocNumber(initialData?.id_doc_number || '');
    setIdDocUrl(initialData?.id_doc_url || '');
    setIdDocUploadedAt(initialData?.id_doc_uploaded_at || null);
    setNotes(initialData?.notes || '');
    setErrors({});
  }, [initialData]);

  const validate = () => {
    const e = {};
    const hasFull = (String(first_name).trim().length + String(last_name).trim().length) > 0;
    const full_name = `${String(first_name||'').trim()} ${String(last_name||'').trim()}`.trim();
    if (!hasFull && full_name.length === 0) e.full_name = 'اكتب الاسم الأول والأخير أو الاسم الكامل.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    // ensure open shift for reception/housekeeping
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
    try {
      await onSave({
        first_name,
        last_name,
        avatar_url,
        id_doc_type,
        id_doc_number,
        id_doc_url,
        id_doc_uploaded_at,
        email,
        phone,
        nationality,
        national_id,
        address,
        city,
        country,
        is_vip,
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-xl font-bold">{initialData ? 'تعديل بيانات النزيل' : 'إضافة نزيل جديد'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm">الاسم الأول *</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={first_name} onChange={e=>{ setFirstName(e.target.value); setErrors(prev=>({ ...prev, full_name: undefined })); }} placeholder="أحمد" />
              {errors.full_name && <div className="text-red-600 text-xs mt-1">{errors.full_name}</div>}
            </div>
            <div>
              <label className="text-sm">الاسم الأخير *</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={last_name} onChange={e=>{ setLastName(e.target.value); setErrors(prev=>({ ...prev, full_name: undefined })); }} placeholder="محمد" />
            </div>
            <div>
                <label className="text-sm">رابط الصورة (اختياري)</label>
                <input className="mt-1 border rounded w-full px-3 py-2" value={avatar_url} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://.../avatar.jpg" />
              </div>
              <div>
              <label className="text-sm">البريد الإلكتروني</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
              <div className="md:col-span-2 border-t pt-4 mt-2">
                <details className="group">
                  <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between">
                    <span>هوية العميل</span>
                    <span className="text-xs text-gray-500 group-open:hidden">إظهار</span>
                    <span className="text-xs text-gray-500 hidden group-open:inline">إخفاء</span>
                  </summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm">نوع الهوية</label>
                    <select className="mt-1 border rounded w-full px-3 py-2" value={id_doc_type} onChange={e=>setIdDocType(e.target.value)}>
                      <option value="national_id">بطاقة شخصية</option>
                      <option value="passport">جواز سفر</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">رقم الهوية</label>
                    <input className="mt-1 border rounded w-full px-3 py-2" value={id_doc_number} onChange={e=>setIdDocNumber(e.target.value)} placeholder="رقم الجواز/البطاقة" />
                  </div>
                  <div>
                    <label className="text-sm">رفع صورة الهوية</label>
                    <input type="file" accept="image/*,application/pdf" className="mt-1 w-full" onChange={async (e)=>{
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      try {
                        setIdUploading(true);
                        const safeName = `${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
                        const { error: upErr } = await supabase.storage.from('guest-ids').upload(safeName, file, { upsert: true, contentType: file.type });
                        if (upErr) throw upErr;
                        const { data: pub } = supabase.storage.from('guest-ids').getPublicUrl(safeName);
                        if (pub?.publicUrl) {
                          setIdDocUrl(pub.publicUrl);
                          setIdDocUploadedAt(new Date().toISOString());
                        }
                      } catch (err) {
                        console.error('Upload ID failed', err);
                        alert('تعذّر رفع الهوية. تأكد من صلاحيات Storage ثم حاول مجددًا.');
                      } finally {
                        setIdUploading(false);
                      }
                    }} />
                    {idUploading && <div className="text-xs text-gray-500 mt-1">جارٍ الرفع...</div>}
                    {id_doc_url && (
                      <div className="text-xs mt-1">
                        <a href={id_doc_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">عرض الهوية المرفوعة</a>
                        {id_doc_uploaded_at && <span className="text-gray-500 ml-2">(مرفوعة: {new Date(id_doc_uploaded_at).toLocaleDateString('ar-EG')})</span>}
                      </div>
                    )}
                  </div>
                  </div>
                </details>
              </div>
            <div>
              <label className="text-sm">رقم الهاتف *</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="01234567890" />
            </div>
            <div>
              <label className="text-sm">الجنسية</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={nationality} onChange={e=>setNationality(e.target.value)} placeholder="مصري" />
            </div>
            <div>
              <label className="text-sm">رقم الهوية</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={national_id} onChange={e=>setNationalId(e.target.value)} placeholder="29901011234567" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm">العنوان</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={address} onChange={e=>setAddress(e.target.value)} placeholder="القاهرة - مصر الجديدة" />
            </div>
            <div>
              <label className="text-sm">المدينة</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={city} onChange={e=>setCity(e.target.value)} placeholder="القاهرة" />
            </div>
            <div>
              <label className="text-sm">الدولة</label>
              <input className="mt-1 border rounded w-full px-3 py-2" value={country} onChange={e=>setCountry(e.target.value)} placeholder="مصر" />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={is_vip} onChange={e=>setIsVip(e.target.checked)} />
              <span className="text-sm">نزيل VIP ⭐</span>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm">ملاحظات</label>
              <textarea className="mt-1 border rounded w-full px-3 py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ملاحظات إضافية..." />
            </div>
          </div>
          <div className="sticky bottom-0 -mx-6 px-6 pt-3 mt-6 bg-white border-t flex justify-end gap-3">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">إلغاء</button>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
