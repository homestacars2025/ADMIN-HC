/**
 * English strings for notification and task messages.
 *
 * Keys mirror the `i18n_key` values the database stores on each row, so a
 * notification carries a key and its variables and the app renders the sentence
 * at display time. The `title`/`body` columns are only a fallback.
 */
const en = {
  reminder: {
    missing_insurance: {
      title: 'Upload insurance file — {{plate}}',
      body: 'Car {{plate}} has no insurance file uploaded. Please upload it on the car page.',
    },
    missing_ruhsat: {
      title: 'Upload registration (ruhsat) — {{plate}}',
      body: 'Car {{plate}} has no ruhsat file uploaded.',
    },
    insurance_expiring: {
      title: 'Renew insurance — {{plate}}',
      body: 'Insurance for car {{plate}} expires on {{date}}. Prepare the renewal.',
    },
    inspection_expiring: {
      title: 'Renew inspection — {{plate}}',
      body: 'Inspection for car {{plate}} expires on {{date}}.',
    },
    open_car_issues: {
      title: 'You have {{count}} car issue(s) to review',
      body: 'There are {{count}} record(s) in Car Issues still open. Please review them.',
    },
  },
  task: {
    assigned: { title: 'New task: {{title}}' },
    due_soon: { title: 'Task due soon: {{title}}' },
    overdue: { title: 'Task overdue: {{title}}' },
  },
  compliance: {
    insurance: {
      expires_today: 'Insurance expires today — {{plate}}',
      expires_tomorrow: 'Insurance expires tomorrow — {{plate}}',
      expires_in_days: 'Insurance expires in {{days_left}} days — {{plate}}',
      expires_soon: 'Insurance expires soon — {{plate}}',
    },
    inspection: {
      expires_today: 'Inspection expires today — {{plate}}',
      expires_tomorrow: 'Inspection expires tomorrow — {{plate}}',
      expires_in_days: 'Inspection expires in {{days_left}} days — {{plate}}',
      expires_soon: 'Inspection expires soon — {{plate}}',
    },
    expiring_body: '{{model}} · Expires {{expiry}}',
    expiring_body_no_model: 'Expires {{expiry}}',
  },
  fines: {
    unpaid: {
      one: '{{count}} unpaid fine — {{total}}',
      many: '{{count}} unpaid fines — {{total}}',
      not_linked: '{{count}} not linked to a customer',
      oldest: 'Oldest from {{oldest}}',
    },
  },
  kabis: {
    pending: {
      title: 'New KABIS {{action_label}} pending',
      body: '{{customer}} — {{action_label}} — {{plate}} — {{booking}} — {{km}} km',
    },
  },
} as const;

export default en;
