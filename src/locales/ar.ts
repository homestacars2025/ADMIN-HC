/**
 * Arabic strings for notification and task messages.
 *
 * Same key shape as `en`. The dashboard chrome stays English; these are the
 * message bodies, which the database also stores in Arabic as a fallback.
 */
const ar = {
  reminder: {
    missing_insurance: {
      title: 'ارفع ملف التأمين — {{plate}}',
      body: 'السيارة {{plate}} ما عندها ملف تأمين مرفوع. لطفاً ارفعه في صفحة السيارة.',
    },
    missing_ruhsat: {
      title: 'ارفع ملف الرخصة (ruhsat) — {{plate}}',
      body: 'السيارة {{plate}} ما عندها ملف ruhsat مرفوع.',
    },
    insurance_expiring: {
      title: 'جدّد التأمين — {{plate}}',
      body: 'تأمين السيارة {{plate}} ينتهي بتاريخ {{date}}. جهّز التجديد.',
    },
    inspection_expiring: {
      title: 'جدّد الفحص الدوري — {{plate}}',
      body: 'فحص السيارة {{plate}} ينتهي بتاريخ {{date}}.',
    },
    open_car_issues: {
      title: 'عندك {{count}} مشكلة سيارة تحتاج مراجعة',
      body: 'يوجد {{count}} سجل في Car Issues لسه بحالة open. ادخل راجعها.',
    },
  },
  kabis: {
    pending: {
      title: 'تسجيل KABIS جديد بانتظار — {{action_label}}',
      body: '{{customer}} — {{action_label}} — {{plate}} — {{booking}} — {{km}} كم',
    },
  },
} as const;

export default ar;
