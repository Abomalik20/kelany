import React from 'react';
import { MaintenanceIcon } from './Icons';

export default function BuildingCard({ building, onEdit, onDelete }) {
  const statusLabel = building.status === 'inactive' ? 'غير نشط' : building.status === 'maintenance' ? 'صيانة' : 'نشط';
  const statusClass = building.status === 'inactive' ? 'bg-gray-100 text-gray-700' : building.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700';

  return (
    <div className="bg-white rounded-lg shadow p-6 relative">
      <div className="flex items-start justify-between">
        <div>
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${statusClass}`}>
            {building.status === 'maintenance' && <MaintenanceIcon className="w-4 h-4" />}
            <span>{statusLabel}</span>
          </div>
          <h3 className="text-lg font-semibold mt-3">{building.name}</h3>
          <div className="text-sm text-gray-500">{building.name_en}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">مبنى {building.code}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-blue-600 font-semibold">{building.floors_count ?? 0}</div>
          <div className="text-gray-500">طوابق</div>
        </div>
        <div>
          <div className="text-gray-800 font-semibold">{building.total_rooms ?? 0}</div>
          <div className="text-gray-500">إجمالي الغرف</div>
        </div>
        <div>
          <div className="text-green-600 font-semibold">{building.available_rooms ?? 0}</div>
          <div className="text-gray-500">الغرف المتاحة</div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">{building.description}</div>

      <div className="mt-6 flex gap-3">
        <button onClick={onEdit} className="bg-yellow-400 px-4 py-2 rounded text-white">تعديل ✏️</button>
        <button onClick={onDelete} className="bg-red-500 px-4 py-2 rounded text-white">حذف 🗑️</button>
      </div>
    </div>
  );
}
