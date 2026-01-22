import React, { useState } from 'react';
import { STAFF_ROLES } from '../constants/roles';
import { supabase } from '../supabaseClient';

export default function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // TODO: قد نستخدم role و setRole لاحقًا لتغيير دور المستخدم من شاشة الدخول
  // const [role, setRole] = useState('reception');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('login_staff_user', {
        p_username: identifier,
        p_password: password,
      });
      if (error) {
        // عرض رسالة الخطأ القادمة من Supabase مباشرة للمساعدة في التشخيص
        console.error('login_staff_user error', error);
        setError(error.message || 'تعذّر تسجيل الدخول، حاول مرة أخرى.');
        return;
      }
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
        return;
      }
      const payload = {
        id: row.id,
        username: row.username,
        name: row.full_name,
        role: row.role,
        loggedAt: new Date().toISOString(),
      };
      onLogin && onLogin(payload);
    } catch (e2) {
      setError('تعذّر تسجيل الدخول، حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4" dir="rtl">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-white/95 rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-indigo-700 via-indigo-800 to-slate-900 text-white p-8 relative">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl">
                🏨
              </div>
              <div>
                <div className="text-lg font-semibold">فندق الكيلاني</div>
                <div className="text-xs text-indigo-100/80">نظام إدارة وتشغيل متكامل للفنادق</div>
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-3">مرحبًا بك في لوحة تحكم الفندق</h1>
            <p className="text-sm text-indigo-100/90 mb-6 leading-relaxed">
              قم بتسجيل الدخول لاستخدام نظام الحجز، توزيع الغرف، متابعة النزلاء،
              والتقارير اليومية، مع صلاحيات مخصّصة لكل دور في الفريق.
            </p>
            <div className="space-y-3 text-xs text-indigo-100/90">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>متابعة الإشغال اليومي للغرف والأسِرّة من شاشة التسكين.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>إدارة الحجوزات، الفواتير، والمدفوعات من مكان واحد.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>صلاحيات مختلفة للمدير، مساعد المدير، الاستقبال، وخدمة الغرف.</span>
              </div>
            </div>
          </div>
          <div className="mt-8 text-[11px] text-indigo-100/70">
            © {new Date().getFullYear()} فندق الكيلاني – نظام إدارة داخلي
          </div>
        </div>

        <div className="p-6 sm:p-8 bg-white">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">تسجيل الدخول</h2>
            <p className="text-xs sm:text-sm text-slate-500">اختر دورك في الفندق ثم أدخل بيانات الدخول.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs sm:text-sm text-slate-700 mb-1">اسم المستخدم / البريد الإلكتروني</label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="مثال: x2008666@gmail.com أو receptionist01"
                value={identifier}
                onChange={(e)=>setIdentifier(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-700 mb-1">كلمة المرور</label>
              <input
                type="password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="••••••••"
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-700 mb-2">أدوار النظام المتاحة</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STAFF_ROLES.map(r => (
                  <div
                    key={r.id}
                    className="text-right border rounded-lg px-3 py-2 text-xs sm:text-sm bg-slate-50 text-slate-700 shadow-sm"
                  >
                    <div className="font-semibold mb-0.5">{r.label}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">{r.description}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                يتم تحديد الدور تلقائيًا حسب الحساب المسجَّل في النظام، ولا يمكن تغييره من شاشة الدخول.
              </p>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2.5 shadow-sm mt-1"
            >
              {loading ? 'جاري الدخول...' : 'دخول إلى النظام'}
            </button>
          </form>

          <div className="mt-6 text-[11px] text-slate-400 leading-relaxed">
            ملاحظة: يتم التحقق من اسم المستخدم وكلمة المرور من قاعدة بيانات الموظفين الداخلية.
            حساب المدير الرئيسي هو البريد الإلكتروني المخصص له فقط.
          </div>
        </div>
      </div>
    </div>
  );
}
