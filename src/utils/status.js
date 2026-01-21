// Centralized status colors and Arabic labels for consistency across the app

export const ReservationStatus = {
  pending:      { color: '#F59E0B', labelAr: 'قيد الانتظار' },
  confirmed:    { color: '#10B981', labelAr: 'مؤكد' },
  checked_in:   { color: '#3B82F6', labelAr: 'تم الدخول' },
  checked_out:  { color: '#6B7280', labelAr: 'تم الخروج' },
  canceled:     { color: '#EF4444', labelAr: 'ملغي' },
  cancelled:    { color: '#EF4444', labelAr: 'ملغي' },
  no_show:      { color: '#F59E0B', labelAr: 'لم يحضر' },
  empty:        { color: '#E5E7EB', labelAr: 'فارغ' },
};

export const RoomStatus = {
  available:    { color: '#10B981', labelAr: 'متاحة' },
  reserved:     { color: '#F59E0B', labelAr: 'محجوزة' },
  occupied:     { color: '#3B82F6', labelAr: 'مشغولة' },
  maintenance:  { color: '#6B7280', labelAr: 'صيانة' },
  unknown:      { color: '#9CA3AF', labelAr: 'غير معروف' },
};

export const Occupancy = {
  occupied:     { color: '#3B82F6', labelAr: 'مشغول' },
  empty:        { color: '#E5E7EB', labelAr: 'فارغ' },
};

export const CleanlinessStatus = {
  clean:          { color: '#10B981', labelAr: 'نظيفة' },
  in_cleaning:    { color: '#F59E0B', labelAr: 'جاري تنظيف' },
  needs_cleaning: { color: '#EF4444', labelAr: 'تحتاج نظافة' },
};

export function getReservationStatusColor(status) {
  const key = String(status || '').toLowerCase();
  return (ReservationStatus[key] || ReservationStatus.empty).color;
}

export function getReservationStatusLabelAr(status) {
  const key = String(status || '').toLowerCase();
  return (ReservationStatus[key] || { labelAr: 'غير معروف' }).labelAr;
}

export function getRoomStatusColor(status) {
  const key = String(status || '').toLowerCase();
  return (RoomStatus[key] || RoomStatus.unknown).color;
}

export function getRoomStatusLabelAr(status) {
  const key = String(status || '').toLowerCase();
  return (RoomStatus[key] || RoomStatus.unknown).labelAr;
}

export function getOccupancyColor(state) {
  const key = String(state || '').toLowerCase();
  return (Occupancy[key] || Occupancy.empty).color;
}

export function getCleanlinessLabelAr(value) {
  const key = String(value || '').toLowerCase();
  return (CleanlinessStatus[key] || CleanlinessStatus.clean).labelAr;
}
