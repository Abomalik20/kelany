import { supabase } from '../supabaseClient';

// Returns true if user has an open reception shift
export async function ensureOpenShift(currentUser) {
  if (!currentUser || !currentUser.id) return true; // not logged in -> let other auth layers handle
  const role = currentUser.role;
  if (role !== 'reception' && role !== 'housekeeping') return true; // only enforce for these roles

  try {
    const { data, error } = await supabase
      .from('reception_shifts')
      .select('id,status')
      .eq('staff_user_id', currentUser.id)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('shift check error', error);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error('ensureOpenShift failed', e);
    return false;
  }
}
