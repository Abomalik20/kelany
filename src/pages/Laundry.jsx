import React, { useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager, isAssistantManager } from '../utils/permissions';

export default function Laundry() {
  const currentUser = useContext(AuthContext);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterItemId, setFilterItemId] = useState('all');
  const [_staff, setStaff] = useState([]); // loaded but not used in UI yet
  const [newItem, setNewItem] = useState({ code: '', name: '', unit: 'قطعة' });
  const [movementForm, setMovementForm] = useState({ item_id: '', direction: 'out', quantity: 1, note: '' });
  const isStockManager = isManager(currentUser) || isAssistantManager(currentUser);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase.rpc('laundry_items_overview', { p_date: date });
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error('Failed to load laundry items overview', e);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [date]);

  const loadMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const params = { p_from: fromDate, p_to: toDate };
      if (filterItemId && filterItemId !== 'all') {
        params.p_item_id = filterItemId;
      }
      const { data, error } = await supabase.rpc('laundry_movements_overview', params);
      if (error) throw error;
      setMovements(data || []);
    } catch (e) {
      console.error('Failed to load laundry movements', e);
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  }, [fromDate, toDate, filterItemId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data, error } = await supabase.from('staff_users_overview').select('id, full_name, role, is_active').order('full_name');
        if (error) throw error;
        setStaff((data || []).filter(s => s.is_active));
      } catch (e) {
        console.error('Failed to load staff for laundry', e);
        setStaff([]);
      }
    };
    loadStaff();
  }, []);

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!isStockManager) {
      window.alert('فقط المدير أو نائب المدير يمكنهما إضافة أصناف اللاندري.');
      return;
    }
    if (!newItem.code || !newItem.name) return;
    try {
      const { error } = await supabase.from('laundry_items').insert([{
        code: newItem.code.trim(),
        name: newItem.name.trim(),
        unit: (newItem.unit || 'قطعة').trim(),
      }]);
      if (error) throw error;
      setNewItem({ code: '', name: '', unit: 'قطعة' });
      await loadItems();
    } catch (e2) {
      console.error('Failed to add laundry item', e2);
      window.alert('تعذّر إضافة الصنف: ' + (e2.message || e2));
    }
  };

  const handleNewMovement = async (e) => {
    e.preventDefault();
    if (!movementForm.item_id || !movementForm.quantity) return;
    try {
      if (!isStockManager && (movementForm.direction === 'in' || movementForm.direction === 'adjust')) {
        window.alert('فقط المدير أو نائب المدير يمكنهما تسجيل حركات "دخول" أو "تسوية مخزون". يمكنك فقط تسجيل خروج أو إهلاك.');
        return;
      }
      const payload = {
        p_item_id: movementForm.item_id,
        p_direction: movementForm.direction,
        p_quantity: Number(movementForm.quantity),
        p_note: movementForm.note || null,
        p_staff_user_id: currentUser?.id || null,
      };
      const { error } = await supabase.rpc('create_laundry_movement', payload);
      if (error) throw error;
      setMovementForm(f => ({ ...f, quantity: 1, note: '' }));
      await Promise.all([loadItems(), loadMovements()]);
    } catch (e2) {
      console.error('Failed to create laundry movement', e2);
      window.alert('تعذّر تسجيل حركة اللاندري: ' + (e2.message || e2));
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!isStockManager) {
      window.alert('فقط المدير أو نائب المدير يمكنهما حذف أصناف اللاندري.');
      return;
    }
    const ok = window.confirm('هل أنت متأكد من حذف هذا الصنف؟ سيتم فقدان رصيده المرتبط.');
    if (!ok) return;
    try {
      const { error } = await supabase.from('laundry_items').delete().eq('id', itemId);
      if (error) throw error;
      await loadItems();
    } catch (e2) {
      console.error('Failed to delete laundry item', e2);
      window.alert('تعذّر حذف الصنف: ' + (e2.message || e2));
    }
  };

  const handleDeleteMovement = async (movementId) => {
    if (!isStockManager) {
      window.alert('فقط المدير أو نائب المدير يمكنهما حذف حركات اللاندري.');
      return;
    }
    const ok = window.confirm('هل أنت متأكد من حذف حركة اللاندري هذه؟');
    if (!ok) return;
    try {
      const { error } = await supabase.from('laundry_movements').delete().eq('id', movementId);
      if (error) throw error;
      await Promise.all([loadItems(), loadMovements()]);
    } catch (e2) {
      console.error('Failed to delete laundry movement', e2);
      window.alert('تعذّر حذف الحركة: ' + (e2.message || e2));
    }
  };

  // TODO: قد نستخدم itemMap لاحقًا لمعالجة الأصناف بشكل أسرع
  // const itemMap = useMemo(() => {
  //   const m = new Map();
  //   (items || []).forEach(it => m.set(it.item_id, it));
  //   return m;
  // }, [items]);

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة اللاندري / المخزون</h2>
          <p className="text-sm text-gray-500">تعريف أصناف اللاندري، متابعة الرصيد، وتسجيل حركات الخروج للاندري والرجوع منه.</p>
        </div>
      </div>

      {/* Items & stock section */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
          <h3 className="font-semibold text-lg">الأصناف والرصيد الحالي</h3>
            {isStockManager && (
              <form onSubmit={handleAddItem} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  className="border rounded px-2 py-1 w-28"
                  placeholder="كود"
                  value={newItem.code}
                  onChange={e=>setNewItem(v=>({...v, code:e.target.value}))}
                />
                <input
                  className="border rounded px-2 py-1 w-40"
                  placeholder="اسم الصنف"
                  value={newItem.name}
                  onChange={e=>setNewItem(v=>({...v, name:e.target.value}))}
                />
                <input
                  className="border rounded px-2 py-1 w-24"
                  placeholder="الوحدة"
                  value={newItem.unit}
                  onChange={e=>setNewItem(v=>({...v, unit:e.target.value}))}
                />
                <label className="flex items-center gap-1">
                  <span>تاريخ ملخص اليوم</span>
                  <input
                    type="date"
                    className="border rounded px-2 py-1 text-sm"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                >
                  إضافة صنف
                </button>
              </form>
            )}
        </div>
        <div className="bg-white rounded shadow overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right">الكود</th>
                <th className="px-3 py-2 text-right">الاسم</th>
                <th className="px-3 py-2 text-right">الوحدة</th>
                <th className="px-3 py-2 text-right">الرصيد الحالي</th>
                <th className="px-3 py-2 text-right">خرج اليوم</th>
                <th className="px-3 py-2 text-right">دخل اليوم</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">جاري تحميل بيانات الأصناف...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">لا توجد أصناف مسجلة. استخدم زر "إضافة صنف لاندري" أعلاه.</td>
                </tr>
              ) : (
                items.map(it => (
                  <tr key={it.item_id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{it.code}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2">{it.unit}</td>
                    <td className="px-3 py-2">{it.stock_quantity}</td>
                    <td className="px-3 py-2 text-red-600">{it.out_today}</td>
                    <td className="px-3 py-2 text-green-600">{it.in_today}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {isStockManager && (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={()=>handleDeleteItem(it.item_id)}
                        >
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movements section */}
      <div>
        <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
          <h3 className="font-semibold text-lg">حركات اللاندري</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600 flex items-center gap-1">
              من
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </label>
            <label className="text-sm text-gray-600 flex items-center gap-1">
              إلى
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={filterItemId}
              onChange={e => setFilterItemId(e.target.value)}
            >
              <option value="all">كل الأصناف</option>
              {(items || []).map(it => (
                <option key={it.item_id} value={it.item_id}>{it.code} - {it.name}</option>
              ))}
            </select>
          </div>
          <form onSubmit={handleNewMovement} className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className="border rounded px-2 py-1 min-w-[160px]"
              value={movementForm.item_id}
              onChange={e=>setMovementForm(f=>({...f, item_id:e.target.value}))}
            >
              <option value="">اختر صنفًا</option>
              {(items || []).map(it => (
                <option key={it.item_id} value={it.item_id}>{it.code} - {it.name}</option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1"
              value={movementForm.direction}
              onChange={e=>setMovementForm(f=>({...f, direction:e.target.value}))}
            >
              <option value="out">خروج إلى اللاندري</option>
              <option value="in">رجوع من اللاندري</option>
              <option value="discard">إهلاك</option>
              {isStockManager && <option value="adjust">تسوية مخزون</option>}
            </select>
            <input
              type="number"
              min="1"
              className="border rounded px-2 py-1 w-20"
              value={movementForm.quantity}
              onChange={e=>setMovementForm(f=>({...f, quantity:e.target.value}))}
            />
            <input
              className="border rounded px-2 py-1 w-40"
              placeholder="ملاحظة (اختياري)"
              value={movementForm.note}
              onChange={e=>setMovementForm(f=>({...f, note:e.target.value}))}
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded"
            >
              تسجيل حركة لاندري
            </button>
          </form>
        </div>

        <div className="bg-white rounded shadow overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ/الوقت</th>
                <th className="px-3 py-2 text-right">الصنف</th>
                <th className="px-3 py-2 text-right">الاتجاه</th>
                <th className="px-3 py-2 text-right">الكمية</th>
                <th className="px-3 py-2 text-right">الغرفة</th>
                <th className="px-3 py-2 text-right">النظام/الملاحظة</th>
                <th className="px-3 py-2 text-right">الموظف</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loadingMovements ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">جاري تحميل حركات اللاندري...</td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">لا توجد حركات في الفترة المختارة.</td>
                </tr>
              ) : (
                movements.map(mv => (
                  <tr key={mv.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(mv.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{mv.item_code} - {mv.item_name}</td>
                    <td className="px-3 py-2">{mv.direction}</td>
                    <td className="px-3 py-2">{mv.quantity}</td>
                    <td className="px-3 py-2">{mv.room_code || '—'}</td>
                    <td className="px-3 py-2">{mv.note || '—'}</td>
                    <td className="px-3 py-2">{mv.staff_name || 'غير محدد'}</td>
                    <td className="px-3 py-2">
                      {isStockManager && (
                        <button
                          type="button"
                          className="text-red-600 hover:underline text-xs"
                          onClick={()=>handleDeleteMovement(mv.id)}
                        >
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
