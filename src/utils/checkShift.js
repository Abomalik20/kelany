import { supabase } from '../supabaseClient';

// Local-date string YYYY-MM-DD (avoids UTC offset issues)
export function getTodayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns the open reception shift row for a user on a given date (default: today local)
export async function getActiveOpenShift(userId, dateStr) {
  if (!userId) return null;
  const day = dateStr || getTodayStrLocal();
  const { data: shiftRows, error } = await supabase
    .from('reception_shifts')
    .select('id,status,shift_date,opened_at,closed_at')
    .eq('staff_user_id', userId)
    .eq('shift_date', day)
    .eq('status', 'open')
    .limit(1);
  if (error) {
    console.error('getActiveOpenShift error', error);
    return null;
  }
  return (shiftRows && shiftRows.length > 0) ? shiftRows[0] : null;
}

// Returns true if user has an open reception shift today (local). Managers bypass.
export async function ensureOpenShift(currentUser) {
  if (!currentUser || !currentUser.id) return true; // auth will handle unauthenticated
  const role = currentUser.role;
  // enforce only for reception and housekeeping
  if (role !== 'reception' && role !== 'housekeeping') return true;
  try {
    const shift = await getActiveOpenShift(currentUser.id);
    return !!shift;
  } catch (e) {
    console.error('ensureOpenShift failed', e);
    return false;
  }
}
