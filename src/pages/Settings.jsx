import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager } from '../utils/permissions.js';

export default function Settings() {
  const currentUser = useContext(AuthContext);
  const [autoShiftsEnabled, setAutoShiftsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recentShifts, setRecentShifts] = useState([]);
  const [handoverLoading, setHandoverLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: setting, error: settingError }, { data: shifts, error: shiftsError }] = await Promise.all([
          supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'auto_reception_shifts')
            .maybeSingle(),
          supabase
            .from('reception_shifts')
            .select('id,shift_date,staff_user_id,expected_cash,counted_cash,difference,status,closed_at')
            .eq('status', 'closed')
            .order('shift_date', { ascending: false })
            .order('closed_at', { ascending: false })
            .limit(10),
        ]);

        if (settingError && settingError.code !== 'PGRST116') throw settingError;
        if (shiftsError && shiftsError.code !== 'PGRST116') throw shiftsError;

        const enabled = !!(setting && setting.value && setting.value.enabled === true);
        setAutoShiftsEnabled(enabled);
        setRecentShifts(shifts || []);
      } catch (e) {
        console.error('load system settings/shift summary error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = async () => {
    if (!isManager(currentUser)) {
      alert('فقط المدير يمكنه تعديل إعدادات النظام.');
      return;
    }
    const next = !autoShiftsEnabled;
    setSaving(true);
    try {
      const payload = {
        key: 'auto_reception_shifts',
        value: { enabled: next },
      };
      if (currentUser && currentUser.id) {
        payload.updated_by = currentUser.id;
      }
      const { error } = await supabase.from('system_settings').upsert(payload);
      if (error) throw error;
      setAutoShiftsEnabled(next);
    } catch (e) {
      console.error('save system settings error', e);
      alert('تعذّر حفظ الإعداد: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleHandoverToManager = async (shift) => {
    if (!isManager(currentUser)) {
      alert('فقط المدير يمكنه تسجيل تسليم نقدي من الوردية.');
      return;
    }
    const defaultAmount = Number(shift.counted_cash ?? shift.expected_cash ?? 0) || 0;
    const input = window.prompt(
      `أدخل مبلغ التسليم النقدي من هذه الوردية للإدارة (جنيه).\nالقيمة الافتراضية بناءً على عدّ الوردية: ${defaultAmount}`,
      defaultAmount ? String(defaultAmount) : ''
    );
    if (input === null) return;
    const normalized = String(input).replace(',', '.');
    const amount = Number(normalized || 0);
    if (!(amount >= 0)) {
      alert('من فضلك أدخل مبلغًا رقميًا صالحًا.');
      return;
    }

    setHandoverLoading(true);
    try {
      const payload = {
        from_shift_id: shift.id,
        to_manager_id: currentUser.id,
        amount,
        tx_date: shift.shift_date,
        note: 'تسليم نقدي من وردية الاستقبال إلى الإدارة',
      };
      if (currentUser && currentUser.id) {
        payload.created_by = currentUser.id;
      }
      const { error } = await supabase.from('reception_shift_handovers').insert(payload);
      if (error) throw error;
      alert('تم تسجيل تسليم النقدية من هذه الوردية للإدارة بنجاح.');
    } catch (e) {
      console.error('save shift handover error', e);
      alert('تعذّر تسجيل التسليم: ' + (e.message || e));
    } finally {
      setHandoverLoading(false);
    }
  };

  if (!isManager(currentUser)) {
    return (
      <div className="p-6" dir="rtl">
        <h1 className="text-xl font-bold mb-2">إعدادات النظام</h1>
        <p className="text-sm text-gray-500">فقط المدير يمكنه الوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">إعدادات النظام</h1>
      <div className="bg-white rounded-lg border p-4 flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-gray-800 text-sm">فتح ورديات الاستقبال تلقائيًا</div>
            <div className="text-xs text-gray-500 mt-0.5">
              عند تفعيل هذا الخيار سيتم فتح وردية استقبال تلقائيًا لموظف الاستقبال عند الدخول للوحة التحكم
              ضمن فترات الوردية: 8 ص – 4 م، 4 م – 12 ص، 12 ص – 8 ص.
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading || saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
              autoShiftsEnabled ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-200 border-gray-300'
            } ${loading || saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoShiftsEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {(loading || saving) && (
          <div className="text-xs text-gray-400">جارٍ تحميل/حفظ الإعدادات...</div>
        )}
      </div>

      <div className="bg-white rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-gray-800 text-sm">تسليم ورديات الاستقبال نقديًا للإدارة</div>
          <div className="text-[11px] text-gray-500">استخدم هذه القائمة لتسجيل أن الوردية سلّمت النقدية للإدارة.</div>
        </div>
        {loading ? (
          <div className="text-xs text-gray-400">جارٍ تحميل آخر الوردات المغلقة...</div>
        ) : recentShifts.length === 0 ? (
          <div className="text-xs text-gray-400">لا توجد ورديات مغلقة مؤخرًا.</div>
        ) : (
          <div className="overflow-x-auto max-h-64 text-xs">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-right text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">التاريخ</th>
                  <th className="px-2 py-1.5">معرّف الوردية</th>
                  <th className="px-2 py-1.5">المتوقَّع</th>
                  <th className="px-2 py-1.5">العدّ الفعلي</th>
                  <th className="px-2 py-1.5">الفرق</th>
                  <th className="px-2 py-1.5">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1.5 whitespace-nowrap">{s.shift_date}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-gray-700">{s.id.slice(0, 8)}...</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{Number(s.expected_cash ?? 0)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{Number(s.counted_cash ?? 0)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{Number(s.difference ?? 0)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={handoverLoading}
                        onClick={() => handleHandoverToManager(s)}
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] disabled:opacity-60"
                      >
                        تسجيل تسليم للإدارة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
