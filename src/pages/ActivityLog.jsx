import React, { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../App.jsx';
import { isManager, isAssistantManager } from '../utils/permissions';

const ENTITY_LABELS = {
  building: 'مبنى',
  reservation: 'حجز',
  guest: 'نزيل',
  room: 'غرفة',
  floor: 'طابق',
};

const ACTION_LABELS = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  status_change: 'تغيير حالة',
  check_in: 'تسجيل دخول',
  check_out: 'تسجيل خروج',
};

export default function ActivityLog() {
  const currentUser = useContext(AuthContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = () => {
    const q = supabase
      .from('staff_activity_overview')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (entity) q.eq('entity_type', entity);
    if (action) q.eq('action', action);

    const term = (debounced || '').trim();
    if (term) {
      q.or(`details.ilike.%${term}%,staff_name.ilike.%${term}%,staff_username.ilike.%${term}%`);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;
    q.range(from, to);
    return q;
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data, error, count } = await buildQuery();
      if (error) throw error;
      setRows(data || []);
      setTotalCount(count || 0);
    } catch (e) {
      console.error('Load activity log failed', e);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [load, debounced, entity, action, page, pageSize]);

  const canView = useMemo(() => isManager(currentUser) || isAssistantManager(currentUser), [currentUser]);

  if (!canView) {
    return (
      <div className="p-8" dir="rtl">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          لا تملك صلاحية عرض سجل النشاطات. هذه الصفحة مخصصة للإدارة فقط.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">سجل نشاطات النظام</h2>
          <p className="text-sm text-gray-500">متابعة من أضاف، عدّل، أو حذف الحجوزات والنزلاء والمباني</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            className="border rounded pl-9 pr-3 py-2 w-full"
            placeholder="بحث في التفاصيل أو اسم الموظف"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={entity}
          onChange={e => { setEntity(e.target.value); setPage(0); }}
        >
          <option value="">كل الكيانات</option>
          <option value="building">المباني</option>
          <option value="reservation">الحجوزات</option>
          <option value="guest">النزلاء</option>
        </select>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={action}
          onChange={e => { setAction(e.target.value); setPage(0); }}
        >
          <option value="">كل العمليات</option>
          <option value="create">إضافة</option>
          <option value="update">تعديل</option>
          <option value="delete">حذف</option>
          <option value="status_change">تغيير حالة</option>
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-500">...جاري تحميل سجل النشاطات</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-gray-500">لا توجد سجلات نشاط مطابقة</div>
      ) : (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-right">
                <th className="px-3 py-2">التاريخ والوقت</th>
                <th className="px-3 py-2">الموظف</th>
                <th className="px-3 py-2">الكيان</th>
                <th className="px-3 py-2">العملية</th>
                <th className="px-3 py-2">رقم السجل</th>
                <th className="px-3 py-2">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const entityLabel = ENTITY_LABELS[r.entity_type] || r.entity_type;
                const actionLabel = ACTION_LABELS[r.action] || r.action;
                const dt = r.created_at ? new Date(r.created_at) : null;
                const dtStr = dt
                  ? dt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
                  : '';
                return (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{dtStr}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium">{r.staff_name || 'غير محدد'}</div>
                      <div className="text-xs text-gray-500">{r.staff_username || ''}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">{entityLabel}</td>
                    <td className="px-3 py-2 text-sm">{actionLabel}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.entity_id || '-'}</td>
                    <td className="px-3 py-2 text-sm max-w-xl whitespace-normal break-words">{r.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">النتائج: {rows.length} / الإجمالي: {totalCount}</div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            السابق
          </button>
          <span className="text-sm">صفحة {page + 1}</span>
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * pageSize >= totalCount}
          >
            التالي
          </button>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
    </div>
  );
}
