import React from 'react';
import {
  type ChatMessage,
  type MessageStatus,
  formatBytes,
  messageTime,
  statusHint,
} from '../../lib/inbox';

// ─── Delivery ticks ───────────────────────────────────────────────────────────
// queued → clock, sent → single check, delivered → double check,
// read → double check in brand blue, failed → warning.

const StatusTick: React.FC<{ status: MessageStatus | null }> = ({ status }) => {
  const title = statusHint(status);

  if (status === 'queued' || status === null) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-label={title}>
        <title>{title || 'Queued'}</title>
        <circle cx="12" cy="12" r="8.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" />
        <path d="M12 7.5V12l3 1.8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'failed') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-label={title}>
        <title>Failed</title>
        <circle cx="12" cy="12" r="8.5" stroke="#fecaca" strokeWidth="1.8" />
        <path d="M12 7.5v5M12 16h.01" stroke="#fecaca" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const color = status === 'read' ? '#7dd3fc' : 'rgba(255,255,255,0.7)';
  return (
    <svg width="15" height="13" viewBox="0 0 20 14" fill="none" aria-label={title}>
      <title>{title}</title>
      <path d="M1 7.5l3.6 3.6L11.5 4" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      {status !== 'sent' && (
        <path d="M7.6 11.1L14.5 4" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
};

// ─── Media renderers ──────────────────────────────────────────────────────────

const DocIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

const MediaBody: React.FC<{ message: ChatMessage; outbound: boolean; onOpenImage: (url: string) => void }> = ({
  message, outbound, onOpenImage,
}) => {
  const { content_type, media_url, media_filename, media_size_bytes } = message;
  const muted = outbound ? 'rgba(255,255,255,0.75)' : '#6b7280';

  if (content_type === 'location') {
    const { location_latitude: lat, location_longitude: lng, location_name } = message;
    const maps = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
    return (
      <a
        href={maps ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => { if (!maps) e.preventDefault(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none',
          color: outbound ? '#fff' : '#0f1117', padding: '2px 0',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
            {location_name || 'Shared location'}
          </span>
          {lat != null && lng != null && (
            <span style={{ display: 'block', fontSize: 11.5, color: muted }}>
              {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
            </span>
          )}
        </span>
      </a>
    );
  }

  if (!media_url) return null;

  if (content_type === 'image' || content_type === 'sticker') {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(media_url)}
        style={{ display: 'block', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden', maxWidth: '100%' }}
      >
        <img
          src={media_url}
          alt={media_filename || 'Photo'}
          style={{ display: 'block', maxWidth: '100%', width: 'auto', maxHeight: 280, borderRadius: 10, objectFit: 'cover' }}
        />
      </button>
    );
  }

  if (content_type === 'video') {
    return (
      <video
        src={media_url}
        controls
        preload="metadata"
        poster={message.media_thumbnail_url ?? undefined}
        style={{ display: 'block', maxWidth: '100%', maxHeight: 280, borderRadius: 10, background: '#000' }}
      />
    );
  }

  if (content_type === 'audio') {
    return <audio src={media_url} controls preload="metadata" style={{ display: 'block', maxWidth: '100%', minWidth: 210 }} />;
  }

  // document / anything else with a file attached
  return (
    <a
      href={media_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none',
        color: outbound ? '#fff' : '#0f1117',
        background: outbound ? 'rgba(255,255,255,0.14)' : '#f3f4f6',
        borderRadius: 9, padding: '9px 11px', minWidth: 190,
      }}
    >
      <DocIcon />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {media_filename || 'Document'}
        </span>
        {formatBytes(media_size_bytes) && (
          <span style={{ display: 'block', fontSize: 11, color: muted }}>{formatBytes(media_size_bytes)}</span>
        )}
      </span>
    </a>
  );
};

// ─── Bubble ───────────────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  message: ChatMessage;
  uploading?: boolean;
  onOpenImage: (url: string) => void;
}> = ({ message, uploading, onOpenImage }) => {
  const outbound = message.direction === 'outbound';
  const failed   = message.status === 'failed';
  const hasMedia = message.content_type !== 'text';

  return (
    <div style={{ display: 'flex', justifyContent: outbound ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
      <div
        style={{
          maxWidth: 'min(78%, 460px)', minWidth: 78,
          borderRadius: 14,
          borderBottomRightRadius: outbound ? 4 : 14,
          borderBottomLeftRadius:  outbound ? 14 : 4,
          background: outbound ? '#4ba6ea' : '#fff',
          border: outbound ? 'none' : '1px solid #e9ecef',
          color: outbound ? '#fff' : '#0f1117',
          padding: hasMedia ? 5 : '8px 11px',
          boxShadow: '0 1px 2px rgba(15,17,23,0.06)',
          opacity: uploading ? 0.72 : 1,
          position: 'relative',
        }}
      >
        {hasMedia && (
          <div style={{ marginBottom: message.text_content ? 6 : 0 }}>
            <MediaBody message={message} outbound={outbound} onOpenImage={onOpenImage} />
          </div>
        )}

        {message.text_content && (
          <div style={{
            fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            padding: hasMedia ? '0 6px' : 0,
          }}>
            {message.text_content}
          </div>
        )}

        {/* Time + tick */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
          marginTop: 3, padding: hasMedia ? '0 6px 3px' : 0,
        }}>
          {uploading && (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Uploading…</span>
          )}
          <span style={{ fontSize: 10.5, color: outbound ? 'rgba(255,255,255,0.75)' : '#9ca3af', whiteSpace: 'nowrap' }}>
            {messageTime(message.created_at)}
          </span>
          {outbound && !uploading && <StatusTick status={message.status} />}
        </div>

        {failed && message.error_message && (
          <div style={{ fontSize: 10.5, color: '#fee2e2', marginTop: 2, padding: hasMedia ? '0 6px 4px' : 0 }}>
            {message.error_message}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
