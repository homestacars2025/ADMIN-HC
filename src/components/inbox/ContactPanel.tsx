import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  type ChatConversation,
  type ConversationStatus,
  channelLabel,
  contactLabel,
  initials,
  relativeShort,
} from '../../lib/inbox';

export interface AdminOption { id: string; full_name: string | null; }

const LABEL: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 5,
};

const CONTROL: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', fontSize: 12.5,
  border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
  fontFamily: 'inherit', color: '#0f1117', background: '#fff', boxSizing: 'border-box',
};

const STATUSES: ConversationStatus[] = ['open', 'pending', 'closed'];

const ContactPanel: React.FC<{
  conversation: ChatConversation;
  admins: AdminOption[];
  onPatch: (id: string, patch: Partial<ChatConversation>) => void;
  onClose: () => void;
}> = ({ conversation, admins, onPatch, onClose }) => {
  const [note, setNote]       = useState(conversation.internal_notes ?? '');
  const [savingNote, setSaving] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Reset the editor when switching conversations
  useEffect(() => { setNote(conversation.internal_notes ?? ''); setError(null); }, [conversation.id, conversation.internal_notes]);

  const noteDirty = (conversation.internal_notes ?? '') !== note;

  const update = async (patch: Partial<ChatConversation>, dbPatch: Record<string, unknown>) => {
    setError(null);
    onPatch(conversation.id, patch); // optimistic; realtime confirms
    const { error: err } = await supabase
      .from('chat_conversations')
      .update({ ...dbPatch, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
    if (err) setError(err.message);
  };

  const saveNote = async () => {
    const trimmed = note.trim();
    setSaving(true);
    await update({ internal_notes: trimmed || null }, { internal_notes: trimmed || null });
    setSaving(false);
  };

  const name = contactLabel(conversation);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Contact</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact details"
          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
        {/* Identity */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#eef2f6', color: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, margin: '0 auto 10px', overflow: 'hidden' }}>
            {conversation.contact?.avatar_url
              ? <img src={conversation.contact.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials(name)}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f1117', wordBreak: 'break-word' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{conversation.contact?.identifier ?? '—'}</div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <div style={LABEL}>Channel</div>
            <div style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{channelLabel(conversation.channel)}</div>
          </div>
          <div>
            <div style={LABEL}>Last activity</div>
            <div style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>
              {conversation.last_message_at ? relativeShort(conversation.last_message_at) : '—'}
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 16 }}>
          <div style={LABEL}>Status</div>
          <select
            value={conversation.status}
            onChange={e => void update({ status: e.target.value as ConversationStatus }, { status: e.target.value })}
            style={{ ...CONTROL, cursor: 'pointer' }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        {/* Assignment */}
        <div style={{ marginBottom: 16 }}>
          <div style={LABEL}>Assigned to</div>
          <select
            value={conversation.assigned_to_profile_id ?? ''}
            onChange={e => void update(
              { assigned_to_profile_id: e.target.value || null },
              { assigned_to_profile_id: e.target.value || null },
            )}
            style={{ ...CONTROL, cursor: 'pointer' }}
          >
            <option value="">Unassigned</option>
            {admins.map(a => <option key={a.id} value={a.id}>{a.full_name ?? a.id}</option>)}
          </select>
        </div>

        {/* Internal notes */}
        <div style={{ marginBottom: 16 }}>
          <div style={LABEL}>Internal notes</div>
          <textarea
            rows={5}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Only visible to admins…"
            style={{ ...CONTROL, height: 'auto', padding: '9px 10px', resize: 'vertical', lineHeight: 1.5 }}
            onFocus={e => { e.target.style.borderColor = '#4ba6ea'; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={!noteDirty || savingNote}
            style={{
              marginTop: 8, width: '100%', height: 36, borderRadius: 9, border: 'none',
              background: !noteDirty || savingNote ? '#cbd5e1' : '#4ba6ea', color: '#fff',
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: !noteDirty || savingNote ? 'not-allowed' : 'pointer',
            }}
          >
            {savingNote ? 'Saving…' : noteDirty ? 'Save note' : 'Saved'}
          </button>
        </div>

        {/* Archive */}
        <button
          type="button"
          onClick={() => void update(
            { archived_at: conversation.archived_at ? null : new Date().toISOString() },
            { archived_at: conversation.archived_at ? null : new Date().toISOString() },
          )}
          style={{ width: '100%', height: 36, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#374151', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {conversation.archived_at ? 'Unarchive conversation' : 'Archive conversation'}
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: '9px 11px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactPanel;
