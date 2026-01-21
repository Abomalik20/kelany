export const STAFF_ROLES = [
  {
    id: 'manager',
    label: 'المدير العام',
    description: 'تحكم كامل في النظام وجميع التقارير والإعدادات.',
  },
  {
    id: 'assistant_manager',
    label: 'مساعد المدير',
    description: 'مساعدة في متابعة الحجوزات والضيوف والتقارير اليومية.',
  },
  {
    id: 'reception',
    label: 'الاستقبال',
    description: 'تسجيل دخول وخروج النزلاء وإدارة الحجوزات اليومية.',
  },
  {
    id: 'housekeeping',
    label: 'خدمة الغرف (Housekeeping)',
    description: 'متابعة حالة الغرف والتنظيف والتنسيق مع الاستقبال.',
  },
];

export const getRoleLabel = (id) => {
  const r = STAFF_ROLES.find(x => x.id === id);
  return r ? r.label : 'مستخدم';
};
