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
  kabis: {
    pending: {
      title: 'New KABIS {{action_label}} pending',
      body: '{{customer}} — {{action_label}} — {{plate}} — {{booking}} — {{km}} km',
    },
  },
} as const;

export default en;
