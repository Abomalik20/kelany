import React, { useState } from 'react';
import Buildings from './Buildings';
import Floors from './Floors';
import Rooms from './Rooms';
import RoomTypes from './RoomTypes';

export default function Aggregate() {
  const [tab, setTab] = useState('buildings');
  const tabs = [
    { key: 'buildings', label: 'المباني' },
    { key: 'floors', label: 'الطوابق' },
    { key: 'rooms', label: 'الغرف' },
    { key: 'room-types', label: 'أنواع الغرف' },
  ];

  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 px-3 rounded ${tab===t.key ? 'bg-[#1f2a48] text-white' : 'bg-white text-gray-700 border'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'buildings' && <Buildings />}
        {tab === 'floors' && <Floors />}
        {tab === 'rooms' && <Rooms />}
        {tab === 'room-types' && <RoomTypes />}
      </div>
    </div>
  );
}
