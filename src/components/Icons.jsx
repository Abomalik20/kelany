import React from 'react';

export function KeyIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 8a5 5 0 1 1-9.9 1.2L3 17.3V21h3.7l8.1-8.1A5 5 0 0 1 21 8z" fill="#fff"/>
    </svg>
  );
}

export function CalendarIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#fff" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

export function UserIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3" fill="#fff" />
      <path d="M4 20c1.5-4 6-6 8-6s6.5 2 8 6" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

export function HotelIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="12" rx="1.5" fill="#fff" />
      <path d="M7 6v12M12 6v12M17 6v12" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

export function PeopleIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="8" r="2" fill="#fff" />
      <circle cx="15" cy="8" r="2" fill="#fff" />
      <path d="M3 20c2-4 8-4 9-4s7 0 9 4" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

export function MoneyIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="#fff" />
      <path d="M12 9v6M9 12h6" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

// Sidebar / menu icons
export function DashboardIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="8" height="8" rx="1" fill="#ffd700" />
      <rect x="13" y="3" width="8" height="5" rx="1" fill="#6a82fb" />
      <rect x="13" y="10" width="8" height="11" rx="1" fill="#43e97b" />
    </svg>
  );
}

export function BuildingIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="6" height="18" rx="1" fill="#4b6cb7" />
      <rect x="14" y="7" width="6" height="14" rx="1" fill="#182848" />
    </svg>
  );
}

export function FloorIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="3" rx="1" fill="#6a82fb" />
      <rect x="3" y="11" width="18" height="3" rx="1" fill="#fc5c7d" />
      <rect x="3" y="16" width="18" height="3" rx="1" fill="#43e97b" />
    </svg>
  );
}

export function RoomTypeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="16" rx="2" fill="#f3f4f6" />
      <rect x="7" y="7" width="3" height="3" fill="#6a82fb" />
      <rect x="14" y="7" width="3" height="3" fill="#ffd700" />
      <rect x="7" y="14" width="3" height="3" fill="#43e97b" />
      <rect x="14" y="14" width="3" height="3" fill="#ff6b6b" />
    </svg>
  );
}

export function OccupancyIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" fill="#ff6b6b" />
      <rect x="3" y="14" width="18" height="6" rx="1" fill="#e2e8f0" />
    </svg>
  );
}

export function CardIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="#ffffff" stroke="#e5e7eb" />
      <rect x="4" y="9" width="6" height="2" rx="0.5" fill="#6a82fb" />
    </svg>
  );
}

export function ScheduleIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#f8fafc" stroke="#e6eef8" />
      <path d="M8 2v4M16 2v4" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  );
}

export function SettingsIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" fill="#fff" stroke="#6b7280"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 2.41 16l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.67 0 1.21-.42 1.51-1a1.65 1.65 0 0 0-.33-1.82L4.3 2.41A2 2 0 1 1 7.13.58l.06.06A1.65 1.65 0 0 0 9 1.47c.3.58.84 1 1.51 1H12a2 2 0 1 1 0 4h-.09c-.67 0-1.21.42-1.51 1a1.65 1.65 0 0 0 .33 1.82l.06.06A2 2 0 1 1 16.87 7.9l-.06-.06a1.65 1.65 0 0 0-1.82-.33c-.58.3-1 0-1 1.51V9a2 2 0 1 1 4 0v.09c0 .67.42 1.21 1 1.51.7.3 1 .84 1.51 1.82z" stroke="#6b7280" strokeWidth="0.5"/>
    </svg>
  );
}

export function MaintenanceIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.7 13.35l-2.45-2.45a3 3 0 0 0-4.24 0l-.9.9-1.06-1.06.9-.9a3 3 0 0 0 0-4.24L10.65 2.3 8.3 4.65 9.7 6.05 7.95 7.8a6 6 0 1 0 8.49 8.49l1.75-1.75 1.4 1.4 2.35-2.35z" fill="#fff" stroke="#6b7280"/>
    </svg>
  );
}

// Refined outline icons for summary boxes (use currentColor for theming)
export function RoomsTotalIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 5v14M12 5v14M17 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RoomsAvailableIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RoomsReservedIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4v3M16 4v3M3.5 9h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 12.5l2 .8-1.2 1.7.1 2-1.9-.8-1.9.8.1-2L8 13.3l2-.8L12 10.8l2 1.7z" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function RoomsOccupiedIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="12" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="9" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 9h5a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RoomsMaintenanceIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 13l-2.5-2.5a3 3 0 0 0-4.2 0l-1 1-1.8-1.8 1-1a3 3 0 0 0 0-4.2L10 2.8 7.8 5l1.2 1.2-1.5 1.5a6 6 0 1 0 8.5 8.5l1.5-1.5 1.2 1.2L21 13z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Small feature icons for Room Types cards
export function WifiSmallIcon({ className = 'w-[10px] h-[10px]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 10a12 12 0 0 1 16 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 13a8 8 0 0 1 10 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 16a4 4 0 0 1 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

export function TvSmallIcon({ className = 'w-[10px] h-[10px]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 3l4 3 4-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function AcSmallIcon({ className = 'w-[10px] h-[10px]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 7l3 3M14 14l3 3M7 17l3-3M14 10l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MinibarSmallIcon({ className = 'w-[10px] h-[10px]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function GuestsSmallIcon({ className = 'w-[10px] h-[10px]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="9" r="2" stroke="currentColor" strokeWidth="1" />
      <path d="M3 20c2-4 8-4 9-4s7 0 9 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
