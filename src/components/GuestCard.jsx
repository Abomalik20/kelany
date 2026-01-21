import React from 'react';

function Icon({ name, className }) {
  const props = { className: `w-4 h-4 ${className||''}` };
  switch (name) {
    case 'phone':
      return (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.59 2.61a2 2 0 0 1-.45 2.11L8 9a16 16 0 0 0 7 7l.56-.25a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.61.59A2 2 0 0 1 22 16.92z"/></svg>);
    case 'id':
      return (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="12" r="3"/><path d="M14 10h6M14 14h6"/></svg>);
    case 'email':
      return (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16a2 2 0 1 1 0 0v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>);
    case 'star':
      return (<svg {...props} viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"/></svg>);
    default:
      return null;
  }
}

function StatBadge({ label, active }) {
  return (
    <span className={`text-xs px-2 py-1 rounded ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{label}</span>
  );
}

export default function GuestCard({ guest, onEdit, onDelete, onHistory }) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow transform hover:-translate-y-0.5 border border-gray-200 overflow-hidden" dir="rtl">
      <div className={`h-1 ${guest.is_vip ? 'bg-purple-500' : 'bg-blue-500'}`} />
      <div className="px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className={`relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-gray-700 font-bold ${guest.is_vip ? 'ring-2 ring-purple-300' : ''}`}>
            {guest.avatar_url ? (
              <img src={guest.avatar_url} alt={guest.full_name || ''} className="w-full h-full object-cover" />
            ) : (
              <span>{String(guest.full_name || '؟').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase() || '؟'}</span>
            )}
            {guest.is_vip && (
              <span className="absolute -bottom-1 -left-1 bg-purple-600 text-white rounded-full p-0.5" title="نزيل VIP">
                <Icon name="star" className="w-3 h-3" />
              </span>
            )}
          </div>
          {/* Name + VIP badge */}
          <div className="flex items-center gap-2">
            <div className="text-gray-800 font-bold">{guest.full_name}</div>
            {guest.is_vip && (
              <span className="hidden md:inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded" title="نزيل VIP">
                <Icon name="star" className="text-purple-600" /> VIP
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 text-xs text-gray-600">
        <div className="mb-1 flex items-center gap-2"><Icon name="phone" className="text-gray-500" /><span>هاتف: {guest.phone || '—'}</span></div>
        <div className="mb-1 flex items-center gap-2"><Icon name="id" className="text-gray-500" /><span>هوية: {guest.national_id || '—'}</span></div>
        <div className="mb-1 flex items-center gap-2"><Icon name="email" className="text-gray-500" /><span>بريد: {guest.email || '—'}</span></div>
        {guest.id_doc_url && (
          <div className="mb-1 text-xs">
            <a href={guest.id_doc_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">عرض صورة الهوية</a>
            {guest.id_doc_type && <span className="ml-2 text-gray-500">({guest.id_doc_type === 'passport' ? 'جواز سفر' : 'بطاقة شخصية'})</span>}
          </div>
        )}
        <div className="mb-1 text-xs text-gray-600">
          <span>أُنشئ بواسطة: </span>
          <span className="font-medium">{guest.created_by_name || 'غير محدد'}</span>
          {guest.created_at && (
            <span>{' '}({new Date(guest.created_at).toLocaleDateString('ar-EG')})</span>
          )}
        </div>
        <div className="mb-2">آخر زيارة: {guest.last_visit_at ? new Date(guest.last_visit_at).toLocaleDateString('ar-EG') : '—'}</div>
        <div className="mb-2 flex items-center gap-2">
          <StatBadge label={`زيارات: ${guest.visits_count || 0}`} active={(guest.visits_count || 0) > 0} />
          <StatBadge label={guest.has_current_stay ? 'حجز قائم' : 'لا يوجد حجز قائم'} active={guest.has_current_stay} />
          <StatBadge label={guest.has_upcoming_reservation ? 'قادِم' : 'غير قادِم'} active={guest.has_upcoming_reservation} />
        </div>
      </div>
      <div className="px-4 py-3 border-t bg-gray-50">
        <div className="flex gap-2">
          <button onClick={onHistory} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm flex-1">السجل 📜</button>
          <button onClick={onEdit} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm flex-1">تعديل ✍️</button>
          <button onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm flex-1">حذف 🗑️</button>
        </div>
      </div>
    </div>
  );
}
