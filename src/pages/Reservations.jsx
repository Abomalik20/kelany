
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import ReservationModal from '../components/ReservationModal';
import GroupDiscountModal from '../components/GroupDiscountModal';
import ReservationTable from '../components/ReservationTable';
import ReservationCard from '../components/ReservationCard';
import ExtendModal from '../components/ExtendModal';
import PaymentModal from '../components/PaymentModal';
import InvoiceModal from '../components/InvoiceModal';
import { AuthContext } from '../App.jsx';
import { isManager, isAssistantManager } from '../utils/permissions';

export default function Reservations() {
    // دالة: تحقق من وجود وردية نشطة للمستخدم الحالي
    const requireActiveShift = async (userId) => {
      const shift = await getActiveShift(userId);
      if (!shift) {
        alert('لا يمكنك تنفيذ عملية دفع بدون وجود وردية مفتوحة. يرجى فتح وردية أولاً.');
        return null;
      }
      return shift;
    };
    // منع الدفع بدون وردية نشطة (ينطبق على استقبال وخدمة الغرف)
    const handlePay = async (row) => {
      if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
        const shift = await requireActiveShift(currentUser?.id);
        if (!shift) return;
        setPayRow({ ...row, shift_id: shift.id });
      } else {
        setPayRow(row);
      }
    };
  const currentUser = useContext(AuthContext);
    // دالة مساعدة: جلب الوردية النشطة للمستخدم الحالي
    const getActiveShift = async (userId) => {
      if (!userId) return null;
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: shifts } = await supabase
        .from('reception_shifts')
        .select('id,status')
        .eq('staff_user_id', userId)
        .eq('shift_date', todayStr)
        .eq('status', 'open')
        .limit(1);
      return (shifts && shifts.length > 0) ? shifts[0] : null;
    };
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    // تحقق من وجود وردية مفتوحة فقط إذا كان المستخدم استقبال
    async function checkShift() {
      if (!currentUser) { setReadOnly(true); return; }
      if (currentUser.role !== 'reception' && currentUser.role !== 'housekeeping') { setReadOnly(false); return; }
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: shifts } = await supabase
        .from('reception_shifts')
        .select('id,status')
        .eq('staff_user_id', currentUser.id)
        .eq('shift_date', todayStr)
        .eq('status', 'open')
        .limit(1);
      setReadOnly(!(shifts && shifts.length > 0));
    }
    checkShift();
  }, [currentUser]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ current: true, upcoming: false, inactive: false, status: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [groupMode, setGroupMode] = useState(false);
  const [discountModal, setDiscountModal] = useState({ show: false, agencyName: null, checkIn: null, checkOut: null, rows: [] });
  const [paymentModal, setPaymentModal] = useState({ show: false, rows: [] });
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  const [extendRow, setExtendRow] = useState(null);
  const [payRow, setPayRow] = useState(null);
  const [invoiceRow, setInvoiceRow] = useState(null);

  useEffect(() => { const t=setTimeout(()=>setDebounced(search),300); return ()=>clearTimeout(t); }, [search]);

  const buildQuery = React.useCallback(() => {
    const q = supabase
      .from('reservations_overview')
      .select('*', { count: 'exact' })
      .order('check_in_date', { ascending: true, nullsFirst: false });
    const term = (debounced||'').trim();
    if (term) {
      // بحث مرن بالاسم أو الهاتف أو رقم/اسم الغرفة (label)
      q.or(`guest_name.ilike.%${term}%,guest_phone.ilike.%${term}%,room_label.ilike.%${term}%`);
    }
    if (filters.current) q.eq('is_current', true);
    if (filters.upcoming) q.eq('is_upcoming', true);
    if (filters.inactive) q.eq('is_past', true);
    if (filters.status) q.eq('status', filters.status);
    const from = page * pageSize, to = from + pageSize - 1; q.range(from, to);
    return q;
  }, [debounced, filters, page, pageSize]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error, count } = await buildQuery();
      if (error) throw error;

      let enriched = data || [];

      // اجمع المدفوعات المؤكدة والمعلّقة لكل حجز من جدول المعاملات المحاسبية
      const ids = (enriched || []).map(r => r.id).filter(Boolean);
      if (ids.length > 0) {
        try {
          const { data: txRows, error: txError } = await supabase
            .from('accounting_transactions')
            .select('reservation_id, amount, status, direction, source_type')
            .in('reservation_id', ids);

          if (!txError && txRows) {
            const agg = {};
            for (const t of txRows) {
              const rid = t.reservation_id;
              if (!rid) continue;
              if (!agg[rid]) agg[rid] = { confirmedIncome: 0, pendingIncome: 0, confirmedRefund: 0, pendingRefund: 0 };
              const amt = Number(t.amount || 0) || 0;
              if (!amt) continue;
              if (t.direction === 'income') {
                if (t.status === 'confirmed') agg[rid].confirmedIncome += amt;
                else if (t.status === 'pending') agg[rid].pendingIncome += amt;
              } else if (t.direction === 'expense' && t.source_type === 'reservation') {
                if (t.status === 'confirmed') agg[rid].confirmedRefund += amt;
                else if (t.status === 'pending') agg[rid].pendingRefund += amt;
              }
            }

            enriched = enriched.map(r => {
              const a = agg[r.id] || { confirmedIncome: 0, pendingIncome: 0, confirmedRefund: 0, pendingRefund: 0 };
              const confirmedPaid = Math.max(0, (a.confirmedIncome || 0) - (a.confirmedRefund || 0));
              const pendingPaid = Math.max(0, (a.pendingIncome || 0) - (a.pendingRefund || 0));
              const total = Number(r.total_amount || 0) || 0;
              const totalPaid = confirmedPaid + pendingPaid;
              const remainingFromTx = Math.max(0, Math.round((total - totalPaid) * 100) / 100);
              return {
                ...r,
                confirmed_paid_amount: confirmedPaid,
                pending_paid_amount: pendingPaid,
                remaining_amount_from_tx: remainingFromTx,
              };
            });
          }
        } catch (e) {
          console.error('Load payment breakdown for reservations failed', e);
        }
      }

      setRows(enriched); setTotalCount(count||0);
    } catch(e) { console.error('Load reservations failed', e); setRows([]); setTotalCount(0); }
    finally { setLoading(false); }
  }, [buildQuery]);

  useEffect(()=>{ load(); }, [debounced, filters, page, pageSize, load]);

  // Realtime: auto-refresh on reservations changes
  useEffect(() => {
    const channel = supabase.channel('reservations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        load();
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch(_) {} };
  }, [load]);

  const counters = useMemo(() => {
    const cur = rows.filter(r=>r.is_current).length;
    const upc = rows.filter(r=>r.is_upcoming).length;
    const past = rows.filter(r=>r.is_past).length;
    const tot = totalCount;
    return { cur, upc, past, tot };
  }, [rows, totalCount]);

  // منع إنشاء حجز بدون وردية نشطة (ينطبق على رولات الاستقبال وخدمة الغرف)
  const openCreate = async () => {
    if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
      const shift = await getActiveShift(currentUser?.id);
      if (!shift) {
        alert('لا يمكنك إنشاء حجز من الاستقبال بدون وجود وردية مفتوحة.');
        return;
      }
    }
    setEditing(null); setGroupMode(false); setShowModal(true);
  };
  const openCreateGroup = () => { setEditing(null); setGroupMode(true); setShowModal(true); };
  // Open group edit modal: load all reservations for same agency & period and open modal in groupMode
  const openEditGroup = async (row) => {
    try {
      if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
        const shift = await getActiveShift(currentUser?.id);
        if (!shift) { alert('لا يمكنك تعديل الحجز بدون وجود وردية مفتوحة.'); return; }
      }
      if (!row || row.payer_type !== 'agency' || !row.agency_name) {
        alert('تعديل مجموعة الحجوزات متاح فقط لحجوزات الشركات ذات اسم جهة محدد.');
        return;
      }
      const { data, error } = await supabase
        .from('reservations')
        .select('id, room_id, nightly_rate, total_amount, guests_count, amount_paid, currency, payment_method')
        .eq('payer_type', 'agency')
        .eq('agency_name', row.agency_name)
        .eq('check_in_date', row.check_in_date)
        .eq('check_out_date', row.check_out_date);
      if (error) throw error;

      const groupReservations = (data || []).map(d => ({ id: d.id, room_id: d.room_id, nightly_rate: d.nightly_rate, total_amount: d.total_amount }));
      const initialGroup = {
        id: null,
        payer_type: 'agency',
        agency_name: row.agency_name,
        check_in_date: row.check_in_date,
        check_out_date: row.check_out_date,
        guests_count: rows.filter(r=>r.payer_type==='agency' && r.agency_name===row.agency_name && r.check_in_date===row.check_in_date && r.check_out_date===row.check_out_date).reduce((acc,r)=>acc + (Number(r.guests_count)||0),0) || row.guests_count || 0,
        amount_paid: rows.filter(r=>r.payer_type==='agency' && r.agency_name===row.agency_name && r.check_in_date===row.check_in_date && r.check_out_date===row.check_out_date).reduce((acc,r)=>acc + (Number(r.confirmed_paid_amount||0) + Number(r.pending_paid_amount||0)),0) || 0,
        currency: row.currency || 'EGP',
        group_reservations: groupReservations,
      };

      setEditing(initialGroup);
      setGroupMode(true);
      setShowModal(true);
    } catch (e) {
      console.error('Open edit group failed', e);
      alert('تعذّر فتح شاشة تعديل مجموعة: ' + (e.message || e));
    }
  };
  // منع تعديل الحجز بدون وردية نشطة
  const openEdit = async (row) => {
    if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
      const shift = await getActiveShift(currentUser?.id);
      if (!shift) {
        alert('لا يمكنك تعديل الحجز بدون وجود وردية مفتوحة.');
        return;
      }
    }
    setEditing(row); setShowModal(true);
  };
  // منع تمديد الحجز بدون وردية نشطة
  const handleExtend = async (row) => {
    if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
      const shift = await getActiveShift(currentUser?.id);
      if (!shift) {
        alert('لا يمكنك تمديد الحجز بدون وجود وردية مفتوحة.');
        return;
      }
      setExtendRow({ ...row, shift_id: shift.id });
    } else {
      setExtendRow(row);
    }
  };
  // منع إصدار فاتورة بدون وردية نشطة
  const handleInvoice = async (row) => {
    if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
      const shift = await getActiveShift(currentUser?.id);
      if (!shift) {
        alert('لا يمكنك إصدار فاتورة بدون وجود وردية مفتوحة.');
        return;
      }
      setInvoiceRow({ ...row, shift_id: shift.id });
    } else {
      setInvoiceRow(row);
    }
  };

  // حذف كل حجوزات شركة/مجموعة لنفس الفترة دفعة واحدة
  const handleDeleteGroup = async (row) => {
    try {
      if (!(isManager(currentUser) || isAssistantManager(currentUser))) {
        alert('لا تملك صلاحية حذف الحجوزات. هذه الصلاحية متاحة للمدير ومساعد المدير فقط.');
        return;
      }
      if (!row || row.payer_type !== 'agency' || !row.agency_name) {
        alert('حذف مجموعة الحجوزات متاح فقط لحجوزات الشركات ذات اسم جهة محدد.');
        return;
      }
      const ok = window.confirm(`حذف كل الحجوزات لهذه الجهة (${row.agency_name}) لنفس فترة الإقامة؟`);
      if (!ok) return;

      // أولاً نسجل الموظف الذي قام بالحذف على هذه الحجوزات (updated_by)
      if (currentUser && currentUser.id) {
        await supabase
          .from('reservations')
          .update({ updated_by: currentUser.id })
          .match({
            payer_type: 'agency',
            agency_name: row.agency_name,
            check_in_date: row.check_in_date,
            check_out_date: row.check_out_date,
          });
      }

      const { error } = await supabase
        .from('reservations')
        .delete()
        .match({
          payer_type: 'agency',
          agency_name: row.agency_name,
          check_in_date: row.check_in_date,
          check_out_date: row.check_out_date,
        });
      if (error) throw error;
      await load();
    } catch (e) {
      console.error('Delete group reservations failed', e);
      alert('تعذّر حذف مجموعة الحجوزات: ' + (e.message || e));
    }
  };

  // Apply percentage discount to a company/group's reservations for the same period
  const handleApplyGroupDiscount = async (row) => {
    if (!(isManager(currentUser) || isAssistantManager(currentUser))) {
      alert('لا تملك صلاحية تطبيق خصومات جماعية. هذه الصلاحية متاحة للمدير ومساعد المدير فقط.');
      return;
    }
    if (!row || row.payer_type !== 'agency' || !row.agency_name) {
      alert('تطبيق الخصم متاح فقط لحجوزات الشركات ذات اسم جهة محدد.');
      return;
    }
    // open discount modal with group rows filtered for same agency/period
    const groupRows = rows.filter(r => r.payer_type === 'agency' && r.agency_name === row.agency_name && r.check_in_date === row.check_in_date && r.check_out_date === row.check_out_date);
    setDiscountModal({ show: true, agencyName: row.agency_name, checkIn: row.check_in_date, checkOut: row.check_out_date, rows: groupRows });
  };

  const handleDiscountApplied = async ({ count }) => {
    await load();
  };

  const handleApplyGroupPayment = async (row) => {
    if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
      const shift = await getActiveShift(currentUser?.id);
      if (!shift) { alert('لا يمكنك تسجيل دفعة بدون وجود وردية مفتوحة.'); return; }
    }
    if (!row || row.payer_type !== 'agency' || !row.agency_name) {
      alert('الدفع الجماعي متاح فقط لحجوزات الشركات ذات اسم جهة محدد.');
      return;
    }
    const groupRows = rows.filter(r => r.payer_type === 'agency' && r.agency_name === row.agency_name && r.check_in_date === row.check_in_date && r.check_out_date === row.check_out_date);
    setPaymentModal({ show: true, rows: groupRows });
  };

  const handleGroupPaymentDone = async () => {
    await load();
  };

  const handleSave = async (payload) => {
    try {
      // تحقق من وجود وردية نشطة قبل أي عملية حفظ أو إضافة ضيف (ينطبق على استقبال وخدمة الغرف)
      if (currentUser && (currentUser.role === 'reception' || currentUser.role === 'housekeeping')) {
        const shift = await getActiveShift(currentUser?.id);
        if (!shift) {
          alert('لا يمكنك تنفيذ أي عملية (إنشاء أو تعديل أو إضافة نزيل) بدون وجود وردية مفتوحة. يرجى فتح وردية أولاً.');
          return;
        }
      }

      const isMulti = payload && payload.multi && Array.isArray(payload.reservations);

      // حجز جماعي (عدة غرف لنفس الشركة/الفترة) – متاح فقط عند إنشاء حجز جديد
      if (isMulti && !editing) {
        const reservations = payload.reservations || [];
        if (!reservations.length) throw new Error('no reservations to save');

        for (let idx = 0; idx < reservations.length; idx++) {
          const raw = reservations[idx];
          const cleaned = { ...raw };
          const pendingExtras = Array.isArray(cleaned.pending_guest_ids) ? cleaned.pending_guest_ids : [];
          delete cleaned.pending_guest_ids;

          if (currentUser && currentUser.id) {
            cleaned.created_by = currentUser.id;
          }

          const { data, error } = await supabase
            .from('reservations')
            .insert([cleaned])
            .select('id')
            .single();
          if (error) throw error;
          const newId = data?.id;

          // نربط الضيوف الإضافيين بأول حجز فقط لتجنّب التكرار على كل غرفة
          if (idx === 0 && newId && pendingExtras.length > 0) {
            for (const gid of pendingExtras) {
              try {
                await supabase.rpc('add_reservation_guest', {
                  p_reservation_id: newId,
                  p_guest_id: gid,
                  p_role: 'additional',
                });
              } catch (_) {}
            }
          }
        }
      } else {
        const cleaned = { ...payload };
        const pendingExtras = Array.isArray(cleaned.pending_guest_ids) ? cleaned.pending_guest_ids : [];
        delete cleaned.pending_guest_ids;
        const newAmountPaid = Number(cleaned.amount_paid || 0);
        const oldAmountPaid = editing && editing.id ? Number(editing.amount_paid || 0) : 0;
        const paidDelta = newAmountPaid - oldAmountPaid;

        const oldStatus = editing && editing.status ? editing.status : null;
        const newStatus = cleaned && cleaned.status ? cleaned.status : oldStatus;

        // تتبّع تعديلات حساسة (التواريخ والإجمالي) في ملاحظات الحجز لأغراض المراقبة
        if (editing && editing.id) {
          const auditTags = [];
          if (editing.check_in_date !== cleaned.check_in_date || editing.check_out_date !== cleaned.check_out_date) {
            const who = (currentUser && (currentUser.full_name || currentUser.username)) || 'مستخدم';
            const when = new Date().toLocaleString('ar-EG');
            auditTags.push(`[تعديل تواريخ إقامة] ${editing.check_in_date || '-'} → ${cleaned.check_in_date || '-'} / ${editing.check_out_date || '-'} → ${cleaned.check_out_date || '-'} — بواسطة ${who} في ${when}`);
          }
          const oldTotal = Number(editing.total_amount || 0) || 0;
          const newTotal = Number(cleaned.total_amount || 0) || 0;
          if (oldTotal !== newTotal) {
            const who = (currentUser && (currentUser.full_name || currentUser.username)) || 'مستخدم';
            const when = new Date().toLocaleString('ar-EG');
            auditTags.push(`[تعديل إجمالي/سعر] ${oldTotal} → ${newTotal} — بواسطة ${who} في ${when}`);
          }
          if (auditTags.length > 0) {
            const prevNotes = (cleaned.notes || '').trim();
            const auditText = auditTags.join('\n');
            cleaned.notes = prevNotes ? `${prevNotes}\n${auditText}` : auditText;
          }
        }

        // لا يسمح لموظفي الاستقبال بتغيير حالة حجز ملغي إلا من خلال الإدارة
        if (editing && editing.id && oldStatus === 'cancelled' && newStatus && newStatus !== 'cancelled') {
          if (!(isManager(currentUser) || isAssistantManager(currentUser))) {
            alert('لا يمكن تعديل حالة حجز ملغي إلا بواسطة المدير أو مساعد المدير.');
            return;
          }
          const ok = window.confirm('هذا الحجز ملغي بالفعل. هل تريد بالتأكيد إعادة تفعيله أو تغيير حالته؟');
          if (!ok) return;
        }

        // في حال تغيير الحالة إلى "ملغي"، اسأل عن نوع الاسترداد قبل الحفظ
        let refundChoice = null; // 'full' | 'partial' | 'none'
        let refundAmount = 0;
        let refundNoteTag = '';

        if (editing && editing.id && oldStatus !== 'cancelled' && newStatus === 'cancelled') {
          const intro = 'تم اختيار حالة الحجز "ملغي". يرجى تحديد طريقة التعامل مع الاسترداد المالي (إن وجد).';
          const msg =
            intro +
            '\n' +
            'اكتب 1: استرداد كامل للمبلغ المدفوع في هذا الحجز (حسب الحقل "المدفوع").\n' +
            'اكتب 2: استرداد جزئي (ستقوم بإدخال مبلغ يدويًا).\n' +
            'اكتب 3: إلغاء بدون استرداد.\n' +
            'اترك الحقل فارغًا لإلغاء التعديل وعدم تغيير حالة الحجز.';

          const choice = window.prompt(msg, '');
          if (!choice) {
            alert('تم إلغاء التعديل، لم يتم تغيير حالة الحجز.');
            return;
          }
          const trimmed = String(choice).trim();
          if (trimmed === '1') {
            refundChoice = 'full';
          } else if (trimmed === '2') {
            refundChoice = 'partial';
          } else if (trimmed === '3') {
            refundChoice = 'none';
          } else {
            alert('اختيار غير صحيح، لم يتم حفظ التعديل.');
            return;
          }

          const basePaid = newAmountPaid || oldAmountPaid || 0;

          if (refundChoice === 'full' || refundChoice === 'partial') {
            if (refundChoice === 'full') {
              refundAmount = Math.max(0, Number(basePaid) || 0);
            } else {
              const promptMsg =
                `أدخل مبلغ الاسترداد الجزئي بالجنيه. المبلغ المدفوع حسب الحجز حاليًا هو ${basePaid}.` +
                '\nاترك الحقل فارغًا لإلغاء العملية.';
              const amtStr = window.prompt(promptMsg, basePaid ? String(basePaid) : '');
              if (!amtStr) {
                alert('تم إلغاء التعديل، لم يتم تغيير حالة الحجز.');
                return;
              }
              const num = Number(amtStr);
              if (!num || num <= 0) {
                alert('مبلغ استرداد غير صالح، لم يتم حفظ التعديل.');
                return;
              }
              refundAmount = Math.round(num * 100) / 100;
            }
            refundNoteTag = refundChoice === 'full'
              ? '[إلغاء مع استرداد كامل]'
              : '[إلغاء مع استرداد جزئي]';
          } else {
            refundAmount = 0;
            refundNoteTag = '[إلغاء بدون استرداد]';
          }

          const prevNotes = (cleaned.notes || '').trim();
          cleaned.notes = prevNotes ? `${prevNotes}\n${refundNoteTag}` : refundNoteTag;
        }
        // Audit: track which staff created/updated this reservation
        if (currentUser && currentUser.id) {
          if (editing && editing.id) {
            cleaned.updated_by = currentUser.id;
          } else {
            cleaned.created_by = currentUser.id;
          }
        }
        if (editing && editing.id) {
          const { error } = await supabase.from('reservations').update(cleaned).eq('id', editing.id);
          if (error) throw error;
          // attach extra guests if provided
          for (const gid of pendingExtras) {
            try { await supabase.rpc('add_reservation_guest', { p_reservation_id: editing.id, p_guest_id: gid, p_role: 'additional' }); } catch(_) {}
          }

          // في حال تم اختيار استرداد عند الإلغاء، نسجّل طلب استرداد كمصروف معلق في المحاسبة ليوافق عليه المدير
          if (refundChoice && refundAmount > 0 && editing && editing.id) {
            try {
              let receptionShiftId = null;
              try {
                if (currentUser && currentUser.id) {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const { data: shifts } = await supabase
                    .from('reception_shifts')
                    .select('id,status,shift_date')
                    .eq('staff_user_id', currentUser.id)
                    .eq('shift_date', todayStr)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1);
                  if (shifts && shifts.length > 0) {
                    receptionShiftId = shifts[0].id;
                  }
                }
              } catch (_) {}

              let categoryId = null;
              try {
                const { data: cats } = await supabase
                  .from('accounting_categories')
                  .select('id,name,type')
                  .eq('type', 'expense')
                  .in('name', ['استرداد حجوزات', 'مصروفات أخرى']);
                if (cats && cats.length > 0) {
                  const preferred = cats.find(c => c.name === 'استرداد حجوزات') || cats[0];
                  categoryId = preferred.id;
                }
              } catch (_) {}

              const desc = `طلب استرداد على حجز ${editing.code || editing.id || ''} — ${refundNoteTag || ''}`;
              const refundPayload = {
                tx_date: new Date().toISOString().slice(0, 10),
                direction: 'expense',
                category_id: categoryId,
                amount: refundAmount,
                payment_method: 'cash',
                bank_account_id: null,
                source_type: 'reservation',
                reservation_id: editing.id,
                description: desc,
                status: 'pending',
                reception_shift_id: receptionShiftId,
              };
              if (currentUser && currentUser.id) {
                refundPayload.created_by = currentUser.id;
              }
              const { error: refundError } = await supabase.from('accounting_transactions').insert(refundPayload);
              if (refundError) {
                console.error('create refund request error', refundError);
                alert('تم إلغاء الحجز، لكن تعذّر تسجيل طلب الاسترداد تلقائيًا. يمكن تسجيله يدويًا من شاشة المحاسبة.');
              } else {
                try {
                  const evt = new Event('accounting-tx-updated');
                  window.dispatchEvent(evt);
                } catch (_) {}
              }
            } catch (e) {
              console.error('create refund request exception', e);
              alert('تم إلغاء الحجز، لكن حدث خطأ أثناء إنشاء طلب الاسترداد. يمكن تسجيله يدويًا من شاشة المحاسبة.');
            }
          }

          // لو زاد المبلغ المدفوع، نسجّل هذا الفرق كإيراد في المحاسبة
          if (paidDelta > 0 && cleaned.payment_method) {
            try {
              let receptionShiftId = null;
              try {
                if (currentUser && currentUser.id) {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const { data: shifts } = await supabase
                    .from('reception_shifts')
                    .select('id,status,shift_date')
                    .eq('staff_user_id', currentUser.id)
                    .eq('shift_date', todayStr)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1);
                  if (shifts && shifts.length > 0) {
                    receptionShiftId = shifts[0].id;
                  }
                }
              } catch (_) {}

              let categoryId = null;
              try {
                const { data: cats } = await supabase
                  .from('accounting_categories')
                  .select('id,name,type')
                  .eq('type', 'income')
                  .eq('name', 'إيرادات الغرف')
                  .limit(1);
                if (cats && cats.length > 0) {
                  categoryId = cats[0].id;
                }
              } catch (_) {}

              const method = cleaned.payment_method;
              const paymentMethodForAccounting = ['cash','bank','instapay','other'].includes(method)
                ? method
                : 'other';

              const desc = `زيادة دفعة على حجز ${editing.code || editing.id || ''}`;
              const accPayload = {
                tx_date: new Date().toISOString().slice(0, 10),
                direction: 'income',
                category_id: categoryId,
                amount: paidDelta,
                payment_method: paymentMethodForAccounting,
                bank_account_id: null,
                source_type: 'reservation',
                reservation_id: editing.id,
                description: desc,
                status: ['cash','instapay'].includes(paymentMethodForAccounting) ? 'pending' : 'confirmed',
                reception_shift_id: receptionShiftId,
              };
              if (currentUser && currentUser.id) {
                accPayload.created_by = currentUser.id;
              }
              const { error: accError } = await supabase.from('accounting_transactions').insert(accPayload);
              if (accError) {
                console.error('accounting from reservation update error', accError);
              } else {
                try {
                  const evt = new Event('accounting-tx-updated');
                  window.dispatchEvent(evt);
                } catch (_) {}
              }
            } catch (e) {
              console.error('accounting from reservation update exception', e);
            }
          }
        } else {
          const { data, error } = await supabase.from('reservations').insert([cleaned]).select('id').single();
          if (error) throw error;
          const newId = data?.id;
          // attach extra guests to the new reservation if any
          if (newId && pendingExtras.length > 0) {
            for (const gid of pendingExtras) {
              try { await supabase.rpc('add_reservation_guest', { p_reservation_id: newId, p_guest_id: gid, p_role: 'additional' }); } catch(_) {}
            }
          }

          // لو تم إدخال دفعة مقدّمة عند إنشاء الحجز، نسجلها كإيراد
          if (newId && newAmountPaid > 0 && cleaned.payment_method) {
            try {
              let receptionShiftId = null;
              try {
                if (currentUser && currentUser.id) {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const { data: shifts } = await supabase
                    .from('reception_shifts')
                    .select('id,status,shift_date')
                    .eq('staff_user_id', currentUser.id)
                    .eq('shift_date', todayStr)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1);
                  if (shifts && shifts.length > 0) {
                    receptionShiftId = shifts[0].id;
                  }
                }
              } catch (_) {}

              let categoryId = null;
              try {
                const { data: cats } = await supabase
                  .from('accounting_categories')
                  .select('id,name,type')
                  .eq('type', 'income')
                  .eq('name', 'إيرادات الغرف')
                  .limit(1);
                if (cats && cats.length > 0) {
                  categoryId = cats[0].id;
                }
              } catch (_) {}

              const method = cleaned.payment_method;
              const paymentMethodForAccounting = ['cash','bank','instapay','other'].includes(method)
                ? method
                : 'other';

              const desc = `دفعة مقدّمة عند إنشاء حجز ${newId}`;
              const accPayload = {
                tx_date: new Date().toISOString().slice(0, 10),
                direction: 'income',
                category_id: categoryId,
                amount: newAmountPaid,
                payment_method: paymentMethodForAccounting,
                bank_account_id: null,
                source_type: 'reservation',
                reservation_id: newId,
                description: desc,
                status: ['cash','instapay'].includes(paymentMethodForAccounting) ? 'pending' : 'confirmed',
                reception_shift_id: receptionShiftId,
              };
              if (currentUser && currentUser.id) {
                accPayload.created_by = currentUser.id;
              }
              const { error: accError } = await supabase.from('accounting_transactions').insert(accPayload);
              if (accError) {
                console.error('accounting from reservation create error', accError);
              } else {
                try {
                  const evt = new Event('accounting-tx-updated');
                  window.dispatchEvent(evt);
                } catch (_) {}
              }
            } catch (e) {
              console.error('accounting from reservation create exception', e);
            }
          }
        }
      }
      setShowModal(false); await load();
    } catch(e) {
      console.error('Save reservation failed', e);
      const msg = String(e?.message || e || '').toLowerCase();
      let userMsg = 'تعذّر حفظ الحجز.';
      if (msg.includes('overlapping reservation')) userMsg = 'تعذّر الحفظ: هناك تعارض في التواريخ مع حجز آخر لنفس الغرفة.';
      else if (msg.includes('check_out_date must be after check_in_date')) userMsg = 'تعذّر الحفظ: تاريخ الخروج يجب أن يكون بعد تاريخ الدخول.';
      else if (msg.includes('row-level security')) userMsg = 'تعذّر الحفظ: لا تملك الصلاحية لحفظ الحجز (RLS).';
      else if (msg.includes('not-null')) userMsg = 'تعذّر الحفظ: بعض الحقول المطلوبة غير مكتملة.';
      else if (msg.includes('invalid input syntax')) userMsg = 'تعذّر الحفظ: مشكلة في صيغة البيانات المدخلة.';
      alert(userMsg);
    }
  };

  const handleDelete = async (row) => {
    try {
      if (!(isManager(currentUser) || isAssistantManager(currentUser))) {
        alert('لا تملك صلاحية حذف الحجوزات. هذه الصلاحية متاحة للمدير ومساعد المدير فقط.');
        return;
      }
      const ok = window.confirm('حذف هذا الحجز؟ هذا الإجراء لا يمكن التراجع عنه.');
      if (!ok) return;

      const phrase = window.prompt('للتأكيد النهائي على حذف الحجز، اكتب كلمة "موافق" بالحروف العربية:', '');
      if (phrase !== 'موافق') {
        alert('لم يتم حذف الحجز؛ لم يتم إدخال كلمة التأكيد بشكل صحيح.');
        return;
      }
      // حدث الحجز أولاً لتسجيل الموظف الذي يقوم بالحذف
      if (currentUser && currentUser.id) {
        await supabase.from('reservations').update({ updated_by: currentUser.id }).eq('id', row.id);
      }
      const { error } = await supabase.from('reservations').delete().eq('id', row.id);
      if (error) throw error;
      await load();
    } catch(e) { console.error('Delete reservation failed', e); alert('تعذّر حذف الحجز: '+(e.message||e)); }
  };

  return (
    <div className="p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">نظام الحجوزات الذكي</h2>
          <p className="text-sm text-gray-500">إدارة شاملة للحجوزات مع التعديلات والإلغاءات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openCreate}
            disabled={readOnly}
            style={readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            حجز فردي (غرفة واحدة) +
          </button>
          <button
            onClick={openCreateGroup}
            disabled={readOnly}
            style={readOnly ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
          >
            حجز شركات / مجموعات ⚙
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-purple-50 border border-purple-200 rounded p-4 text-center">
          <div className="text-sm text-purple-700">الحجوزات الحالية</div>
          <div className="text-2xl font-bold text-purple-700">{counters.cur}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-center">
          <div className="text-sm text-amber-700">القادمة</div>
          <div className="text-2xl font-bold text-amber-700">{counters.upc}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-4 text-center">
          <div className="text-sm text-gray-700">غير نشطة / منتهية</div>
          <div className="text-2xl font-bold text-gray-700">{counters.past}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input className="border rounded pl-9 pr-3 py-2 w-full" placeholder="بحث بالنزيل أو رقم الغرفة" value={search} onChange={e=>{ setSearch(e.target.value); setPage(0); }} />
        </div>
        <button onClick={()=>{
          setFilters(s=>({
            current: !s.current,
            upcoming: false,
            inactive: false,
            status: s.status,
          }));
          setPage(0);
        }}
          className={`px-3 py-2 rounded text-sm border ${filters.current ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>الحالية</button>
        <button onClick={()=>{
          setFilters(s=>({
            current: false,
            upcoming: !s.upcoming,
            inactive: false,
            status: s.status,
          }));
          setPage(0);
        }}
          className={`px-3 py-2 rounded text-sm border ${filters.upcoming ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>القادمة</button>
        <button onClick={()=>{
          setFilters(s=>({
            current: false,
            upcoming: false,
            inactive: !s.inactive,
            status: s.status,
          }));
          setPage(0);
        }}
          className={`px-3 py-2 rounded text-sm border ${filters.inactive ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>غير نشطة</button>
        <select className="border rounded px-3 py-2 text-sm" value={filters.status} onChange={e=>{ setFilters(s=>({ ...s, status: e.target.value })); setPage(0); }}>
          <option value="">كل الحالات</option>
          <option value="pending">قيد الانتظار</option>
          <option value="confirmed">مؤكد</option>
          <option value="checked_in">تم الدخول</option>
          <option value="checked_out">تم الخروج</option>
          <option value="cancelled">ملغي</option>
          <option value="no_show">لم يحضر</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button className={`px-3 py-2 rounded text-sm border ${view==='cards'?'bg-gray-800 text-white':'bg-white text-gray-700'}`} onClick={()=>setView('cards')}>عرض كبطاقات</button>
          <button className={`px-3 py-2 rounded text-sm border ${view==='table'?'bg-gray-800 text-white':'bg-white text-gray-700'}`} onClick={()=>setView('table')}>عرض كجدول</button>
        </div>
      </div>

      {view==='table' ? (
        <ReservationTable rows={rows} loading={loading} onEdit={openEdit} onDelete={handleDelete} onDeleteGroup={handleDeleteGroup} onApplyGroupDiscount={handleApplyGroupDiscount} onEditGroup={openEditGroup} />
      ) : (
        loading ? (
          <div className="py-16 text-center text-gray-500">...جاري التحميل</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-500">لا توجد حجوزات مطابقة</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map(r => (
              <ReservationCard key={r.id} r={r} onEdit={openEdit} onDelete={handleDelete} onDeleteGroup={handleDeleteGroup} onExtend={handleExtend} onPay={handlePay} onInvoice={handleInvoice} onApplyGroupDiscount={handleApplyGroupDiscount} onEditGroup={openEditGroup} />
            ))}
          </div>
        )
      )}

      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-600">النتائج: {rows.length} / الإجمالي: {totalCount}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>السابق</button>
          <span className="text-sm">صفحة {page+1}</span>
          <button className="px-3 py-1 border rounded" onClick={()=>setPage(p=>p+1)} disabled={(page+1)*pageSize>=totalCount}>التالي</button>
          <select className="border rounded px-2 py-1" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(0); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>

      {showModal && (
        <ReservationModal
          initialData={editing}
          onClose={()=>{ setShowModal(false); setGroupMode(false); }}
          onSave={handleSave}
          onAfterAction={load}
          groupMode={groupMode}
        />
      )}
      {extendRow && (
        <ExtendModal row={extendRow} onClose={()=>setExtendRow(null)} onDone={load} />
      )}
      {payRow && (
        <PaymentModal row={payRow} onClose={()=>setPayRow(null)} onDone={load} />
      )}
      {invoiceRow && (
        <InvoiceModal row={invoiceRow} onClose={()=>setInvoiceRow(null)} />
      )}
      {discountModal.show && (
        <GroupDiscountModal
          show={discountModal.show}
          onClose={()=>setDiscountModal({ show:false, agencyName:null, checkIn:null, checkOut:null, rows:[] })}
          agencyName={discountModal.agencyName}
          checkIn={discountModal.checkIn}
          checkOut={discountModal.checkOut}
          groupRows={discountModal.rows}
          currentUser={currentUser}
          onApplied={handleDiscountApplied}
        />
      )}
      {paymentModal.show && (
        <GroupPaymentModal
          show={paymentModal.show}
          onClose={()=>setPaymentModal({ show:false, rows:[] })}
          groupRows={paymentModal.rows}
          currentUser={currentUser}
          onDone={handleGroupPaymentDone}
        />
      )}
      {discountModal.show && (
        <GroupDiscountModal
          show={discountModal.show}
          onClose={()=>setDiscountModal({ show:false, agencyName:null, checkIn:null, checkOut:null, rows:[] })}
          agencyName={discountModal.agencyName}
          checkIn={discountModal.checkIn}
          checkOut={discountModal.checkOut}
          groupRows={discountModal.rows}
          currentUser={currentUser}
          onApplied={handleDiscountApplied}
        />
      )}
    </div>
  );
}
