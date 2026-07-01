import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileRow {
  full_name:    string | null;
  email:        string | null;
  phone:        string | null;
  role:         string | null;
  last_seen_at: string | null;
}

interface TeamMemberRow {
  id:                  string;
  position:            string | null;
  is_active:           boolean | null;
  can_view_accounting: boolean | null;
  created_at:          string | null;
  // Supabase returns the joined row as an object for a to-one relationship,
  // but the generated types can widen it to an array — accept both.
  profiles:            ProfileRow | ProfileRow[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#4ba6ea', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)     return `${h}h ago`;
  if (h < 48) {
    const t = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Yesterday at ${t}`;
  }
  return `${Math.floor(h / 24)}d ago`;
}

function absTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Normalize the joined profiles value to a single row (or null).
function firstProfile(p: TeamMemberRow['profiles']): ProfileRow | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => {
  const color = avatarColor(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: size * 0.33, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {initials(name)}
      </span>
    </div>
  );
};

const ActiveBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 9px', borderRadius: 20,
    fontSize: 11, fontWeight: 700,
    color: active ? '#059669' : '#9ca3af',
    background: active ? 'rgba(16,185,129,0.1)' : '#f3f4f6',
  }}>
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: active ? '#10b981' : '#d1d5db',
    }} />
    {active ? 'Active' : 'Inactive'}
  </span>
);

const AccountingBadge: React.FC<{ can: boolean }> = ({ can }) =>
  can ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      color: '#4ba6ea', background: 'rgba(75,166,234,0.1)',
      border: '1px solid rgba(75,166,234,0.2)',
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M18 9l-5 5-3-3-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Accountant
    </span>
  ) : (
    <span style={{ fontSize: 13, color: '#d1d5db' }}>—</span>
  );

// ─── Page ─────────────────────────────────────────────────────────────────────

const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('team_members')
        .select('id, position, is_active, can_view_accounting, created_at, profiles!team_members_profile_id_fkey(full_name, email, phone, role, last_seen_at)')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setMembers((data ?? []) as unknown as TeamMemberRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const headers = ['Team Member', 'Phone', 'Position', 'Active', 'Accounting', 'Last Seen'];

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes teamSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: '0 0 6px' }}>Team</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          Team members &amp; permissions
        </p>
      </div>

      {/* ── Table card ── */}
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1.5px solid #f0f0f0', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              border: '2px solid #e5e7eb', borderTopColor: '#4ba6ea',
              animation: 'teamSpin 0.8s linear infinite', margin: '0 auto',
            }} />
          </div>
        ) : error ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
            Failed to load team members: {error}
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            No team members found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {headers.map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => {
                  const p = firstProfile(m.profiles);
                  const name = p?.full_name || '';
                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: i < members.length - 1 ? '1px solid #f9fafb' : 'none',
                        background: '#fff',
                        transition: 'background 100ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      {/* Full name + email */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={name || p?.email || '?'} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>
                              {name || <span style={{ color: '#d1d5db', fontStyle: 'italic', fontWeight: 400 }}>No name</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p?.email ?? ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: p?.phone ? '#4b5563' : '#d1d5db', whiteSpace: 'nowrap' }}>
                        {p?.phone || '—'}
                      </td>

                      {/* Position */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: m.position ? '#4b5563' : '#d1d5db', whiteSpace: 'nowrap' }}>
                        {m.position || '—'}
                      </td>

                      {/* Active */}
                      <td style={{ padding: '12px 16px' }}>
                        <ActiveBadge active={!!m.is_active} />
                      </td>

                      {/* Accounting */}
                      <td style={{ padding: '12px 16px' }}>
                        <AccountingBadge can={!!m.can_view_accounting} />
                      </td>

                      {/* Last seen */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          title={absTime(p?.last_seen_at ?? null)}
                          style={{
                            fontSize: 13, color: p?.last_seen_at ? '#4b5563' : '#d1d5db',
                            cursor: p?.last_seen_at ? 'help' : 'default', whiteSpace: 'nowrap',
                          }}
                        >
                          {relativeTime(p?.last_seen_at ?? null)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamPage;
