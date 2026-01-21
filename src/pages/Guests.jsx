import React, { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import GuestCard from '../components/GuestCard';
import GuestModal from '../components/GuestModal';
import GuestHistoryModal from '../components/GuestHistoryModal';
import { AuthContext } from '../App.jsx';

export default function Guests() {
  const currentUser = useContext(AuthContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ current: false, upcoming: false, vip: false, inactive: false });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = () => {
    const q = supabase
      .from('guests_overview')
      .select('*', { count: 'exact' })
      .order('full_name', { ascending: true, nullsFirst: false });

    const term = (debounced || '').trim();
    if (term) {
      q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,national_id.ilike.%${term}%,email.ilike.%${term}%`);
    }
    if (filters.current) q.eq('has_current_stay', true);
    if (filters.upcoming) q.eq('has_upcoming_reservation', true);
    if (filters.vip) q.eq('is_vip', true);
    if (filters.inactive) q.eq('is_inactive', true);

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
      console.error('Load guests failed', e);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadNewCount = async () => {
    try {
      const d = new Date();
      d.setHours(0,0,0,0);
      const todayIso = d.toISOString();
      const { error, count } = await supabase
        .from('guests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayIso);
      if (error) throw error;
      setNewCount(count || 0);
    } catch (e) {
      console.warn('Load new guests count failed', e);
      setNewCount(0);
    }
  };

  useEffect(() => { load(); }, [debounced, filters, page, pageSize]);
  useEffect(() => { loadNewCount(); }, []);

  const counters = useMemo(() => {
    const total = rows.length;
    const current = rows.filter(r => r.has_current_stay).length;
    const upcoming = rows.filter(r => r.has_upcoming_reservation).length;
    const vip = rows.filter(r => r.is_vip).length;
    const inactive = rows.filter(r => !r.has_current_stay && !r.has_upcoming_reservation).length;
    return { total, current, upcoming, vip, inactive };
  }, [rows]);

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit = (row) => { setEditing(row); setShowModal(true); };
  const [showHistory, setShowHistory] = useState(false);
  const [historyGuest, setHistoryGuest] = useState(null);
  const openHistory = (row) => { setHistoryGuest(row); setShowHistory(true); };

  const handleSave = async (payload) => {
    try {
      // Duplicate detection by phone or national_id when creating
      if (!editing || !editing.id) {
        const phoneVal = (payload.phone || '').trim();
        const nidVal = (payload.national_id || '').trim();
        if (phoneVal || nidVal) {
          let orCond = [];
          if (phoneVal) orCond.push(`phone.eq.${phoneVal}`);
          if (nidVal) orCond.push(`national_id.eq.${nidVal}`);
          const { data: dup, error: dupErr } = await supabase
            .from('guests')
            .select('id, full_name, phone, national_id, created_at')
            .or(orCond.join(','))
            .limit(5);
          if (dupErr) throw dupErr;
          if (dup && dup.length > 0) {
            const choice = window.confirm(`يوجد نزيل مسجل بنفس الهاتف/الهوية:\n${dup[0].full_name || 'بدون اسم'}\nتاريخ: ${dup[0].created_at ? new Date(dup[0].created_at).toLocaleDateString('ar-EG') : ''}\nهل تريد فتح بطاقة هذا النزيل بدلاً من إنشاء جديد؟`);
            if (choice) {
              setEditing(dup[0]);
              // keep modal open with updated initialData
              return;
            }
          }
        }
      }
      const full_name = `${String(payload.first_name||'').trim()} ${String(payload.last_name||'').trim()}`.trim() || (payload.full_name || '').trim();
      const cleaned = {
        first_name: (payload.first_name || '').trim() || null,
        last_name: (payload.last_name || '').trim() || null,
        full_name: full_name || null,
        avatar_url: (payload.avatar_url || '').trim() || null,
        id_doc_type: (payload.id_doc_type || '').trim() || null,
        id_doc_number: (payload.id_doc_number || '').trim() || null,
        id_doc_url: (payload.id_doc_url || '').trim() || null,
        id_doc_uploaded_at: payload.id_doc_url ? (payload.id_doc_uploaded_at || new Date().toISOString()) : null,
        email: (payload.email || '').trim() || null,
        phone: payload.phone || null,
        nationality: (payload.nationality || '').trim() || null,
        national_id: payload.national_id || null,
        address: (payload.address || '').trim() || null,
        city: (payload.city || '').trim() || null,
        country: (payload.country || '').trim() || null,
        is_vip: !!payload.is_vip,
        notes: (payload.notes || '').trim() || null,
      };
      // Audit: track which staff created/updated the guest
      if (currentUser && currentUser.id) {
        if (editing && editing.id) {
          cleaned.updated_by = currentUser.id;
        } else {
          cleaned.created_by = currentUser.id;
        }
      }
      // Try saving with extended fields; if schema lacks columns, fallback to minimal payload
      const saveMinimal = async () => {
        const minimal = {
          full_name: cleaned.full_name,
          phone: cleaned.phone,
          national_id: cleaned.national_id,
        };
        if (editing && editing.id) {
          const { error: e2 } = await supabase.from('guests').update(minimal).eq('id', editing.id);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await supabase.from('guests').insert([minimal]);
          if (e2) throw e2;
        }
      };

      if (editing && editing.id) {
        const { error } = await supabase.from('guests').update(cleaned).eq('id', editing.id);
        if (error) {
          if (String(error.message || '').toLowerCase().includes('schema') || String(error.message || '').toLowerCase().includes('column')) {
            await saveMinimal();
          } else {
            throw error;
          }
        }
      } else {
        const { error } = await supabase.from('guests').insert([cleaned]);
        if (error) {
          if (String(error.message || '').toLowerCase().includes('schema') || String(error.message || '').toLowerCase().includes('column')) {
            await saveMinimal();
          } else {
            throw error;
          }
        }
      }
      setShowModal(false);
      await load();
      await loadNewCount();
    } catch (e) {
      console.error('Save guest failed', e);
      window.alert('تعذّر حفظ النزيل: ' + (e.message || e));
    }
  };

  const handleDelete = async (row) => {
    try {
      const confirmText = window.prompt('لتأكيد الحذف اكتب: ok', '');
      if (!confirmText || String(confirmText).trim().toLowerCase() !== 'ok') return;
      // حدث السجل أولاً لتسجيل الموظف الذي يقوم بالحذف
      if (currentUser && currentUser.id) {
        await supabase.from('guests').update({ updated_by: currentUser.id }).eq('id', row.id);
      }
      const { error } = await supabase.from('guests').delete().eq('id', row.id);
      if (error) throw error;
      await load();
      await loadNewCount();
    } catch (e) {
      console.error('Delete guest failed', e);
      window.alert('تعذّر حذف النزيل: ' + (e.message || e));
    }
  };

  const reset = () => { setSearch(''); setFilters({ current: false, upcoming: false, vip: false, inactive: false }); setPage(0); };

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة النزلاء</h2>
          <p className="text-sm text-gray-500">بحث، فلاتر، وترقيم مع عرض الزيارات</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">نزيل جديد +</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded border border-green-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-green-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M5 12a7 7 0 0 1 14 0M12 19a7 7 0 0 0 7-7"/></svg>
            <span>حاليون</span>
          </div>
          <div className="text-2xl font-bold text-green-700">{counters.current}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded border border-amber-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-amber-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M12 3v18"/></svg>
            <span>قادِمون</span>
          </div>
          <div className="text-2xl font-bold text-amber-700">{counters.upcoming}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded border border-purple-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-purple-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"/></svg>
            <span>VIP</span>
          </div>
          <div className="text-2xl font-bold text-purple-700">{counters.vip}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded border border-emerald-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            <span>نزلاء الجدد</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700">{newCount}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded border border-blue-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M7 12v8M17 12v8"/></svg>
            <span>إجمالي النزلاء</span>
          </div>
          <div className="text-2xl font-bold text-blue-700">{totalCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input className="border rounded pl-9 pr-3 py-2 w-full" placeholder="بحث بالاسم أو الهاتف أو الهوية أو البريد" value={search} onChange={e=>{ setSearch(e.target.value); setPage(0); }} />
        </div>
        <button onClick={()=>{ setFilters(s=>({ ...s, current: !s.current })); setPage(0); }}
          className={`px-3 py-2 rounded text-sm border ${filters.current ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>حاليون</button>
        <button onClick={()=>{ setFilters(s=>({ ...s, upcoming: !s.upcoming })); setPage(0); }}
          className={`px-3 py-2 rounded text-sm border ${filters.upcoming ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>قادِمون</button>
        <button onClick={()=>{ setFilters(s=>({ ...s, vip: !s.vip })); setPage(0); }}
          className={`px-3 py-2 rounded text-sm border ${filters.vip ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>VIP</button>
        <button onClick={()=>{ setFilters(s=>({ ...s, inactive: !s.inactive })); setPage(0); }}
          className={`px-3 py-2 rounded text-sm border ${filters.inactive ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>غير نشطين</button>
        <button className="border rounded px-3 py-2 text-gray-700 hover:bg-gray-100" onClick={reset}>إعادة ضبط</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-1 bg-gray-200" />
              <div className="px-4 pt-4 h-6 bg-gray-100 mb-2" />
              <div className="px-4 pb-4 space-y-2">
                <div className="h-4 bg-gray-100" />
                <div className="h-4 bg-gray-100 w-2/3" />
                <div className="h-4 bg-gray-100 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 bg-white rounded shadow flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold mb-1">لا توجد نتائج مطابقة</div>
            <div className="text-gray-600">جرّب تعديل عوامل البحث أو أضف نزيلًا جديدًا.</div>
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">نزيل جديد</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rows.map(r => (
            <GuestCard key={r.id} guest={r} onEdit={()=>openEdit(r)} onDelete={()=>handleDelete(r)} onHistory={()=>openHistory(r)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-600">النتائج: {rows.length} / الإجمالي: {totalCount}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>السابق</button>
          <span className="text-sm">صفحة {page+1}</span>
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>p+1)} disabled={(page+1)*pageSize>=totalCount}>التالي</button>
          <select className="border rounded px-2 py-1" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(0); }}>
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </div>
      </div>

      {showModal && (
        <GuestModal
          initialData={editing}
          onClose={()=>setShowModal(false)}
          onSave={handleSave}
        />
      )}
      {showHistory && historyGuest && (
        <GuestHistoryModal
          guest={historyGuest}
          onClose={()=>{ setShowHistory(false); setHistoryGuest(null); }}
        />
      )}
    </div>
  );
}
