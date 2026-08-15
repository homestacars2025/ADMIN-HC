import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffProfile {
  id: string;
  full_name: string | null;
  email: string;
}

/** A grantable section — driven entirely by the restricted_sections table. */
interface RestrictedSection {
  key: string;
  label: string;
  sort_order: number;
}

interface GrantRow {
  profile_id: string;
  section_key: string;
}

/** Composite key for the in-memory grant set. */
const grantKey = (profileId: string, sectionKey: string) => `${profileId}::${sectionKey}`;

// ─── Shared styles ────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background: '#fff', borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
};

// ─── Small components ─────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; kind: 'success' | 'error' }> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? '#0f1117' : '#fff1f2',
      color: kind === 'success' ? '#fff' : '#ef4444',
      border: kind === 'error' ? '1px solid #fecaca' : 'none',
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {kind === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#16a34a" /><path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v5M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>}
      {message}
    </div>,
    document.body,
  );

/** iOS-style switch. The whole row is the label, so the tap target is ≥44px. */
const SectionToggle: React.FC<{
  label: string;
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, checked, busy, onChange }) => (
  <label
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      minHeight: 44, padding: '8px 12px', borderRadius: 10,
      cursor: busy ? 'wait' : 'pointer',
      background: checked ? 'rgba(75,166,234,0.06)' : '#fafbfc',
      border: `1.5px solid ${checked ? 'rgba(75,166,234,0.35)' : '#f0f0f0'}`,
      transition: 'background 140ms ease, border-color 140ms ease',
      opacity: busy ? 0.65 : 1,
    }}
  >
    <span style={{ fontSize: 13, fontWeight: 600, color: checked ? '#0f1117' : '#6b7280', minWidth: 0, wordBreak: 'break-word' }}>
      {label}
    </span>

    <input
      type="checkbox"
      checked={checked}
      disabled={busy}
      onChange={e => onChange(e.target.checked)}
      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
    />

    <span
      aria-hidden="true"
      style={{
        position: 'relative', width: 40, height: 23, borderRadius: 20, flexShrink: 0,
        background: checked ? '#4ba6ea' : '#d1d5db',
        transition: 'background 160ms ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 2.5, left: checked ? 19.5 : 2.5,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 160ms ease',
      }} />
    </span>
  </label>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const StaffPermissionsPage: React.FC = () => {
  const [staff, setStaff]       = useState<StaffProfile[]>([]);
  const [sections, setSections] = useState<RestrictedSection[]>([]);
  const [grants, setGrants]     = useState<Set<string>>(new Set());
  const [adminId, setAdminId]   = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [toast, setToast]     = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Current admin — recorded as granted_by on every new grant.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setAdminId(user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  // Staff, sections and existing grants. Sections come straight from the table,
  // so anything added there later shows up here with no code change.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [staffRes, sectionRes, grantRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('role', 'staff').order('full_name'),
      supabase.from('restricted_sections').select('key, label, sort_order').eq('is_active', true).order('sort_order').order('key'),
      supabase.from('staff_sections').select('profile_id, section_key'),
    ]);

    const firstError = staffRes.error ?? sectionRes.error ?? grantRes.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }

    setStaff((staffRes.data ?? []) as unknown as StaffProfile[]);
    setSections((sectionRes.data ?? []) as unknown as RestrictedSection[]);
    setGrants(new Set(((grantRes.data ?? []) as unknown as GrantRow[]).map(g => grantKey(g.profile_id, g.section_key))));
    setLoading(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Saved immediately on toggle: optimistic flip, reverted if the write fails.
  const toggle = async (profileId: string, sectionKey: string, next: boolean) => {
    const key = grantKey(profileId, sectionKey);
    if (busyKeys.has(key)) return;

    setBusyKeys(prev => new Set(prev).add(key));
    setGrants(prev => {
      const n = new Set(prev);
      if (next) n.add(key); else n.delete(key);
      return n;
    });

    const { error: writeError } = next
      ? await supabase.from('staff_sections').insert({
          profile_id: profileId,
          section_key: sectionKey,
          granted_by: adminId,
        })
      : await supabase.from('staff_sections')
          .delete()
          .eq('profile_id', profileId)
          .eq('section_key', sectionKey);

    setBusyKeys(prev => { const n = new Set(prev); n.delete(key); return n; });

    if (writeError) {
      // Put the switch back where it was — the database is the source of truth.
      setGrants(prev => {
        const n = new Set(prev);
        if (next) n.delete(key); else n.add(key);
        return n;
      });
      showToast(writeError.message, 'error');
      return;
    }

    showToast(next ? 'Access granted.' : 'Access removed.');
  };

  const grantedCount = useCallback(
    (profileId: string) => sections.filter(s => grants.has(grantKey(profileId, s.key))).length,
    [sections, grants],
  );

  const totalGrants = useMemo(
    () => staff.reduce((n, s) => n + grantedCount(s.id), 0),
    [staff, grantedCount],
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: 'clamp(22px, 4vw, 44px) clamp(16px, 3vw, 40px)' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>Admin Tools</span>
        </div>
        <h1 style={{ fontSize: 'clamp(23px, 4vw, 30px)', fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', margin: 0 }}>
          Staff Permissions
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Grant individual staff members access to restricted sections. Changes save immediately.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ef4444' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      {/* Summary */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, fontSize: 12, color: '#6b7280' }}>
          <span style={{ ...CARD_STYLE, padding: '7px 13px', borderRadius: 20, fontWeight: 600 }}>
            {staff.length} staff member{staff.length === 1 ? '' : 's'}
          </span>
          <span style={{ ...CARD_STYLE, padding: '7px 13px', borderRadius: 20, fontWeight: 600 }}>
            {sections.length} restricted section{sections.length === 1 ? '' : 's'}
          </span>
          <span style={{ ...CARD_STYLE, padding: '7px 13px', borderRadius: 20, fontWeight: 600 }}>
            {totalGrants} grant{totalGrants === 1 ? '' : 's'} active
          </span>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ ...CARD_STYLE, padding: 18 }}>
              <div style={{ height: 14, width: '55%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 11, width: '75%', borderRadius: 6, background: '#f3f4f6', marginTop: 9, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 44, borderRadius: 10, background: '#f3f4f6', marginTop: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 44, borderRadius: 10, background: '#f3f4f6', marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      )}

      {/* No restricted sections configured */}
      {!loading && !error && sections.length === 0 && (
        <div style={{ ...CARD_STYLE, padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>No restricted sections configured</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 5 }}>
            Add rows to <code style={{ fontFamily: 'monospace', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>restricted_sections</code> and they will appear here automatically.
          </div>
        </div>
      )}

      {/* No staff */}
      {!loading && !error && sections.length > 0 && staff.length === 0 && (
        <div style={{ ...CARD_STYLE, padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>No staff members yet</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 5 }}>
            Accounts with the “staff” role will appear here.
          </div>
        </div>
      )}

      {/* Staff cards */}
      {!loading && !error && sections.length > 0 && staff.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {staff.map(person => {
            const granted = grantedCount(person.id);
            return (
              <div key={person.id} style={{ ...CARD_STYLE, padding: 18, display: 'flex', flexDirection: 'column' }}>
                {/* Identity */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.2px', wordBreak: 'break-word' }}>
                      {person.full_name?.trim() || 'Unnamed staff'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, wordBreak: 'break-all' }}>{person.email}</div>
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
                    color: granted > 0 ? '#2e8fd4' : '#9ca3af',
                    background: granted > 0 ? 'rgba(75,166,234,0.12)' : '#f3f4f6',
                  }}>
                    {granted} / {sections.length}
                  </span>
                </div>

                {/* Section toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sections.map(section => {
                    const key = grantKey(person.id, section.key);
                    return (
                      <SectionToggle
                        key={section.key}
                        label={section.label}
                        checked={grants.has(key)}
                        busy={busyKeys.has(key)}
                        onChange={next => void toggle(person.id, section.key, next)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
};

export default StaffPermissionsPage;
