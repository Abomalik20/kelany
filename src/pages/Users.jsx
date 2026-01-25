import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager } from '../utils/permissions';
import { STAFF_ROLES, getRoleLabel } from '../constants/roles';

function UserModal({ initialData, onClose, onSaved, currentUser }) {
  const isEdit = !!initialData;
  const [username, setUsername] = useState(initialData?.username || '');
  const [fullName, setFullName] = useState(initialData?.full_name || initialData?.name || '');
  const [role, setRole] = useState(initialData?.role || 'reception');
  const [active, setActive] = useState(initialData?.is_active ?? true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!fullName || (!isEdit && !username)) {
      setError('يرجى إدخال اسم المستخدم والاسم الكامل.');
      return;
    }
    try {
      setSaving(true);
      if (!isEdit) {
        if (!password) {
          setError('يجب تعيين كلمة مرور للمستخدم الجديد.');
          setSaving(false);
          return;
        }
        const { data, error } = await supabase.rpc('create_staff_user', {
          p_username: username,
          p_full_name: fullName,
          p_role: role,
          p_password: password,
          p_created_by: currentUser?.id || null,
        });
        if (error) throw error;
        onSaved && onSaved(data && data[0]);
      } else {
        const id = initialData.id;
        const { error: err1 } = await supabase.rpc('update_staff_user', {
          p_id: id,
          p_full_name: fullName,
          p_role: role,
          p_is_active: active,
          p_updated_by: currentUser?.id || null,
        });
        if (err1) throw err1;
        if (password) {
          const { error: err2 } = await supabase.rpc('set_staff_user_password', {
            p_id: id,
            p_password: password,
            p_updated_by: currentUser?.id || null,
          });
          if (err2) throw err2;
        }
        onSaved && onSaved();
      }
    } catch (e2) {
      console.error('Save staff user failed', e2);
      const msg = String(e2?.message || e2 || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('already exists')) {
        setError('اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر.');
      } else if (msg.includes('role') && msg.includes('check')) {
        setError('قيمة الدور غير صحيحة.');
      } else {
        setError('تعذّر حفظ بيانات المستخدم.');
      }
      return;
    } finally {
      setSaving(false);
    }
    onClose && onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40" dir="rtl">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold mb-4">{isEdit ? 'تعديل مستخدم' : 'مستخدم جديد'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">اسم المستخدم (فريد)</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              disabled={isEdit}
              value={username}
              onChange={(e)=>setUsername(e.target.value)}
              placeholder="مثال: receptionist01 أو البريد الإلكتروني"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">الاسم الكامل</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              value={fullName}
              onChange={(e)=>setFullName(e.target.value)}
              placeholder="الاسم كما سيظهر في النظام"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">الدور</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={role}
              onChange={(e)=>setRole(e.target.value)}
            >
              {STAFF_ROLES.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                className="h-4 w-4"
                checked={!!active}
                onChange={(e)=>setActive(e.target.checked)}
              />
              <label htmlFor="active" className="text-sm text-slate-700">مستخدم مفعل</label>
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-700 mb-1">{isEdit ? 'تعيين كلمة مرور جديدة (اختياري)' : 'كلمة المرور للمستخدم الجديد'}</label>
            <input
              type="password"
              className="w-full border rounded px-3 py-2 text-sm"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              placeholder={isEdit ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية' : '••••••••'}
            />
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded border border-slate-300 hover:bg-slate-50">إلغاء</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-70">
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const currentUser = useContext(AuthContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('staff_users_overview')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const users = data || [];
      // جلب حالة الورديات لليوم لكل موظف (open/closed)
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: shifts } = await supabase
          .from('reception_shifts')
          .select('id,staff_user_id,status,shift_date,closed_at')
          .eq('shift_date', todayStr);
        const shiftsByUser = (shifts || []).reduce((acc, s) => {
          acc[s.staff_user_id] = s;
          return acc;
        }, {});
        // دمج معلومات الوردية مع كل مستخدم
        const merged = users.map(u => ({ ...u, today_shift: shiftsByUser[u.id] || null }));
        setRows(merged);
      } catch (e) {
        console.warn('Could not load today shifts', e);
        setRows(users);
      }
    } catch (e) {
      console.error('Failed loading staff users', e);
      setError('تعذّر تحميل قائمة المستخدمين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isManager(currentUser)) {
      load();
    }
  }, [currentUser]);

  // حذف مستخدم (المدير فقط). لا يسمح بحذف الحساب الحالي بنفسه
  const deleteUser = async (user) => {
    if (!user || !user.id) return;
    if (user.id === currentUser?.id) {
      alert('لا يمكنك حذف حسابك الحالي.');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم ${user.full_name || user.username}? هذا الإجراء لا يمكن التراجع عنه.`)) return;
    try {
      setLoading(true);
      // حاول استخدام RPC إن وُجد، وإلا قم بحذف السجل مباشرة
      try {
        const { error: rpcErr } = await supabase.rpc('delete_staff_user', { p_id: user.id, p_deleted_by: currentUser?.id || null });
        if (rpcErr) throw rpcErr;
      } catch (rpcFallbackErr) {
        // fallback: حذف مباشر من جدول staff_users
        const { error } = await supabase.from('staff_users').delete().eq('id', user.id);
        if (error) throw error;
      }
      alert('تم حذف المستخدم بنجاح.');
      await load();
    } catch (e) {
      console.error('Delete user failed', e);
      alert('تعذّر حذف المستخدم: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  if (!isManager(currentUser)) {
    return (
      <div className="p-8" dir="rtl">
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          لا تملك صلاحية الوصول إلى صفحة إدارة المستخدمين. هذه الصفحة مخصصة للمدير فقط.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة مستخدمي النظام</h2>
          <p className="text-sm text-gray-500">إنشاء المستخدمين وتعيين الأدوار وكلمات المرور للمسؤولين والموظفين.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
        >
          إضافة مستخدم جديد +
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">جاري تحميل المستخدمين...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded shadow p-4 text-sm text-gray-600">لا يوجد مستخدمون بعد. اضغط "إضافة مستخدم جديد" لإنشاء أول حساب.</div>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-right">اسم المستخدم</th>
                <th className="px-3 py-2 text-right">الاسم الكامل</th>
                <th className="px-3 py-2 text-right">الدور</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">تاريخ الإنشاء</th>
                <th className="px-3 py-2 text-right">أنشأه</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                  <td className="px-3 py-2">{u.full_name}</td>
                  <td className="px-3 py-2">{getRoleLabel(u.role)}</td>
                  <td className="px-3 py-2">
                    {u.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">مفعل</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500 border border-slate-200">موقوف</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {/* حالة وردية اليوم (إن وجدت) */}
                    {u.today_shift ? (
                      u.today_shift.status === 'open' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-800 border border-yellow-100">مفتوح</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-100">مغلق</span>
                      )
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500 border border-slate-100">لا توجد وردية</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {u.created_by_name || u.created_by_username || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-left flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setEditing(u); setShowModal(true); }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      تعديل
                    </button>
                    {/* أدوات إدارة الوردية للمدير فقط */}
                    {isManager(currentUser) && u.role === 'reception' && (
                      <div className="flex gap-2">
                        {(!u.today_shift || u.today_shift.status === 'closed') && (
                          <button
                            type="button"
                            onClick={async () => {
                              const todayStr = new Date().toISOString().slice(0, 10);
                              if (!window.confirm(`فتح وردية اليوم لموظف ${u.full_name}؟`)) return;
                              try {
                                const { error } = await supabase.rpc('open_reception_shift_if_allowed', {
                                  p_shift_date: todayStr,
                                  p_staff_user_id: u.id,
                                });
                                if (error) throw error;
                                alert('تم فتح وردية اليوم لهذا الموظف.');
                                load();
                              } catch (e) {
                                console.error('open shift error', e);
                                const msg = e?.message || e;
                                alert('تعذّر فتح الوردية: ' + msg);
                              }
                            }}
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                          >
                            فتح وردية اليوم
                          </button>
                        )}
                        {u.today_shift && u.today_shift.status === 'open' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`أغلق الوردية المفتوحة لموظف ${u.full_name}؟`)) return;
                              try {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const { error } = await supabase
                                  .from('reception_shifts')
                                  .update({ status: 'closed', closed_at: new Date().toISOString() })
                                  .match({ staff_user_id: u.id, shift_date: todayStr, status: 'open' });
                                if (error) throw error;
                                alert('تم إغلاق الوردية بنجاح.');
                                load();
                              } catch (e) {
                                console.error('close shift error', e);
                                alert('تعذّر إغلاق الوردية: ' + (e.message || e));
                              }
                            }}
                            className="text-xs px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600"
                          >
                            إغلاق
                          </button>
                        )}
                        {u.today_shift && u.today_shift.status === 'closed' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`إعادة فتح الوردية المغلقة لموظف ${u.full_name}؟`)) return;
                              try {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const { error } = await supabase
                                  .from('reception_shifts')
                                  .update({ status: 'open', closed_at: null })
                                  .match({ staff_user_id: u.id, shift_date: todayStr, status: 'closed' });
                                if (error) throw error;
                                alert('تم إعادة فتح الوردية بنجاح.');
                                load();
                              } catch (e) {
                                console.error('reopen shift error', e);
                                alert('تعذّر إعادة فتح الوردية: ' + (e.message || e));
                              }
                            }}
                            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            إعادة فتح
                          </button>
                        )}
                        {u.today_shift && u.today_shift.status === 'open' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`إنهاء الوردية المفتوحة (حالة طوارئ) لموظف ${u.full_name}؟`)) return;
                              try {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const { error } = await supabase
                                  .from('reception_shifts')
                                  .update({ status: 'closed', closed_at: new Date().toISOString() })
                                  .match({ staff_user_id: u.id, shift_date: todayStr, status: 'open' });
                                if (error) throw error;
                                alert('تم إنهاء الوردية (طوارئ) بنجاح.');
                                load();
                              } catch (e) {
                                console.error('force end shift error', e);
                                alert('تعذّر إنهاء الوردية: ' + (e.message || e));
                              }
                            }}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            إنهاء طوارئ
                          </button>
                        )}
                        {/* إغلاق ورديات قديمة مفتوحة لهذا الموظف */}
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`إغلاق أي ورديات مفتوحة من أيام سابقة لموظف ${u.full_name}؟`)) return;
                            try {
                              const todayStr = new Date().toISOString().slice(0, 10);
                              const { error } = await supabase
                                .from('reception_shifts')
                                .update({ status: 'closed', closed_at: new Date().toISOString() })
                                .lt('shift_date', todayStr)
                                .eq('staff_user_id', u.id)
                                .eq('status', 'open');
                              if (error) throw error;
                              alert('تم إغلاق أي ورديات قديمة مفتوحة لهذا الموظف.');
                              load();
                            } catch (e) {
                              console.error('close stale shifts error', e);
                              alert('تعذّر إغلاق الورديات القديمة: ' + (e.message || e));
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700"
                        >
                          إغلاق ورديات قديمة
                        </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(u)}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            حذف
                          </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <UserModal
          initialData={editing}
          currentUser={currentUser}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
