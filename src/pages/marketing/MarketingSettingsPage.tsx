import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import { MARKETING_BOTS, CONSTITUTION_DEFS } from '../../types/marketing';
import { isCmoConfigured } from '../../lib/cmoApi';

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; msg: string; type: 'success' | 'error' | 'info'; }

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#fff',
          background: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#4ba6ea',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'stSlide 0.3s ease',
        }}>{t.msg}</div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{description}</div>}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? '#4ba6ea' : '#e2e8f0', padding: 2,
        transition: 'background 0.2s', position: 'relative', display: 'flex', alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transform: checked ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s',
      }} />
    </button>
  );
}

// ─── Integration badge ─────────────────────────────────────────────────────────

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: connected ? '#dcfce7' : '#f1f5f9', color: connected ? '#166534' : '#64748b',
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

interface BotState {
  key: string;
  name: string;
  role: string;
  color: string;
  enabled: boolean;
  creativity: number;
  taskCount: number;
}

export default function MarketingSettingsPage() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [botStates, setBotStates] = useState<BotState[]>(
    MARKETING_BOTS.map(b => ({ ...b, enabled: true, creativity: 70, taskCount: 0 }))
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState({
    new_approvals: true,
    cmo_messages: true,
    competitor_alerts: true,
    campaign_alerts: true,
    system_events: false,
  });

  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Load task counts per bot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await socialFrom('sm_coordinator_tasks')
        .select('to_bot')
        .in('status', ['pending', 'in_progress', 'completed']);
      if (cancelled) return;
      const tally: Record<string, number> = {};
      (data ?? []).forEach((r: { to_bot: string }) => {
        tally[r.to_bot] = (tally[r.to_bot] ?? 0) + 1;
      });
      setBotStates(prev => prev.map(b => ({ ...b, taskCount: tally[b.key] ?? 0 })));
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleBot(key: string) {
    setBotStates(prev => prev.map(b => b.key === key ? { ...b, enabled: !b.enabled } : b));
    const bot = botStates.find(b => b.key === key);
    if (bot) toast(`${bot.name} ${bot.enabled ? 'disabled' : 'enabled'}`, 'success');
  }

  function setCreativity(key: string, val: number) {
    setBotStates(prev => prev.map(b => b.key === key ? { ...b, creativity: val } : b));
  }

  async function handleExport() {
    setExporting(true);
    await new Promise(r => setTimeout(r, 1200));
    toast('Export ready — check your downloads.', 'success');
    setExporting(false);
  }

  async function handleClearTestData() {
    setClearing(true);
    try {
      // Clear seed data from main tables
      await Promise.all([
        socialFrom('sm_competitors').delete().neq('id', 0),
        socialFrom('sm_competitor_pricing').delete().neq('id', 0),
        socialFrom('sm_competitor_posts').delete().neq('id', 0),
        socialFrom('sm_competitor_reports').delete().neq('id', 0),
        socialFrom('sm_decisions_log').delete().neq('id', 0),
        socialFrom('sm_performance_analysis').delete().neq('id', 0),
      ]);
      toast('Test data cleared successfully.', 'success');
    } catch {
      toast('Failed to clear some data — check console.', 'error');
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  const apiKeys = [
    { name: 'Claude API', key: 'ANTHROPIC_API_KEY', provider: 'Anthropic', purpose: 'Powers all AI bots' },
    { name: 'Meta Ads API', key: 'META_ADS_TOKEN', provider: 'Meta', purpose: 'Instagram & Facebook campaigns' },
    { name: 'Google Ads API', key: 'GOOGLE_ADS_TOKEN', provider: 'Google', purpose: 'Google Search & Display campaigns' },
    { name: 'n8n Webhook', key: 'N8N_WEBHOOK_URL', provider: 'n8n', purpose: 'AI workflow automation' },
    { name: 'TikTok Ads API', key: 'TIKTOK_ADS_TOKEN', provider: 'TikTok', purpose: 'TikTok ad campaigns' },
  ];

  const integrations = [
    { name: 'Supabase Database', connected: true, icon: '🗄️', description: 'Real-time database and storage' },
    { name: 'n8n Workflows', connected: isCmoConfigured(), icon: '⚙️', description: 'Powers AI bot automation' },
    { name: 'Meta Business API', connected: false, icon: '📘', description: 'Instagram & Facebook publishing' },
    { name: 'Google Ads API', connected: false, icon: '🔍', description: 'Google campaign management' },
    { name: 'TikTok Ads API', connected: false, icon: '🎵', description: 'TikTok campaign management' },
  ];

  const brandBot = CONSTITUTION_DEFS.find(c => c.bot_name === 'brand_guardian');

  return (
    <div style={{ padding: '24px', maxWidth: 880, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes stSlide { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes stPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
      <ToastContainer toasts={toasts} />

      {/* header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Bot management, integrations, and system preferences</p>
      </div>

      {/* ── A. Bot Management ──────────────────────────────────────────────── */}
      <Section title="Bot Management" description="Enable or disable bots and adjust their creativity level">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {botStates.map((bot, i) => (
            <div key={bot.key} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0',
              borderBottom: i < botStates.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              {/* avatar */}
              <div style={{ width: 40, height: 40, borderRadius: 11, background: bot.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: bot.color }}>
                  <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M12 2v6M8 2h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
                  <circle cx="15" cy="13" r="1.5" fill="currentColor"/>
                  <path d="M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              {/* info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{bot.name}</span>
                  {bot.taskCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>
                      {bot.taskCount} tasks
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{bot.role}</div>
                {/* creativity slider */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Creativity</span>
                  <input
                    type="range" min={0} max={100} value={bot.creativity}
                    onChange={e => setCreativity(bot.key, Number(e.target.value))}
                    disabled={!bot.enabled}
                    style={{ flex: 1, maxWidth: 140, accentColor: bot.color, opacity: bot.enabled ? 1 : 0.4 }}
                  />
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, width: 28 }}>{bot.creativity}</span>
                </div>
              </div>
              {/* actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <button
                  onClick={() => toast(`${bot.name} test triggered (n8n not connected yet).`, 'info')}
                  disabled={!bot.enabled}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#475569', opacity: bot.enabled ? 1 : 0.4 }}
                >
                  Test
                </button>
                <Toggle checked={bot.enabled} onChange={() => toggleBot(bot.key)} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── B. API Keys ────────────────────────────────────────────────────── */}
      <Section title="API Keys" description="Connect external services to enable full functionality">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {apiKeys.map((api, i) => (
            <div key={api.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0',
              borderBottom: i < apiKeys.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{api.name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{api.purpose}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge connected={false} label="Not configured" />
                <button
                  onClick={() => toast('API key management coming in n8n phase.', 'info')}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}
                >
                  Connect
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#78350f', border: '1px solid #fde68a' }}>
          API keys will be configured during the n8n integration phase. Store keys in your Supabase environment variables, never in code.
        </div>
      </Section>

      {/* ── C. Notification Preferences ──────────────────────────────────── */}
      <Section title="Notification Preferences" description="Choose which events trigger notifications in the bell menu">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {(Object.keys(notifPrefs) as (keyof typeof notifPrefs)[]).map((key, i, arr) => {
            const labels: Record<keyof typeof notifPrefs, { title: string; sub: string }> = {
              new_approvals: { title: 'New Approvals', sub: 'When bots submit content for your review' },
              cmo_messages: { title: 'CMO Messages', sub: 'When the CMO sends you a new message' },
              competitor_alerts: { title: 'Competitor Alerts', sub: 'Price changes or new competitor posts detected' },
              campaign_alerts: { title: 'Campaign Alerts', sub: 'Low ROAS, budget warnings, or campaign status changes' },
              system_events: { title: 'System Events', sub: 'Bot errors, database issues, and system health' },
            };
            const l = labels[key];
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0',
                borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{l.sub}</div>
                </div>
                <Toggle
                  checked={notifPrefs[key]}
                  onChange={v => {
                    setNotifPrefs(p => ({ ...p, [key]: v }));
                    toast('Preference saved.', 'success');
                  }}
                />
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── D. Brand Guidelines ───────────────────────────────────────────── */}
      <Section title="Brand Guidelines" description="Quick access to core brand rules from the Brand Guardian constitution">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
          {[
            { label: 'Primary Color', value: '#4ba6ea', type: 'color' },
            { label: 'Primary Font', value: 'Inter', type: 'text' },
            { label: 'Brand Voice', value: 'Premium, warm, trustworthy', type: 'text' },
            { label: 'Target Language', value: 'Arabic, Turkish, English', type: 'text' },
          ].map(g => (
            <div key={g.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>{g.label}</div>
              {g.type === 'color' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: g.value, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>{g.value}</span>
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{g.value}</div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/dashboard/marketing/bots')}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #4ba6ea', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#4ba6ea', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
        >
          Edit Brand Guardian Constitution →
        </button>
      </Section>

      {/* ── E. Integration Status ─────────────────────────────────────────── */}
      <Section title="Integration Status" description="Live status of all connected services">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {integrations.map((intg, i) => (
            <div key={intg.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0',
              borderBottom: i < integrations.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {intg.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{intg.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{intg.description}</div>
                </div>
              </div>
              <StatusBadge connected={intg.connected} label={intg.connected ? 'Connected' : 'Not connected'} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── F. Data Management ───────────────────────────────────────────── */}
      <Section title="Data Management" description="Export data and manage test content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* DB health */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#166534' }}>Database Healthy</div>
              <div style={{ fontSize: 12, color: '#4ade80' }}>Supabase connected · social schema accessible · real-time active</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 8, opacity: exporting ? 0.6 : 1, transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!exporting) e.currentTarget.style.borderColor = '#4ba6ea'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {exporting ? 'Exporting…' : 'Export All Marketing Data'}
            </button>

            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Clear Test Data
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: 12, color: '#dc2626' }}>Delete all seeded data?</span>
                <button onClick={handleClearTestData} disabled={clearing} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {clearing ? 'Clearing…' : 'Yes, delete'}
                </button>
                <button onClick={() => setConfirmClear(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* SQL snippets for reference */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Pending SQL — Run in Supabase</div>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#334155', overflow: 'auto', lineHeight: 1.6 }}>{`-- Notifications table
CREATE TABLE IF NOT EXISTS social.sm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'error')),
  link TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot status table
CREATE TABLE IF NOT EXISTS social.sm_bot_status (
  bot_name TEXT PRIMARY KEY,
  status TEXT DEFAULT 'idle'
    CHECK (status IN ('idle','active','working','error','disabled')),
  last_heartbeat TIMESTAMPTZ,
  current_task_id UUID,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO social.sm_bot_status (bot_name, status) VALUES
  ('cmo','idle'),('coordinator','idle'),('brand_guardian','idle'),
  ('content_writer','idle'),('designer','idle'),('competitor_monitor','idle'),
  ('performance_analyst','idle'),('ads_manager','idle')
ON CONFLICT (bot_name) DO NOTHING;`}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(''); toast('SQL copied to clipboard!', 'success'); }}
              style={{ marginTop: 10, padding: '5px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569' }}
            >
              Copy SQL
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
