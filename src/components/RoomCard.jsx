import React from 'react';
import { GuestsSmallIcon, WifiSmallIcon, TvSmallIcon, AcSmallIcon, MinibarSmallIcon } from './Icons';

function StatusBadge({ status }) {
  const map = {
    available: { text: 'متاحة', cls: 'bg-green-100 text-green-700' },
    reserved: { text: 'محجوزة', cls: 'bg-amber-100 text-amber-700' },
    occupied: { text: 'مشغولة', cls: 'bg-pink-100 text-pink-700' },
    maintenance: { text: 'صيانة', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || map.available;
  return <span className={`text-xs px-2 py-1 rounded ${s.cls}`}>{s.text}</span>;
}

export default function RoomCard({ room, onEdit, onDelete, onSelect, selected }) {
  const feats = Array.isArray(room.features) ? room.features : [];
  const iconFor = (f) => {
    const key = String(f || '').toLowerCase();
    if (key.includes('wifi')) return <WifiSmallIcon className="w-[12px] h-[12px]" title="واي فاي"/>;
    if (key === 'tv') return <TvSmallIcon className="w-[12px] h-[12px]" title="تلفاز"/>;
    if (key.includes('ac')) return <AcSmallIcon className="w-[12px] h-[12px]" title="تكييف"/>;
    if (key.includes('minibar')) return <MinibarSmallIcon className="w-[12px] h-[12px]" title="ميني بار"/>;
    return null;
  };

  const headerClassForStatus = (status) => {
    switch (status) {
      case 'available':
        return 'bg-status-available';
      case 'reserved':
        return 'bg-status-reserved';
      case 'occupied':
        return 'bg-status-occupied';
      case 'maintenance':
        return 'bg-status-maintenance';
      default:
        return 'bg-gray-300';
    }
  };

  const CleanBadge = ({ value }) => {
    const map = {
      clean: { text: 'نظيفة', cls: 'bg-green-100 text-green-700' },
      in_cleaning: { text: 'جاري تنظيف', cls: 'bg-amber-100 text-amber-700' },
      needs_cleaning: { text: 'تحتاج نظافة', cls: 'bg-red-100 text-red-700' },
    };
    const v = map[value] || map.clean;
    return <span className={`text-xs px-2 py-1 rounded ${v.cls}`}>{v.text}</span>;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden" dir="rtl">
      <div className={`h-1 ${headerClassForStatus(room.status)}`} title={`حالة: ${room.status}`} />
      <div className="px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {typeof onSelect === 'function' && (
            <input type="checkbox" checked={!!selected} onChange={onSelect} title="تحديد" />
          )}
          <div className="text-gray-800 font-bold">{room.room_code}</div>
        </div>
        <StatusBadge status={room.status} />
      </div>
      <div className="px-4 py-3 text-xs text-gray-600">
        <div className="mb-1">{room.floor_name} – {room.building_name}</div>
        <div className="mb-1">
          <span className="font-semibold">{room.room_type_name_ar}</span>
          <span className="ml-2 text-gray-500">({room.room_type_name_en})</span>
        </div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-blue-700 font-bold text-base">{Number(room.computed_price || 0)}</span>
          <span className="text-gray-500">جنيه/ليلة</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <GuestsSmallIcon className="w-[12px] h-[12px] text-gray-500" title="أقصى عدد ضيوف" />
          <span>أقصى عدد أشخاص: {Number(room.max_guests || 0)}</span>
        </div>
        <div className="mb-2">
          <span className="text-gray-700 mr-2">حالة النظافة:</span>
          <CleanBadge value={room.cleanliness} />
        </div>
        {feats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feats.map((f, i) => (
              <span key={i} className="text-[11px] px-2 py-[5px] rounded border border-gray-200 bg-gray-50 text-gray-600 flex items-center gap-2" title={String(f)}>
                {iconFor(f)}
                <span>{f}</span>
              </span>
            ))}
          </div>
        )}
        {room.description && (
          <div className="mt-2 text-gray-600">{room.description}</div>
        )}
      </div>
      <div className="px-4 py-3 border-t bg-gray-50">
        <div className="flex gap-2">
          <button onClick={onEdit} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm flex-1">تعديل ✍️</button>
          <button onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm flex-1">حذف 🗑️</button>
        </div>
      </div>
    </div>
  );
}
