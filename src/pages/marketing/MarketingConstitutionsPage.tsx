import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import type { SmBot } from '../../types/marketing';
import { BOT_DEFS } from '../../types/marketing';

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>;
        if (p.startsWith('`') && p.endsWith('`')) return (
          <code key={i} style={{ background: 'rgba(0,0,0,0.07)', borderRadius: 4, padding: '1px 5px', fontSize: '0.9em', fontFamily: 'monospace' }}>
            {p.slice(1, -1)}
          </code>
        );
        return p;
      })}
    </span>
  );
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimEnd().startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(
        <pre key={i} style={{ background: '#f6f8fa', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', overflowX: 'auto', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          {lang && <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lang}</div>}
          <code style={{ fontFamily: 'monospace', color: '#24292f' }}>{codeLines.join('\n')}</code>
        </pre>
      );
      i++; continue;
    }

    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes = [24, 19, 16];
      const margins = [28, 22, 18];
      elements.push(
        <div key={i} style={{ fontSize: sizes[level - 1], fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', marginTop: i === 0 ? 0 : margins[level - 1], marginBottom: 10, borderBottom: level === 1 ? '1px solid #f0f0f0' : 'none', paddingBottom: level === 1 ? 10 : 0 }}>
          {renderInline(hMatch[2], i)}
        </div>
      );
      i++; continue;
    }

    if (/^---+$/.test(line)) {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #f0f0f0', margin: '20px 0' }} />);
      i++; continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} style={{ borderLeft: '3px solid #4ba6ea', margin: '12px 0', padding: '8px 16px', background: 'rgba(75,166,234,0.04)', borderRadius: '0 8px 8px 0', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
          {renderInline(line.slice(2), i)}
        </blockquote>
      );
      i++; continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trimEnd())) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      elements.push(
        <ul key={i} style={{ margin: '8px 0 14px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((item, j) => <li key={j} style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{renderInline(item, j)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trimEnd())) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      elements.push(
        <ol key={i} style={{ margin: '8px 0 14px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((item, j) => <li key={j} style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{renderInline(item, j)}</li>)}
        </ol>
      );
      continue;
    }

    if (!line) {
      if (elements.length > 0) elements.push(<div key={`sp-${i}`} style={{ height: 8 }} />);
      i++; continue;
    }

    elements.push(<p key={i} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, marginBottom: 0 }}>{renderInline(line, i)}</p>);
    i++;
  }
  return <div style={{ fontFamily: 'inherit' }}>{elements}</div>;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size, color }: { url: string | null; name: string; size: number; color: string }) {
  const [err, setErr] = useState(false);
  const initials = name
    .split(/[\s_-]/).filter(Boolean)
    .slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  if (url && !err) {
    return (
      <img
        src={url} alt={name} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${color}22` }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}22`, border: `2px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color,
    }}>
      {initials || '?'}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: t.type === 'error' ? '#ef4444' : '#0f1117',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'csSlide 200ms ease',
    }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8" /></svg>}
      {t.type === 'error' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>}
      {t.message}
    </div>,
    document.body
  );

// ─── Add Bot Modal ────────────────────────────────────────────────────────────

const AddBotModal: React.FC<{
  onClose: () => void;
  onAdded: (bot: SmBot) => void;
}> = ({ onClose, onAdded }) => {
  const [botName, setBotName]         = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [constitution, setConstitution] = useState('');
  const [avatarUrl, setAvatarUrl]     = useState('');
  const [isActive, setIsActive]       = useState(true);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botName.trim() || !displayName.trim()) { setFormError('bot_name and display_name are required.'); return; }
    setSaving(true);
    setFormError('');
    const { data, error } = await socialFrom('sm_bots')
      .insert({
        bot_name: botName.trim(),
        display_name: displayName.trim(),
        description: description.trim() || null,
        constitution: constitution.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        is_active: isActive,
      })
      .select()
      .single();
    if (error) { setFormError(error.message); setSaving(false); return; }
    onAdded(data as SmBot);
  };

  const inputStyle: React.CSSProperties = {
    height: 38, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 9,
    fontSize: 13.5, fontFamily: 'inherit', outline: 'none', color: '#0f1117',
    width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
  const labelText: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#6b7280' };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', animation: 'csSlideUp 180ms ease', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117' }}>Add Bot</div>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{formError}</div>}
          <label style={labelStyle}>
            <span style={labelText}>Bot Name <span style={{ color: '#ef4444' }}>*</span></span>
            <input value={botName} onChange={e => setBotName(e.target.value)} placeholder="e.g. cmo, brand_guardian" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Display Name <span style={{ color: '#ef4444' }}>*</span></span>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. CMO" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Bio (short description)</span>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="One-line role summary" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Avatar URL</span>
            <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Constitution (Markdown)</span>
            <textarea
              value={constitution} onChange={e => setConstitution(e.target.value)}
              placeholder="# Constitution&#10;&#10;Write the bot's rulebook here…"
              rows={5}
              style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical', color: '#0f1117', width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: 13.5, color: '#374151' }}>Active</span>
          </label>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ height: 36, padding: '0 16px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ height: 36, padding: '0 18px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding…' : 'Add Bot'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

// ─── Metadata row ─────────────────────────────────────────────────────────────

const MetaRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, fontSize: 13, borderBottom: '1px solid #f5f5f5', paddingBottom: 10, marginBottom: 10 }}>
    <span style={{ width: 130, flexShrink: 0, color: '#9ca3af', fontWeight: 500 }}>{label}</span>
    <span style={{ color: '#374151', wordBreak: 'break-word' }}>{children}</span>
  </div>
);

// ─── Draft key ────────────────────────────────────────────────────────────────

const DRAFT_KEY = (id: string) => `bot_draft_${id}`;
const AUTOSAVE_INTERVAL = 30000;

// ─── Main page ────────────────────────────────────────────────────────────────

const MarketingConstitutionsPage: React.FC = () => {
  const [bots, setBots]               = useState<SmBot[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [editMode, setEditMode]       = useState(false);
  const [editDisplayName, setEditDisplayName]   = useState('');
  const [editDescription, setEditDescription]   = useState('');
  const [editAvatarUrl, setEditAvatarUrl]       = useState('');
  const [editConstitution, setEditConstitution] = useState('');
  const [editIsActive, setEditIsActive]         = useState(true);
  const [editNotes, setEditNotes]               = useState('');
  const [editUpdatedBy, setEditUpdatedBy]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');
  const [showAdd, setShowAdd]         = useState(false);
  const [toasts, setToasts]           = useState<ToastData[]>([]);
  const toastCounter                  = useRef(0);
  const autoSaveTimer                 = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useCallback((message: string, type: ToastData['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const selectedBot = bots.find(b => b.id === selectedId) ?? null;

  // ── Fetch all bots ─────────────────────────────────────────────────────────

  const loadBots = useCallback(async (keepSelected?: string) => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await socialFrom('sm_bots')
      .select('id, bot_name, display_name, description, constitution, avatar_url, is_active, updated_at, updated_by, notes, created_at')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[Bots] fetch error:', error);
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    const rows = (data as SmBot[]) ?? [];
    setBots(rows);
    setSelectedId(keepSelected ?? (rows.length > 0 ? rows[0].id : null));
    setLoading(false);
  }, []);

  useEffect(() => { loadBots(); }, [loadBots]);

  // ── Auto-save constitution draft ───────────────────────────────────────────

  useEffect(() => {
    if (!editMode || !selectedBot) return;
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(() => {
      localStorage.setItem(DRAFT_KEY(selectedBot.id), editConstitution);
      addToast('Draft auto-saved', 'info');
    }, AUTOSAVE_INTERVAL);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [editMode, editConstitution, selectedBot, addToast]);

  // ── Enter edit mode ────────────────────────────────────────────────────────

  const handleEdit = () => {
    if (!selectedBot) return;
    const draft = localStorage.getItem(DRAFT_KEY(selectedBot.id));
    setEditDisplayName(selectedBot.display_name);
    setEditDescription(selectedBot.description ?? '');
    setEditAvatarUrl(selectedBot.avatar_url ?? '');
    setEditConstitution(draft ?? (selectedBot.constitution ?? ''));
    setEditIsActive(selectedBot.is_active);
    setEditNotes(selectedBot.notes ?? '');
    setEditUpdatedBy(selectedBot.updated_by ?? '');
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (selectedBot) localStorage.removeItem(DRAFT_KEY(selectedBot.id));
    setEditMode(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedBot || saving) return;
    setSaving(true);
    const { error } = await socialFrom('sm_bots')
      .update({
        display_name: editDisplayName.trim() || selectedBot.display_name,
        description: editDescription.trim() || null,
        avatar_url: editAvatarUrl.trim() || null,
        constitution: editConstitution.trim() || null,
        is_active: editIsActive,
        notes: editNotes.trim() || null,
        updated_by: editUpdatedBy.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedBot.id);

    setSaving(false);
    if (error) {
      console.error('[Bots] save error:', error);
      addToast(error.message, 'error');
      return;
    }

    localStorage.removeItem(DRAFT_KEY(selectedBot.id));
    setEditMode(false);
    addToast('Saved.', 'success');
    await loadBots(selectedBot.id);
  };

  // ── Add bot ───────────────────────────────────────────────────────────────

  const handleAdded = async (bot: SmBot) => {
    setShowAdd(false);
    addToast(`"${bot.display_name}" added.`, 'success');
    await loadBots(bot.id);
  };

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = search
    ? bots.filter(b => {
        const q = search.toLowerCase();
        return (
          b.display_name.toLowerCase().includes(q) ||
          b.bot_name.toLowerCase().includes(q) ||
          (b.description ?? '').toLowerCase().includes(q) ||
          (b.constitution ?? '').toLowerCase().includes(q)
        );
      })
    : bots;

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', background: '#fff', overflow: 'hidden' }}>

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div style={{ width: 288, minWidth: 288, height: '100%', borderRight: '1px solid #ebebeb', background: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #ebebeb', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px' }}>Bots</span>
            <button
              onClick={() => setShowAdd(true)}
              style={{ height: 30, padding: '0 11px', borderRadius: 8, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
              Add Bot
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search bots…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 34, paddingLeft: 32, paddingRight: 10, fontSize: 13, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: '#0f1117', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 60, borderRadius: 10, background: '#ebebeb', animation: 'csPulse 1.5s ease-in-out infinite' }} />)}
            </div>
          ) : fetchError ? (
            <div style={{ padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 6 }}>Failed to load</div>
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 12 }}>{fetchError}</div>
              <button onClick={() => loadBots()} style={{ fontSize: 12.5, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
              {search ? 'No results' : 'No bots found'}
            </div>
          ) : (
            filtered.map(bot => {
              const def = BOT_DEFS.find(d => d.bot_name === bot.bot_name);
              const color = def?.color ?? '#9ca3af';
              const isSelected = bot.id === selectedId;
              return (
                <button
                  key={bot.id}
                  onClick={() => { setSelectedId(bot.id); setEditMode(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: isSelected ? 'rgba(75,166,234,0.06)' : 'none',
                    border: 'none', borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                    cursor: 'pointer', fontFamily: 'inherit', borderBottom: '1px solid #f5f5f5',
                    transition: 'background 120ms ease',
                    opacity: bot.is_active ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', gap: 11,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#f0f4f8'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <Avatar url={bot.avatar_url} name={bot.display_name} size={36} color={color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{bot.display_name}</span>
                      {!bot.is_active && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', borderRadius: 20, padding: '1px 6px', flexShrink: 0 }}>inactive</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10.5, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>{bot.bot_name}</span>
                      {bot.updated_at && (
                        <>
                          <span style={{ color: '#e5e7eb', fontSize: 10 }}>·</span>
                          <span style={{ fontSize: 10.5, color: '#9ca3af' }}>{new Date(bot.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {!selectedBot ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, color: '#9ca3af' }}>Select a bot</span>
          </div>
        ) : (() => {
          const color = BOT_DEFS.find(d => d.bot_name === selectedBot.bot_name)?.color ?? '#9ca3af';
          return (
            <>
              {/* Header */}
              <div style={{ padding: '16px 28px', borderBottom: '1px solid #ebebeb', flexShrink: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <Avatar url={selectedBot.avatar_url} name={selectedBot.display_name} size={46} color={color} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>{selectedBot.display_name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>{selectedBot.bot_name}</span>
                      {!selectedBot.is_active && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>inactive</span>}
                    </div>
                    {selectedBot.description && (
                      <div style={{ fontSize: 12.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedBot.description}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {!editMode && (
                    <button onClick={handleEdit} style={{ height: 34, padding: '0 16px', borderRadius: 9, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 140ms ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="white" strokeWidth="1.8" strokeLinecap="round" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Edit
                    </button>
                  )}
                  {editMode && (
                    <>
                      <button onClick={handleCancelEdit} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={handleSave} disabled={saving} style={{ height: 34, padding: '0 16px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'csSpin 0.7s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeDasharray="28 56" /></svg>}
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Body */}
              {editMode ? (
                /* ── Split editor ── */
                <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                  {/* Left: fields + textarea */}
                  <div style={{ flex: 1, borderRight: '1px solid #ebebeb', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                    {/* Top fields */}
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f0f0', background: '#f8fafc', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160, flex: 1 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Display Name</span>
                        <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} style={{ height: 32, padding: '0 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0f1117' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, flex: 1 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bio</span>
                        <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="One-line role summary" style={{ height: 32, padding: '0 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0f1117' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 2 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avatar URL</span>
                        <input value={editAvatarUrl} onChange={e => setEditAvatarUrl(e.target.value)} placeholder="https://…" style={{ height: 32, padding: '0 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0f1117' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120, flex: 1 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Updated By</span>
                        <input value={editUpdatedBy} onChange={e => setEditUpdatedBy(e.target.value)} placeholder="admin" style={{ height: 32, padding: '0 9px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0f1117' }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 1 }}>
                        <input type="checkbox" checked={editIsActive} onChange={e => setEditIsActive(e.target.checked)} style={{ width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, color: '#374151' }}>Active</span>
                      </label>
                    </div>

                    {/* Constitution textarea */}
                    <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#f8fafc' }}>Constitution (Markdown)</div>
                    <textarea
                      value={editConstitution}
                      onChange={e => setEditConstitution(e.target.value)}
                      placeholder="# Bot Constitution&#10;&#10;Write the bot's full rulebook here…"
                      style={{ flex: 1, padding: '16px 20px', border: 'none', outline: 'none', fontFamily: 'monospace', fontSize: 13.5, lineHeight: 1.65, resize: 'none', color: '#24292f', background: '#fff' }}
                    />

                    {/* Notes */}
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 16px', background: '#f8fafc' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Notes</div>
                      <textarea
                        value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                        placeholder="Internal notes (optional)…"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', color: '#0f1117', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ padding: '5px 20px', borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#9ca3af', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Auto-saves every 30 s</span>
                      <span>{editConstitution.length} chars</span>
                    </div>
                  </div>

                  {/* Right: live preview */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#f8fafc' }}>Live Preview</div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
                      {editConstitution.trim() ? <MarkdownView content={editConstitution} /> : <div style={{ color: '#c0c4cc', fontSize: 14, fontStyle: 'italic' }}>Preview will appear here…</div>}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px 48px' }}>
                  {!selectedBot.constitution?.trim() ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color }}>
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2v6h6M12 18v-4M10 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117', marginBottom: 6 }}>No constitution yet</div>
                        <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 340 }}>Click Edit to write the bot's rulebook in Markdown.</div>
                      </div>
                      <button onClick={handleEdit} style={{ height: 38, padding: '0 20px', borderRadius: 9, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                    </div>
                  ) : (
                    <>
                      <MarkdownView content={selectedBot.constitution} />

                      {/* Metadata */}
                      <div style={{ marginTop: 40, borderTop: '1px solid #f0f0f0', paddingTop: 28 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 18 }}>Metadata</div>
                        <MetaRow label="Bot name">{selectedBot.bot_name}</MetaRow>
                        <MetaRow label="Status">
                          <span style={{ fontSize: 12, fontWeight: 700, color: selectedBot.is_active ? '#10b981' : '#9ca3af', background: selectedBot.is_active ? 'rgba(16,185,129,0.10)' : '#f3f4f6', borderRadius: 20, padding: '2px 9px' }}>
                            {selectedBot.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </MetaRow>
                        <MetaRow label="Created">{fmtDate(selectedBot.created_at)}</MetaRow>
                        <MetaRow label="Last updated">{fmtDate(selectedBot.updated_at)}</MetaRow>
                        <MetaRow label="Updated by">{selectedBot.updated_by ?? '—'}</MetaRow>
                        {selectedBot.notes && <MetaRow label="Notes">{selectedBot.notes}</MetaRow>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {showAdd && <AddBotModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />}
      {toasts.map(t => <Toast key={t.id} t={t} />)}

      <style>{`
        @keyframes csPulse  { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes csSlide  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes csSlideUp{ from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes csSpin   { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
};

export default MarketingConstitutionsPage;
