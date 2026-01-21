import React from 'react';
import { WifiSmallIcon, TvSmallIcon, AcSmallIcon, MinibarSmallIcon, GuestsSmallIcon } from './Icons';

export default function RoomTypeCard({ type, onEdit, onDelete }) {
  const feats = Array.isArray(type.features) ? type.features : [];
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden" dir="rtl">
      <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
      <div className="px-4 pt-4">
        <div className="text-blue-700 font-extrabold text-xl">{Number(type.base_price || 0)}</div>
        <div className="text-[11px] text-gray-500">ليلة/غرفة</div>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-[15px]">{type.name_ar}</div>
            <div className="text-[11px] text-gray-500">{type.name}</div>
          </div>
          {type.code && (
            (() => {
              const c = String(type.code || '').toUpperCase();
              const color = c === 'DELUXE' ? 'bg-blue-100 text-blue-700'
                : c === 'DOUBLE' ? 'bg-indigo-100 text-indigo-700'
                : c === 'TRIPLE' ? 'bg-purple-100 text-purple-700'
                : c === 'SUITE' ? 'bg-pink-100 text-pink-700'
                : 'bg-gray-100 text-gray-700 border border-gray-200';
              return (
                <span className={`text-[9px] px-2 py-[2px] rounded ${color} uppercase tracking-wide`}>{c}</span>
              );
            })()
          )}
        </div>
        <div className="mt-2 text-[11px] text-gray-600 flex items-center gap-2">
          <GuestsSmallIcon className="w-[12px] h-[12px] text-gray-500" />
          <span>عدد الأشخاص الأقصى: {Number(type.max_guests || 0)}</span>
        </div>
        {feats.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {feats.map((f,i)=> {
              const key = String(f || '').toLowerCase();
              const icon = key.includes('wifi') ? <WifiSmallIcon className="w-[12px] h-[12px]" />
                : key === 'tv' ? <TvSmallIcon className="w-[12px] h-[12px]" />
                : key.includes('ac') ? <AcSmallIcon className="w-[12px] h-[12px]" />
                : key.includes('minibar') ? <MinibarSmallIcon className="w-[12px] h-[12px]" />
                : null;
              return (
                <span key={i} className="text-[11px] px-2 py-[5px] rounded border border-gray-200 bg-gray-50 text-gray-600 flex items-center gap-2">
                  {icon}
                  <span>{f}</span>
                </span>
              );
            })}
          </div>
        )}
        {type.description && (
          <div className="mt-3 text-[11px] text-gray-600">{type.description}</div>
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
