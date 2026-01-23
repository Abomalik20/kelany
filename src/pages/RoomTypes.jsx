import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import RoomTypeCard from '../components/RoomTypeCard.jsx';
import RoomTypeModal from '../components/RoomTypeModal.jsx';

export default function RoomTypes() {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setTypes(data || []);
    } catch (e) {
      console.error(e);
      alert('فشل تحميل أنواع الغرف');
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  const handleEdit = (t) => {
    setEditing(t);
    setShowModal(true);
  };

  const handleDelete = async (t) => {
    if (!window.confirm('هل متأكد من حذف نوع الغرفة؟')) return;
    const { error } = await supabase.from('room_types').delete().eq('id', t.id);
    if (error) return alert(error.message);
    load();
  };

  const handleSave = async (payload) => {
    try {
      if (editing && editing.id) {
        const { error } = await supabase.from('room_types').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('room_types').insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      load();
    } catch (e) {
      alert(e.message || 'خطأ في الحفظ');
    }
  };

  if (loading) return <div className="p-6">جاري التحميل...</div>;

  return (
    <div className="p-6" dir="rtl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة أنواع الغرف</h1>
          <p className="text-sm text-gray-500">عرض وإدارة أنواع الغرف المتاحة</p>
        </div>
        <div>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded">إضافة نوع غرفة</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {types.map(t => (
          <RoomTypeCard key={t.id} type={t} onEdit={() => handleEdit(t)} onDelete={() => handleDelete(t)} />
        ))}
      </div>

      {showModal && (
        <RoomTypeModal initialData={editing} onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
    </div>
  );
}
