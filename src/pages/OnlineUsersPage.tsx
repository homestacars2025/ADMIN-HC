import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PRESENCE_CHANNEL } from '../hooks/usePresence';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppName = 'admin' | 'team' | 'investor';

interface PresenceUser {
  user_id:    string;
  full_name:  string;
  email:      string;
  role:       string;
  app:        AppName;
  joined_at:  string;
  presence_ref?: string;
}

interface ProfileRow {
  id:           string;
  full_name:    string | null;
  email:        string | null;
  role:         string | null;
  last_seen_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_CONFIG: Record<AppName, { label: string; color: string; bg: string; border: string }> = {
  admin:    { label: 'Admin',    color: '#4ba6ea', bg: 'rgba(75,166,234,0.08)',  border: 'rgba(75,166,234,0.2)'  },
  team:     { label: 'Team',     color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  investor: { label: 'Investor', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)'  },
};

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

function fmtSince(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const PulseDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
    {on && (
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: '#10b981', opacity: 0.5,
        animation: 'ouPulse 1.6s ease-out infinite',
      }} />
    )}
    <span style={{
      width: 10, height: 10, borderRadius: '50%',
      background: on ? '#10b981' : '#d1d5db',
      flexShrink: 0,
    }} />
  </span>
);

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const map: Record<string, { color: string; bg: string }> = {
    admin:    { color: '#4ba6ea', bg: 'rgba(75,166,234,0.1)'  },
    team:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
    investor: { color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
    staff:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
    owner:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  };
  const s = map[role?.toLowerCase()] ?? { color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize',
      color: s.color, background: s.bg,
    }}>
      {role || 'user'}
    </span>
  );
};

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 38 }) => {
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

// ─── UserCard (online) ────────────────────────────────────────────────────────

const UserCard: React.FC<{ user: PresenceUser }> = ({ user }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 12,
    background: '#fff', border: '1.5px solid #f0f0f0',
    transition: 'border-color 140ms ease',
  }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}
  >
    {/* Avatar + pulse */}
    <div style={{ position: 'relative' }}>
      <Avatar name={user.full_name || user.email} />
      <span style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 12, height: 12, borderRadius: '50%',
        background: '#10b981', border: '2px solid #fff',
      }} />
    </div>

    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.full_name || 'Unknown'}
        </span>
        <RoleBadge role={user.role} />
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {user.email}
      </div>
      <div style={{ fontSize: 11, color: '#b0b8c4', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        Online since {fmtSince(user.joined_at)}
      </div>
    </div>
  </div>
);

// ─── App Section ──────────────────────────────────────────────────────────────

const AppSection: React.FC<{ app: AppName; users: PresenceUser[] }> = ({ app, users }) => {
  const cfg = APP_CONFIG[app];
  return (
    <div style={{
      background: '#fafafa', borderRadius: 14,
      border: '1.5px solid #f0f0f0', overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: users.length > 0 ? '1px solid #f0f0f0' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: users.length > 0 ? cfg.color : '#d1d5db',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{cfg.label}</span>
        </div>
        <span style={{
          minWidth: 22, height: 22, padding: '0 7px', borderRadius: 20,
          background: users.length > 0 ? cfg.bg : '#f3f4f6',
          border: `1px solid ${users.length > 0 ? cfg.border : '#e5e7eb'}`,
          fontSize: 11, fontWeight: 700,
          color: users.length > 0 ? cfg.color : '#9ca3af',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {users.length}
        </span>
      </div>

      {/* Cards */}
      {users.length > 0 ? (
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => <UserCard key={u.user_id} user={u} />)}
        </div>
      ) : (
        <div style={{ padding: '28px 18px', textAlign: 'center', color: '#d1d5db', fontSize: 12 }}>
          No one online
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const OnlineUsersPage: React.FC = () => {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [profiles, setProfiles]         = useState<ProfileRow[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [tick, setTick]                 = useState(0); // force relative-time rerender
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Presence subscription ────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL);
    channelRef.current = channel;

    const readState = () => {
      const state = channel.presenceState<PresenceUser>();
      console.log('[OnlineUsers] presenceState():', JSON.stringify(state));
      const flat: PresenceUser[] = [];
      Object.values(state).forEach(arr => arr.forEach(u => flat.push(u)));
      console.log('[OnlineUsers] flat users:', flat.length, flat.map(u => u.email));
      setPresentUsers(flat);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[OnlineUsers] presence sync event fired');
        readState();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[OnlineUsers] presence join — key:', key, 'presences:', newPresences);
        readState();
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[OnlineUsers] presence leave — key:', key, 'presences:', leftPresences);
        readState();
      })
      .subscribe((status) => {
        console.log('[OnlineUsers] channel status:', status);
        // After subscribe succeeds, read whatever state already exists on the server
        if (status === 'SUBSCRIBED') {
          console.log('[OnlineUsers] subscribed — reading initial state');
          readState();
        }
      });

    return () => {
      console.log('[OnlineUsers] cleanup — removing channel');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  // ── All profiles query ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProfiles(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, last_seen_at')
        .order('last_seen_at', { ascending: false, nullsFirst: false });
      if (!cancelled) {
        setProfiles((data ?? []) as ProfileRow[]);
        setLoadingProfiles(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Tick every 30 s so relative times update ─────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────────
  const byApp = {
    admin:    presentUsers.filter(u => u.app === 'admin'),
    team:     presentUsers.filter(u => u.app === 'team'),
    investor: presentUsers.filter(u => u.app === 'investor'),
  };
  const onlineIds = new Set(presentUsers.map(u => u.user_id));
  const total = presentUsers.length;

  // suppress unused tick warning
  void tick;

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes ouPulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          70%  { transform: scale(2.2); opacity: 0;   }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Online Users</h1>
          {total > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 11px', borderRadius: 20,
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
              fontSize: 12, fontWeight: 700, color: '#059669',
            }}>
              <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#10b981', opacity: 0.5, animation: 'ouPulse 1.6s ease-out infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              </span>
              {total} online now
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          Live view of everyone logged into Admin, Team, and Investor apps.
        </p>
      </div>

      {/* ── Summary chips ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {((['admin', 'team', 'investor'] as AppName[])).map(app => {
          const cfg = APP_CONFIG[app];
          const count = byApp[app].length;
          return (
            <div key={app} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 10,
              background: count > 0 ? cfg.bg : '#f9fafb',
              border: `1.5px solid ${count > 0 ? cfg.border : '#e5e7eb'}`,
              fontSize: 13, fontWeight: 600,
              color: count > 0 ? cfg.color : '#9ca3af',
            }}>
              <PulseDot on={count > 0} />
              {cfg.label}: {count}
            </div>
          );
        })}
      </div>

      {/* ── Three app columns ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
        <AppSection app="admin"    users={byApp.admin}    />
        <AppSection app="team"     users={byApp.team}     />
        <AppSection app="investor" users={byApp.investor} />
      </div>

      {/* ── All users — last seen ── */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', margin: '0 0 4px' }}>
            All Users — Last Seen
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
            Historical view of all profiles ordered by last activity.
          </p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 14,
          border: '1.5px solid #f0f0f0', overflow: 'hidden',
        }}>
          {loadingProfiles ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#4ba6ea', animation: 'ouPulse 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : profiles.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              No profiles found
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['User', 'Role', 'Status', 'Last Seen'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => {
                  const isOnline = onlineIds.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                        background: '#fff',
                        transition: 'background 100ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      {/* User */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ position: 'relative' }}>
                            <Avatar name={p.full_name || p.email || '?'} size={32} />
                            <span style={{
                              position: 'absolute', bottom: -1, right: -1,
                              width: 9, height: 9, borderRadius: '50%',
                              background: isOnline ? '#10b981' : '#d1d5db',
                              border: '1.5px solid #fff',
                            }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>
                              {p.full_name || <span style={{ color: '#d1d5db', fontStyle: 'italic', fontWeight: 400 }}>No name</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#9ca3af' }}>{p.email ?? ''}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '12px 16px' }}>
                        <RoleBadge role={p.role ?? ''} />
                      </td>

                      {/* Online status */}
                      <td style={{ padding: '12px 16px' }}>
                        {isOnline ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669' }}>
                            <PulseDot on />
                            Online
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>Offline</span>
                        )}
                      </td>

                      {/* Last seen */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          title={absTime(p.last_seen_at)}
                          style={{
                            fontSize: 13, color: p.last_seen_at ? '#4b5563' : '#d1d5db',
                            cursor: p.last_seen_at ? 'help' : 'default',
                          }}
                        >
                          {relativeTime(p.last_seen_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnlineUsersPage;
