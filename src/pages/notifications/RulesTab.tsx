import React, { useCallback, useEffect, useState } from 'react';
import {
  CATEGORY_STYLES,
  createNotificationRule,
  getNotificationRules,
  updateNotificationRule,
  type NotificationCategory,
  type NotificationRule,
  type NotificationTarget,
} from '../../lib/notifications';
import { RecipientPicker } from './RecipientPicker';
import {
  BRAND, Button, CARD_STYLE, Chip, EmptyState, ErrorBanner, FAINT, Field, INK, inputStyle,
  LINE, Modal, MUTED, textareaStyle, Toast, Toggle,
} from './ui';

const CATEGORIES: NotificationCategory[] = ['event', 'reminder', 'task', 'manual'];

interface RuleDraft {
  name: string;
  event_key: string;
  category: NotificationCategory;
  is_active: boolean;
  targets: NotificationTarget[];
  title_template: string;
  body_template: string;
  link_template: string;
}

const EMPTY_DRAFT: RuleDraft = {
  name: '',
  event_key: '',
  category: 'event',
  is_active: true,
  targets: [],
  title_template: '',
  body_template: '',
  link_template: '',
};

function toDraft(rule: NotificationRule): RuleDraft {
  return {
    name: rule.name ?? '',
    event_key: rule.event_key ?? '',
    category: rule.category ?? 'event',
    is_active: rule.is_active,
    targets: rule.targets ?? [],
    title_template: rule.title_template ?? '',
    body_template: rule.body_template ?? '',
    link_template: rule.link_template ?? '',
  };
}

const TargetChips: React.FC<{ targets: NotificationTarget[] | null }> = ({ targets }) => {
  if (!targets || targets.length === 0) {
    return <span style={{ fontSize: 12, color: FAINT }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {targets.map((t, i) => (
        <Chip
          key={`${t.kind}-${t.value}-${i}`}
          label={t.kind === 'role' ? `All ${t.value}` : 'Person'}
          color={t.kind === 'role' ? BRAND : '#7c3aed'}
          bg={t.kind === 'role' ? 'rgba(75,166,234,0.10)' : 'rgba(124,58,237,0.10)'}
        />
      ))}
    </div>
  );
};

export const RulesTab: React.FC = () => {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(handle);
  }, [toast]);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotificationRules();
      if (signal?.cancelled) return;
      setRules(data);
    } catch (e) {
      if (signal?.cancelled) return;
      setError(e instanceof Error ? e.message : 'Could not load rules');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  /** Optimistic, with rollback — the row snaps back if the write is refused. */
  async function toggleActive(rule: NotificationRule, next: boolean) {
    const before = rules;
    setBusyId(rule.id);
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r)));
    try {
      await updateNotificationRule(rule.id, { is_active: next });
    } catch (e) {
      setRules(before);
      setToast({ message: e instanceof Error ? e.message : 'Could not update the rule', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(rule: NotificationRule) {
    setDraft(toDraft(rule));
    setEditing(rule);
    setCreating(false);
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
  }

  async function save() {
    if (!draft.name.trim()) {
      setToast({ message: 'A rule name is required', kind: 'error' });
      return;
    }
    if (!draft.event_key.trim()) {
      setToast({ message: 'An event key is required', kind: 'error' });
      return;
    }

    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      event_key: draft.event_key.trim(),
      category: draft.category,
      is_active: draft.is_active,
      targets: draft.targets,
      conditions: null,
      title_template: draft.title_template.trim() || null,
      body_template: draft.body_template.trim() || null,
      link_template: draft.link_template.trim() || null,
    };

    try {
      if (editing) await updateNotificationRule(editing.id, payload);
      else await createNotificationRule(payload);
      setToast({ message: editing ? 'Rule updated' : 'Rule created', kind: 'success' });
      closeModal();
      load();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not save the rule', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const modalOpen = creating || editing !== null;

  return (
    <>
      {error && <ErrorBanner message={error} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button kind="primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          New rule
        </Button>
      </div>

      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: FAINT }}>
            Loading…
          </div>
        )}

        {!loading && rules.length === 0 && (
          <EmptyState
            title="No event rules yet"
            description="An event rule turns a system event — a booking created, a fine imported — into a notification for the people you choose."
            action={<Button kind="primary" small onClick={openCreate}>Create the first rule</Button>}
          />
        )}

        {!loading && rules.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
                  {['Rule', 'Event key', 'Category', 'Recipients', 'Active', ''].map((h) => (
                    <th key={h} style={{
                      padding: '11px 16px', fontSize: 11, fontWeight: 700, color: FAINT,
                      letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const style = CATEGORY_STYLES[rule.category] ?? CATEGORY_STYLES.event;
                  return (
                    <tr key={rule.id} style={{ borderBottom: '1px solid #f4f4f4' }}>
                      <td style={{ padding: '13px 16px', fontSize: 13.5, fontWeight: 700, color: INK }}>
                        {rule.name}
                      </td>
                      <td style={{
                        padding: '13px 16px', fontSize: 12, color: MUTED,
                        fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
                      }}>
                        {rule.event_key}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <Chip label={style.label} color={style.color} bg={style.bg} />
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <TargetChips targets={rule.targets} />
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <Toggle
                          checked={rule.is_active}
                          busy={busyId === rule.id}
                          ariaLabel={`${rule.is_active ? 'Deactivate' : 'Activate'} ${rule.name}`}
                          onChange={(next) => toggleActive(rule, next)}
                        />
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                        <Button small onClick={() => openEdit(rule)}>Edit</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit rule' : 'New rule'}
          onClose={closeModal}
          wide
          footer={
            <>
              <Button onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button kind="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create rule'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="Rule name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Notify staff on new booking"
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field
                label="Event key"
                required
                hint="The system event that fires this rule, e.g. booking.created"
              >
                <input
                  value={draft.event_key}
                  onChange={(e) => setDraft({ ...draft, event_key: e.target.value })}
                  placeholder="booking.created"
                  style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
                />
              </Field>

              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as NotificationCategory })}
                  style={inputStyle}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_STYLES[c].label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Recipients">
              <RecipientPicker
                value={draft.targets}
                onChange={(targets) => setDraft({ ...draft, targets })}
              />
            </Field>

            <div style={{
              background: 'rgba(75,166,234,0.06)', border: '1px solid rgba(75,166,234,0.18)',
              borderRadius: 10, padding: '10px 13px', fontSize: 12, color: MUTED, lineHeight: 1.6,
            }}>
              Templates support <code style={{ fontFamily: 'ui-monospace, monospace', color: INK }}>{'{{placeholders}}'}</code>,
              which are filled from the event payload when the rule fires — for example{' '}
              <code style={{ fontFamily: 'ui-monospace, monospace', color: INK }}>{'{{plate}}'}</code> or{' '}
              <code style={{ fontFamily: 'ui-monospace, monospace', color: INK }}>{'{{customer_name}}'}</code>.
            </div>

            <Field label="Title template">
              <input
                value={draft.title_template}
                onChange={(e) => setDraft({ ...draft, title_template: e.target.value })}
                placeholder="New booking for {{plate}}"
                style={inputStyle}
              />
            </Field>

            <Field label="Body template">
              <textarea
                rows={3}
                value={draft.body_template}
                onChange={(e) => setDraft({ ...draft, body_template: e.target.value })}
                placeholder="{{customer_name}} booked {{plate}} from {{start_date}}."
                style={textareaStyle}
              />
            </Field>

            <Field label="Link template" hint="Internal path, placeholders allowed.">
              <input
                value={draft.link_template}
                onChange={(e) => setDraft({ ...draft, link_template: e.target.value })}
                placeholder="/dashboard/bookings?id={{booking_id}}"
                style={inputStyle}
              />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <Toggle
                checked={draft.is_active}
                ariaLabel="Rule active"
                onChange={(next) => setDraft({ ...draft, is_active: next })}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                {draft.is_active ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </>
  );
};
