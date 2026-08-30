import React, { useEffect, useState } from 'react';
import {
  searchProfiles,
  TARGET_ROLES,
  type NotificationTarget,
  type ProfileOption,
  type TargetRole,
} from '../../lib/notifications';
import { BRAND, Chip, FAINT, inputStyle, LINE, MUTED } from './ui';

/**
 * Builds the `targets` array the RPCs and rules both expect:
 * `[{ kind: 'role', value: 'staff' }, { kind: 'profile', value: '<uuid>' }]`
 *
 * Roles are toggle chips; individual people come from a name search over
 * `profiles`. Selected people are listed so the sender can see exactly who is
 * on the list before sending.
 */

const ROLE_LABELS: Record<TargetRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  investor: 'Investor',
  customer: 'Customer',
};

export const RecipientPicker: React.FC<{
  value: NotificationTarget[];
  onChange: (next: NotificationTarget[]) => void;
  /** Customers are not offered for manual sends by default. */
  roles?: TargetRole[];
}> = ({ value, onChange, roles = TARGET_ROLES.filter((r) => r !== 'customer') }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const selectedRoles = value.filter((t) => t.kind === 'role').map((t) => t.value);
  const selectedProfiles = value.filter((t) => t.kind === 'profile');

  // Debounced so typing a name does not fire a request per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchProfiles(q);
        if (cancelled) return;
        setResults(found);
        setNames((prev) => {
          const next = { ...prev };
          found.forEach((p) => { next[p.id] = p.full_name || 'Unnamed'; });
          return next;
        });
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  function toggleRole(role: TargetRole) {
    onChange(
      selectedRoles.includes(role)
        ? value.filter((t) => !(t.kind === 'role' && t.value === role))
        : [...value, { kind: 'role', value: role }],
    );
  }

  function addProfile(profile: ProfileOption) {
    if (selectedProfiles.some((t) => t.value === profile.id)) return;
    setNames((prev) => ({ ...prev, [profile.id]: profile.full_name || 'Unnamed' }));
    onChange([...value, { kind: 'profile', value: profile.id }]);
    setQuery('');
    setResults([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Roles */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {roles.map((role) => {
          const active = selectedRoles.includes(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              style={{
                height: 32, padding: '0 14px', borderRadius: 20,
                border: `1px solid ${active ? BRAND : '#e5e7eb'}`,
                background: active ? 'rgba(75,166,234,0.10)' : '#fff',
                color: active ? BRAND : MUTED,
                fontSize: 12.5, fontWeight: active ? 700 : 500,
                fontFamily: 'inherit', cursor: 'pointer',
                transition: 'all 140ms ease',
              }}
            >
              {ROLE_LABELS[role]}
            </button>
          );
        })}
      </div>

      {/* People search */}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a person by name…"
          aria-label="Search a person by name"
          style={inputStyle}
        />

        {query.trim() !== '' && (
          <div style={{
            position: 'absolute', top: 44, left: 0, right: 0, zIndex: 20,
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.10)', maxHeight: 220, overflowY: 'auto',
          }}>
            {searching && (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: FAINT }}>Searching…</div>
            )}
            {!searching && results.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: FAINT }}>No matches</div>
            )}
            {!searching && results.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => addProfile(profile)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, width: '100%', padding: '10px 14px', border: 'none',
                  background: '#fff', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit', borderBottom: '1px solid #f6f6f6',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fafbfc'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>
                  {profile.full_name || 'Unnamed'}
                </span>
                <span style={{ fontSize: 11, color: FAINT, textTransform: 'capitalize' }}>
                  {profile.role ?? '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected */}
      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {selectedRoles.map((role) => (
            <Chip
              key={`role-${role}`}
              label={`All ${ROLE_LABELS[role as TargetRole] ?? role}`}
              color={BRAND}
              bg="rgba(75,166,234,0.10)"
              onRemove={() => toggleRole(role as TargetRole)}
            />
          ))}
          {selectedProfiles.map((target) => (
            <Chip
              key={`profile-${target.value}`}
              label={names[target.value] ?? 'Selected person'}
              color="#7c3aed"
              bg="rgba(124,58,237,0.10)"
              onRemove={() => onChange(value.filter((t) => !(t.kind === 'profile' && t.value === target.value)))}
            />
          ))}
        </div>
      )}
    </div>
  );
};
