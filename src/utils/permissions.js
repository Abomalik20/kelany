export const PAGE_PERMISSIONS = {
  dashboard: ['manager', 'assistant_manager', 'reception', 'housekeeping'],
  buildings: ['manager', 'assistant_manager'],
  floors: ['manager', 'assistant_manager', 'housekeeping'],
  rooms: ['manager', 'assistant_manager'],
  'room-types': ['manager', 'assistant_manager'],
  reservations: ['manager', 'assistant_manager', 'reception'],
  'checkin-out': ['manager', 'assistant_manager', 'reception'],
  guests: ['manager', 'assistant_manager', 'reception'],
  'activity-log': ['manager', 'assistant_manager'],
  housekeeping: ['manager', 'assistant_manager', 'housekeeping'],
  laundry: ['manager', 'assistant_manager', 'housekeeping'],
  accounting: ['manager', 'assistant_manager'],
  reports: ['manager', 'assistant_manager'],
  users: ['manager'],
  settings: ['manager'],
};

export function canAccessPage(user, page) {
  if (!user) return false;
  const allowed = PAGE_PERMISSIONS[page];
  if (!allowed) return true;
  return allowed.includes(user.role);
}

export function isManager(user) {
  return !!user && user.role === 'manager';
}

export function isAssistantManager(user) {
  return !!user && user.role === 'assistant_manager';
}

// يمكن حذف الأساسيات (مبانٍ، طوابق، أنواع غرف، غرف...) فقط بواسطة المدير
export function canDeleteCore(user) {
  return isManager(user);
}
