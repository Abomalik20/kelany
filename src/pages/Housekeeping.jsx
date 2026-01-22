import React, { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { getRoomStatusLabelAr, getCleanlinessLabelAr } from '../utils/status';

export default function Housekeeping() {
  const currentUser = useContext(AuthContext);
  const [staff, setStaff] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cleanFilter, setCleanFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [laundryItems, setLaundryItems] = useState([]);
  const role = currentUser?.role;
  const isHousekeeper = role === 'housekeeping';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('housekeeping_overview', { p_date: date });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error('Failed to load housekeeping overview', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users_overview')
        .select('id, full_name, role, is_active')
        .order('full_name');
      if (error) throw error;
      setStaff((data || []).filter(s => s.is_active));
    } catch (e) {
      console.error('Failed to load staff for housekeeping', e);
      setStaff([]);
    }
  }, []);

  const loadLaundryItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('laundry_items')
        .select('id, code, name')
        .order('code');
      if (error) throw error;
      setLaundryItems(data || []);
    } catch (e) {
      console.error('Failed to load laundry items for housekeeping', e);
      setLaundryItems([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStaff();
    loadLaundryItems();
  }, [loadStaff, loadLaundryItems]);

  const filtered = useMemo(() => {
    const term = (search || '').trim().toLowerCase();
    return (rows || []).filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (cleanFilter !== 'all' && r.cleanliness !== cleanFilter) return false;
      if (taskFilter === 'with_task' && !r.task_id) return false;
      if (taskFilter === 'without_task' && r.task_id) return false;
      if (term) {
        const text = [
          r.room_code,
          r.building_name,
          r.floor_name,
          r.current_guest_name,
          r.assigned_to_name,
        ].join(' ').toLowerCase();
        if (!text.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, cleanFilter, taskFilter]);

  const myTasks = useMemo(() => {
    if (!isHousekeeper) return [];
    return (rows || [])
      .filter(r => r.task_id && r.assigned_to_id === currentUser?.id)
      .sort((a, b) => {
        const pa = a.task_priority ?? 0;
        const pb = b.task_priority ?? 0;
        return pb - pa;
      });
  }, [rows, isHousekeeper, currentUser]);

  const handleToggleTask = async (row, type, staffId) => {
    try {
      const payload = {
        p_room_id: row.room_id,
        p_task_date: date,
        p_task_type: type,
        p_created_by: currentUser?.id || null,
        p_assigned_to: staffId || currentUser?.id || null,
      };
      const { error } = await supabase.rpc('upsert_housekeeping_task', payload);
      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error('Update task failed', e);
      window.alert('تعذّر تحديث مهمة التنظيف: ' + (e.message || e));
    }
  };

  const handleLaundryOut = async (row) => {
    try {
      const itemId = row._laundryItemDraft;
      const qty = parseInt(row._laundryQtyDraft || '0', 10);
      if (!itemId || !qty || qty <= 0) {
        window.alert('اختر صنفًا وحدد كمية صحيحة قبل إرسال للاندري.');
        return;
      }
      const payload = {
        p_item_id: itemId,
        p_direction: 'out',
        p_quantity: qty,
        p_room_id: row.room_id,
        p_reservation_id: row.current_reservation_id || null,
        p_note: `إرسال مفروشات من الغرفة ${row.room_code} للاندري`,
        p_staff_user_id: currentUser?.id || null,
      };
      const { error } = await supabase.rpc('create_laundry_movement', payload);
      if (error) throw error;
      window.alert('تم تسجيل حركة اللاندري للغرفة بنجاح.');
    } catch (e) {
      console.error('Laundry movement from housekeeping failed', e);
      window.alert('تعذّر تسجيل حركة اللاندري من شاشة التنظيف: ' + (e.message || e));
    }
  };

  const handleTaskStatusChange = async (row, status) => {
    try {
      if (!row.task_id) {
        window.alert('لا توجد مهمة مرتبطة بهذه الغرفة.');
        return;
      }
      const payload = {
        p_task_id: row.task_id,
        p_status: status,
        p_staff_user_id: currentUser?.id || null,
      };
      const { error } = await supabase.rpc('set_housekeeping_task_status', payload);
      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error('Set task status failed', e);
      window.alert('تعذّر تحديث حالة مهمة التنظيف: ' + (e.message || e));
    }
  };

  if (isHousekeeper) {
    const total = myTasks.length;
    const pending = myTasks.filter(t => !t.task_status || t.task_status === 'pending').length;
    const inProgress = myTasks.filter(t => t.task_status === 'in_progress').length;
    const done = myTasks.filter(t => t.task_status === 'done').length;

    return (
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">مهام التنظيف اليوم ({date})</h2>
            <p className="text-sm text-gray-500">هذه الشاشة مخصّصة لموظفي الهوس كيپنج لعرض وتنفيذ المهام الموكلة لهم فقط.</p>
          </div>
          <div className="text-sm text-right">
            <div>إجمالي المهام: <span className="font-semibold">{total}</span></div>
            <div>قيد الانتظار: <span className="font-semibold text-amber-600">{pending}</span></div>
            <div>جاري التنفيذ: <span className="font-semibold text-blue-600">{inProgress}</span></div>
            <div>منجزة: <span className="font-semibold text-green-600">{done}</span></div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2 flex-1 min-w-[200px]"
            placeholder="بحث عن غرفة أو نزيل"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-white rounded shadow overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right">الغرفة</th>
                <th className="px-3 py-2 text-right">المبنى / الطابق</th>
                <th className="px-3 py-2 text-right">نوع المهمة</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">الأولوية</th>
                <th className="px-3 py-2 text-right">النزيل</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">جاري تحميل مهامك لليوم...</td>
                </tr>
              ) : myTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">لا توجد مهام مكلَّفة لك في هذا اليوم.</td>
                </tr>
              ) : (
                myTasks
                  .filter(row => {
                    const term = (search || '').trim().toLowerCase();
                    if (!term) return true;
                    const text = [
                      row.room_code,
                      row.building_name,
                      row.floor_name,
                      row.current_guest_name,
                    ].join(' ').toLowerCase();
                    return text.includes(term);
                  })
                  .map(row => (
                    <tr key={row.room_id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold">{row.room_code}</td>
                      <td className="px-3 py-2">{row.building_name} / {row.floor_name}</td>
                      <td className="px-3 py-2">{row.task_type || '—'}</td>
                      <td className="px-3 py-2">
                        {row.task_status === 'done' && <span className="text-green-700 bg-green-50 px-2 py-1 rounded text-xs">منجزة</span>}
                        {row.task_status === 'in_progress' && <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded text-xs">جاري التنفيذ</span>}
                        {!row.task_status || row.task_status === 'pending' ? <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs">قيد الانتظار</span> : null}
                      </td>
                      <td className="px-3 py-2">{row.task_priority ?? '—'}</td>
                      <td className="px-3 py-2">{row.current_guest_name || '—'}</td>
                      <td className="px-3 py-2 space-x-1 space-x-reverse">
                        <button
                          className="inline-block mb-1 bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 text-xs"
                          onClick={() => handleTaskStatusChange(row, 'in_progress')}
                        >
                          بدء المهمة
                        </button>
                        <button
                          className="inline-block mb-1 bg-green-50 text-green-700 border border-green-200 rounded px-2 py-1 text-xs"
                          onClick={() => handleTaskStatusChange(row, 'done')}
                        >
                          إنهاء المهمة
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة التنظيف / الهوس كيپنج</h2>
          <p className="text-sm text-gray-500">متابعة حالة الغرف، المهام اليومية، وحركة الملايات والفوط عبر اللاندري الخارجي (الجزء الثاني عبر صفحة مستقلة لاحقًا).</p>
        </div>
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 min-w-[200px] flex-1"
          placeholder="بحث: رقم الغرفة / المبنى / النزيل / الموظف"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="border rounded px-3 py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">كل حالات الغرفة</option>
          <option value="available">متاحة</option>
          <option value="reserved">محجوزة</option>
          <option value="occupied">مشغولة</option>
          <option value="maintenance">صيانة</option>
        </select>
        <select className="border rounded px-3 py-2" value={cleanFilter} onChange={e => setCleanFilter(e.target.value)}>
          <option value="all">كل حالات النظافة</option>
          <option value="clean">نظيفة</option>
          <option value="in_cleaning">جاري تنظيف</option>
          <option value="needs_cleaning">تحتاج نظافة</option>
        </select>
        <select className="border rounded px-3 py-2" value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
          <option value="all">كل الغرف</option>
          <option value="with_task">بها مهمة اليوم</option>
          <option value="without_task">بدون مهمة</option>
        </select>
      </div>

      <div className="bg-white rounded shadow overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-right">الغرفة</th>
              <th className="px-3 py-2 text-right">المبنى / الطابق</th>
              <th className="px-3 py-2 text-right">حالة الغرفة</th>
              <th className="px-3 py-2 text-right">نظافة</th>
              <th className="px-3 py-2 text-right">النزيل الحالي</th>
              <th className="px-3 py-2 text-right">مهمة اليوم</th>
              <th className="px-3 py-2 text-right">المسؤول</th>
              <th className="px-3 py-2 text-right">إجراءات سريعة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">جاري تحميل بيانات التنظيف...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">لا توجد غرف مطابقة للمعايير الحالية.</td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr key={row.room_id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-semibold">{row.room_code}</td>
                  <td className="px-3 py-2">{row.building_name} / {row.floor_name}</td>
                  <td className="px-3 py-2">{getRoomStatusLabelAr(row.status)}</td>
                  <td className="px-3 py-2">{getCleanlinessLabelAr(row.cleanliness)}</td>
                  <td className="px-3 py-2">{row.current_guest_name || '—'}</td>
                  <td className="px-3 py-2">{row.task_type ? row.task_type : 'لا يوجد'}</td>
                  <td className="px-3 py-2">{row.assigned_to_name || 'غير محدد'}</td>
                  <td className="px-3 py-2 space-y-1">
                    <div className="flex flex-wrap gap-1 items-center">
                      <select
                        className="border rounded px-1 py-1 text-xs max-w-[140px]"
                        defaultValue={currentUser?.id || ''}
                        onChange={(e)=>{ row._assignedDraft = e.target.value || null; }}
                      >
                        <option value="">اختر موظفًا</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>{s.full_name}</option>
                        ))}
                      </select>
                      <button
                        className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 text-xs"
                        onClick={() => handleToggleTask(row, 'stayover_clean', row._assignedDraft)}
                      >
                        تنظيف إقامة
                      </button>
                      <button
                        className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1 text-xs"
                        onClick={() => handleToggleTask(row, 'checkout_clean', row._assignedDraft)}
                      >
                        تنظيف خروج
                      </button>
                      <button
                        className="inline-block bg-green-50 text-green-700 border border-green-200 rounded px-2 py-1 text-xs"
                        onClick={() => handleToggleTask(row, 'linen_change', row._assignedDraft)}
                      >
                        تغيير مفروشات
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 items-center text-xs">
                      <select
                        className="border rounded px-1 py-1 max-w-[140px]"
                        defaultValue=""
                        onChange={(e)=>{ row._laundryItemDraft = e.target.value || null; }}
                      >
                        <option value="">صنف لاندري</option>
                        {laundryItems.map(it => (
                          <option key={it.id} value={it.id}>{it.code} - {it.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="border rounded px-1 py-1 w-16"
                        placeholder="كمية"
                        onChange={(e)=>{ row._laundryQtyDraft = e.target.value; }}
                      />
                      <button
                        className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-1 text-xs"
                        onClick={() => handleLaundryOut(row)}
                      >
                        إرسال للاندري
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
