import React, { useState } from 'react';
import Housekeeping from './Housekeeping';
import Laundry from './Laundry';

export default function OperationsSettings() {
  const [tab, setTab] = useState('housekeeping');
  const tabs = [
    { key: 'housekeeping', label: 'إدارة التنظيف' },
    { key: 'laundry', label: 'إدارة اللاندري / المخزون' },
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
        {tab === 'housekeeping' && <Housekeeping />}
        {tab === 'laundry' && <Laundry />}
      </div>
    </div>
  );
}
