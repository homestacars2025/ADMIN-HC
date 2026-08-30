import React, { useCallback, useEffect, useState } from 'react';
import {
  CATEGORY_STYLES,
  formatDateTime,
  getReminderRules,
  runReminderRule,
  updateReminderRule,
  type NotificationCategory,
  type ReminderRule,
  type RunResult,
  type TargetRole,
} from '../../lib/notifications';
import {
  BRAND, Button, CARD_STYLE, Chip, EmptyState, ErrorBanner, FAINT, Field, INK, inputStyle,
  LINE, Modal, MUTED, PAGE_STYLE, PageHeader, textareaStyle, Toast, Toggle,
} from './ui';

const CATEGORIES: NotificationCategory[] = ['event', 'reminder', 'task', 'manual'];
const ROLES: TargetRole[] = ['admin', 'staff', 'investor', 'customer'];
const MODES: Array<ReminderRule['mode']> = ['per_row', 'aggregate'];

const MODE_LABELS: Record<ReminderRule['mode'], string> = {
  per_row: 'Per row',
  aggregate: 'Aggregate',
};

/** Rule names and descriptions are operator-authored and often Arabic, so the
 *  text direction is resolved per value rather than forced to the page's LTR. */
const AUTO_DIR: React.HTMLAttributes<HTMLElement> = { dir: 'auto' };

const ReminderRulesPage: React.FC = () => {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult[] | null>(null);
  const [editing, setEditing] = useState<ReminderRule | null>(null);
  const [draft, setDraft] = useState<ReminderRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(handle);
  }, [toast]);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReminderRules();
      if (signal?.cancelled) return;
      setRules(data);
    } catch (e) {
      if (signal?.cancelled) return;
      setError(e instanceof Error ? e.message : 'Could not load reminder rules');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  async function toggleActive(rule: ReminderRule, next: boolean) {
    const before = rules;
    setBusyId(rule.id);
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r)));
    try {
      await updateReminderRule(rule.id, { is_active: next });
    } catch (e) {
      setRules(before);
      setToast({ message: e instanceof Error ? e.message : 'Could not update the rule', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  function summarise(results: RunResult[]): string {
    if (results.length === 0) return 'Nothing to generate';
    const total = results.reduce((n, r) => n + (r.generated ?? 0), 0);
    if (results.length === 1) {
      const one = results[0];
      return one.generated === 0
        ? `${one.rule_name}: nothing to generate`
        : `${one.rule_name}: generated ${one.generated}`;
    }
    return `Ran ${results.length} rules — generated ${total} in total`;
  }

  async function runOne(rule: ReminderRule) {
    setRunningId(rule.id);
    setLastRun(null);
    try {
      const results = await runReminderRule(rule.id);
      setLastRun(results);
      setToast({ message: summarise(results), kind: 'success' });
      load();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not run the rule', kind: 'error' });
    } finally {
      setRunningId(null);
    }
  }

  async function runAll() {
    setRunningAll(true);
    setLastRun(null);
    try {
      const results = await runReminderRule(null);
      setLastRun(results);
      setToast({ message: summarise(results), kind: 'success' });
      load();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not run the rules', kind: 'error' });
    } finally {
      setRunningAll(false);
    }
  }

  async function save() {
    if (!draft || !editing) return;
    if (!draft.name.trim()) {
      setToast({ message: 'A rule name is required', kind: 'error' });
      return;
    }

    setSaving(true);
    try {
      await updateReminderRule(editing.id, {
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        is_active: draft.is_active,
        check_query: draft.check_query?.trim() || null,
        mode: draft.mode,
        category: draft.category,
        target_role: draft.target_role,
        title_template: draft.title_template?.trim() || null,
        body_template: draft.body_template?.trim() || null,
        link_template: draft.link_template?.trim() || null,
        dedupe_template: draft.dedupe_template?.trim() || null,
        run_frequency: draft.run_frequency?.trim() || null,
      });
      setToast({ message: 'Rule saved', kind: 'success' });
      setEditing(null);
      setDraft(null);
      load();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not save the rule', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        eyebrow="Admin Tools"
        title="Reminder Rules"
        subtitle="Scheduled checks that scan the database and raise reminders or tasks. Run one on demand to see exactly what it would generate right now."
        action={
          <Button kind="primary" onClick={runAll} disabled={runningAll}>
            {runningAll ? 'Running…' : 'Run all active rules'}
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {lastRun && lastRun.length > 0 && (
        <div style={{
          ...CARD_STYLE, padding: '13px 18px', marginBottom: 18,
          background: 'rgba(75,166,234,0.05)', borderColor: 'rgba(75,166,234,0.22)',
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 7 }}>
            Last run
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lastRun.map((r, i) => (
              <div key={`${r.rule_name}-${i}`} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5,
              }}>
                <span style={{ color: MUTED, minWidth: 0 }} {...AUTO_DIR}>{r.rule_name}</span>
                <span style={{
                  color: r.generated > 0 ? BRAND : FAINT, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {r.generated > 0 ? `generated ${r.generated}` : 'nothing to generate'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: FAINT }}>
            Loading…
          </div>
        )}

        {!loading && rules.length === 0 && (
          <EmptyState
            title="No reminder rules"
            description="Reminder rules are added by the technical team — each one carries a SQL check that decides what to raise."
          />
        )}

        {!loading && rules.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1020, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
                  {['Rule', 'Mode', 'Sends to', 'Last run', 'Active', ''].map((h) => (
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
                  const style = CATEGORY_STYLES[rule.category] ?? CATEGORY_STYLES.reminder;
                  return (
                    <tr key={rule.id} style={{ borderBottom: '1px solid #f4f4f4' }}>
                      <td style={{ padding: '13px 16px', maxWidth: 340 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }} {...AUTO_DIR}>
                          {rule.name}
                        </div>
                        {rule.description && (
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 }} {...AUTO_DIR}>
                            {rule.description}
                          </div>
                        )}
                        <div style={{ marginTop: 6 }}>
                          <Chip label={style.label} color={style.color} bg={style.bg} />
                        </div>
                      </td>

                      <td style={{ padding: '13px 16px', fontSize: 12.5, color: MUTED, whiteSpace: 'nowrap' }}>
                        {MODE_LABELS[rule.mode] ?? rule.mode}
                      </td>

                      <td style={{
                        padding: '13px 16px', fontSize: 12.5, color: MUTED,
                        textTransform: 'capitalize', whiteSpace: 'nowrap',
                      }}>
                        {rule.target_role}
                      </td>

                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 12.5, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                          {formatDateTime(rule.last_run_at)}
                        </div>
                        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
                          {rule.last_run_count === null
                            ? 'never run'
                            : `generated ${rule.last_run_count}`}
                        </div>
                      </td>

                      <td style={{ padding: '13px 16px' }}>
                        <Toggle
                          checked={rule.is_active}
                          busy={busyId === rule.id}
                          ariaLabel={`${rule.is_active ? 'Deactivate' : 'Activate'} ${rule.name}`}
                          onChange={(next) => toggleActive(rule, next)}
                        />
                      </td>

                      <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 7 }}>
                          <Button
                            kind="primary"
                            small
                            onClick={() => runOne(rule)}
                            disabled={runningId === rule.id || runningAll}
                          >
                            {runningId === rule.id ? 'Running…' : 'Run now'}
                          </Button>
                          <Button small onClick={() => { setEditing(rule); setDraft({ ...rule }); }}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && draft && (
        <Modal
          title="Edit reminder rule"
          onClose={() => { setEditing(null); setDraft(null); }}
          wide
          footer={
            <>
              <Button onClick={() => { setEditing(null); setDraft(null); }} disabled={saving}>
                Cancel
              </Button>
              <Button kind="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="Name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                style={inputStyle}
                dir="auto"
              />
            </Field>

            <Field label="Description">
              <textarea
                rows={2}
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                style={textareaStyle}
                dir="auto"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Mode">
                <select
                  value={draft.mode}
                  onChange={(e) => setDraft({ ...draft, mode: e.target.value as ReminderRule['mode'] })}
                  style={inputStyle}
                >
                  {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                </select>
              </Field>

              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as NotificationCategory })}
                  style={inputStyle}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_STYLES[c].label}</option>)}
                </select>
              </Field>

              <Field label="Sends to">
                <select
                  value={draft.target_role}
                  onChange={(e) => setDraft({ ...draft, target_role: e.target.value as TargetRole })}
                  style={{ ...inputStyle, textTransform: 'capitalize' }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Run frequency" hint="Free text, e.g. daily — the scheduler reads this.">
              <input
                value={draft.run_frequency ?? ''}
                onChange={(e) => setDraft({ ...draft, run_frequency: e.target.value })}
                placeholder="daily"
                style={inputStyle}
              />
            </Field>

            {/* The dangerous field. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Check query</label>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 9,
                background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: 10, padding: '10px 13px',
                fontSize: 12, color: '#b91c1c', lineHeight: 1.6,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>
                  <strong>SQL, executed literally — developers only.</strong> This runs against the
                  live database every time the rule fires. A wrong query can raise a flood of
                  notifications or fail silently.
                </span>
              </div>
              <textarea
                rows={9}
                value={draft.check_query ?? ''}
                onChange={(e) => setDraft({ ...draft, check_query: e.target.value })}
                spellCheck={false}
                dir="ltr"
                style={{
                  ...textareaStyle,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  background: '#fafbfc',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                }}
              />
            </div>

            <Field label="Title template">
              <input
                value={draft.title_template ?? ''}
                onChange={(e) => setDraft({ ...draft, title_template: e.target.value })}
                style={inputStyle}
                dir="auto"
              />
            </Field>

            <Field label="Body template">
              <textarea
                rows={2}
                value={draft.body_template ?? ''}
                onChange={(e) => setDraft({ ...draft, body_template: e.target.value })}
                style={textareaStyle}
                dir="auto"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Link template">
                <input
                  value={draft.link_template ?? ''}
                  onChange={(e) => setDraft({ ...draft, link_template: e.target.value })}
                  style={inputStyle}
                  dir="ltr"
                />
              </Field>
              <Field label="Dedupe template" hint="Keeps the same reminder from being raised twice.">
                <input
                  value={draft.dedupe_template ?? ''}
                  onChange={(e) => setDraft({ ...draft, dedupe_template: e.target.value })}
                  style={inputStyle}
                  dir="ltr"
                />
              </Field>
            </div>

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
    </div>
  );
};

export default ReminderRulesPage;
