import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ChatMessage,
  type MessageStatus,
  fileExtension,
  formatBytes,
  formatDuration,
  linkify,
  messageTime,
  statusHint,
} from '../../lib/inbox';
import { BRAND, DownloadIcon, FileIcon, PauseIcon, PinIcon, PlayIcon } from './InboxParts';

export type OpenMedia = (media: { url: string; kind: 'image' | 'video' }) => void;

/** Where a bubble sits in a run of messages from the same side. */
export interface RunPosition {
  first: boolean;
  last: boolean;
}

// ─── Delivery ticks ───────────────────────────────────────────────────────────
// queued → clock, sent → one check, delivered → two grey, read → two blue, failed → warning.

const StatusTick: React.FC<{ status: MessageStatus | null }> = ({ status }) => {
  const title = statusHint(status) || 'Queued';
  if (status === 'queued' || status === null) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" role="img" aria-label={title}>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" role="img" aria-label={title}>
        <circle cx="12" cy="12" r="8.5" stroke="#FECACA" strokeWidth="2" />
        <path d="M12 7.5v5M12 16h.01" stroke="#FECACA" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="11" viewBox="0 0 20 14" fill="none" role="img" aria-label={title} style={{ color: status === 'read' ? '#BDEBFF' : 'rgba(255,255,255,0.62)' }}>
      <path d="M1 7.5l3.6 3.6L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {status !== 'sent' && <path d="M7.6 11.1L14.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
};

// ─── Text ─────────────────────────────────────────────────────────────────────

/** Links open in a new tab and phone numbers dial; everything else is plain text. */
const RichText: React.FC<{ text: string; outbound: boolean }> = ({ text, outbound }) => {
  const parts = useMemo(() => linkify(text), [text]);
  const link = outbound ? 'text-white underline decoration-white/50 underline-offset-2 hover:decoration-white' : 'text-[#2F7FC4] underline decoration-[#2F7FC4]/30 underline-offset-2 hover:decoration-[#2F7FC4]';
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'url') return <a key={index} href={part.value} target="_blank" rel="noopener noreferrer" className={link} dir="ltr">{part.value}</a>;
        if (part.kind === 'phone') return <a key={index} href={`tel:${part.value.replace(/[^\d+]/g, '')}`} className={link} dir="ltr">{part.value}</a>;
        return <React.Fragment key={index}>{part.value}</React.Fragment>;
      })}
    </>
  );
};

// ─── Voice and audio ─────────────────────────────────────────────────────────

/** Bars that look like a voice note, the same for the same message. */
function waveform(seed: string, count = 30): number[] {
  let hash = 2166136261;
  for (const ch of seed) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    hash = Math.imul(hash ^ (i + 1), 2654435761) >>> 0;
    const swell = Math.sin((i / count) * Math.PI) * 0.45 + 0.35;
    return Math.max(0.18, Math.min(1, swell + ((hash % 1000) / 1000 - 0.5) * 0.6));
  });
}

const AudioPlayer: React.FC<{ message: ChatMessage; outbound: boolean }> = ({ message, outbound }) => {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(message.media_duration_seconds);
  const bars = useMemo(() => waveform(message.id), [message.id]);
  const progress = duration ? Math.min(1, current / duration) : 0;
  const playable = Boolean(message.media_url);

  useEffect(() => {
    const el = audio.current;
    if (!el) return undefined;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => { if (Number.isFinite(el.duration)) setDuration(el.duration); };
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlay);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlay);
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el || !playable) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  };
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const ratio = (rtl ? rect.right - event.clientX : event.clientX - rect.left) / rect.width;
    el.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
    setCurrent(el.currentTime);
  };

  const played = outbound ? '#fff' : BRAND;
  const rest = outbound ? 'rgba(255,255,255,0.38)' : '#CBD5E1';
  return (
    <div className="flex w-[240px] max-w-full items-center gap-2.5 py-0.5">
      {playable && <audio ref={audio} src={message.media_url ?? undefined} preload="metadata" />}
      <button
        type="button"
        onClick={toggle}
        disabled={!playable}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50"
        style={{ background: outbound ? '#fff' : BRAND, color: outbound ? BRAND : '#fff' }}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={-1}
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(current)}
          onClick={seek}
          className="flex h-7 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-full"
              style={{ height: `${Math.round(height * 100)}%`, background: (index + 0.5) / bars.length <= progress ? played : rest }}
            />
          ))}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: outbound ? 'rgba(255,255,255,0.75)' : '#8A94A6' }}>
          {formatDuration(playing || current > 0 ? current : duration)}
        </div>
      </div>
    </div>
  );
};

// ─── Media ────────────────────────────────────────────────────────────────────

const MEDIA_W = 240;

const MediaBody: React.FC<{ message: ChatMessage; outbound: boolean; onOpenMedia: OpenMedia }> = ({ message, outbound, onOpenMedia }) => {
  const { content_type: type, media_url: url, media_filename: filename, media_size_bytes: size } = message;

  if (type === 'location') {
    const { location_latitude: lat, location_longitude: lng, location_name: place } = message;
    const maps = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
    return (
      <a
        href={maps ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex w-[240px] max-w-full items-center gap-3 rounded-xl p-2.5 no-underline ${outbound ? 'bg-white/15 text-white' : 'bg-[#F3F5F8] text-[#0f1117]'}`}
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${outbound ? 'bg-white/20' : 'bg-white text-[#DC2626]'}`}><PinIcon size={18} /></span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold" dir="auto">{place || 'Shared location'}</span>
          {lat != null && lng != null && <span className="block text-[11.5px] opacity-70 tabular-nums">{Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>}
        </span>
      </a>
    );
  }

  if (type === 'audio') return <AudioPlayer message={message} outbound={outbound} />;
  if (!url) return null;

  if (type === 'image' || type === 'sticker') {
    const sticker = type === 'sticker';
    return (
      <button
        type="button"
        onClick={() => onOpenMedia({ url, kind: 'image' })}
        aria-label={`Open ${filename || (sticker ? 'sticker' : 'photo')}`}
        className="block max-w-full cursor-zoom-in overflow-hidden rounded-xl p-0"
        style={{ width: sticker ? 128 : MEDIA_W }}
      >
        <img src={url} alt="" loading="lazy" className="block h-auto max-h-[320px] w-full rounded-xl object-cover" />
      </button>
    );
  }

  if (type === 'video') {
    return (
      <button
        type="button"
        onClick={() => onOpenMedia({ url, kind: 'video' })}
        aria-label="Play video"
        className="group relative block max-w-full overflow-hidden rounded-xl bg-black p-0"
        style={{ width: MEDIA_W }}
      >
        {message.media_thumbnail_url
          ? <img src={message.media_thumbnail_url} alt="" className="block aspect-video w-full object-cover opacity-90" />
          : <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none block aspect-video w-full object-cover opacity-90" />}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
            <PlayIcon size={18} className="translate-x-px" />
          </span>
        </span>
        {message.media_duration_seconds != null && (
          <span className="absolute bottom-1.5 end-1.5 rounded-md bg-black/55 px-1.5 text-[11px] font-medium tabular-nums text-white">{formatDuration(message.media_duration_seconds)}</span>
        )}
      </button>
    );
  }

  // A document, or any other file.
  const ext = fileExtension(filename, message.media_mime_type);
  return (
    <div className={`flex w-[260px] max-w-full items-center gap-3 rounded-xl p-2.5 ${outbound ? 'bg-white/15' : 'bg-[#F3F5F8]'}`}>
      <span className={`relative grid h-11 w-10 shrink-0 place-items-center rounded-lg ${outbound ? 'bg-white text-[#2F7FC4]' : 'bg-white text-[#DC2626]'} shadow-[0_1px_2px_rgba(15,17,23,0.08)]`}>
        <FileIcon size={18} />
        <span className="absolute -bottom-1 rounded px-1 text-[8.5px] font-bold leading-[13px] tracking-wide text-white" style={{ background: outbound ? '#2F7FC4' : '#DC2626' }}>{ext}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" dir="auto" title={filename ?? undefined}>{filename || 'Document'}</span>
        <span className={`block text-[11.5px] tabular-nums ${outbound ? 'text-white/75' : 'text-[#8A94A6]'}`}>{[formatBytes(size), ext].filter(Boolean).join(' · ')}</span>
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={filename ?? true}
        aria-label={`Download ${filename || 'document'}`}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${outbound ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white text-[#4B5563] hover:text-[#0f1117]'}`}
      >
        <DownloadIcon size={16} />
      </a>
    </div>
  );
};

// ─── Bubble ───────────────────────────────────────────────────────────────────

const RADIUS = 16;
const TAIL = 4;

const MessageBubble: React.FC<{
  message: ChatMessage;
  uploading?: boolean;
  position?: RunPosition;
  onOpenMedia: OpenMedia;
}> = ({ message, uploading, position = { first: true, last: true }, onOpenMedia }) => {
  const outbound = message.direction === 'outbound';
  const failed = message.status === 'failed';
  const media = message.content_type !== 'text';
  const bare = media && !message.text_content && (message.content_type === 'image' || message.content_type === 'sticker' || message.content_type === 'video');

  // The sender's side is the 4px corner; inside a run, its top squares off too, so the run reads as one.
  const senderTop = position.first ? RADIUS : TAIL;
  const senderBottom = TAIL;
  const corners = outbound
    ? { borderStartStartRadius: RADIUS, borderEndStartRadius: RADIUS, borderStartEndRadius: senderTop, borderEndEndRadius: senderBottom }
    : { borderStartStartRadius: senderTop, borderEndStartRadius: senderBottom, borderStartEndRadius: RADIUS, borderEndEndRadius: RADIUS };

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`} style={{ marginTop: position.first ? 8 : 2 }}>
      <div
        className={`relative max-w-[65%] max-md:max-w-[82%] ${outbound ? 'text-white' : 'text-[#0f1117]'}`}
        style={{
          ...corners,
          background: failed ? '#E5484D' : outbound ? BRAND : '#fff',
          boxShadow: outbound ? '0 1px 1.5px rgba(47,127,196,0.18)' : '0 1px 1.5px rgba(15,17,23,0.07)',
          padding: media ? 4 : '7px 11px 6px',
          opacity: uploading ? 0.7 : 1,
          minWidth: 64,
        }}
      >
        {media && <MediaBody message={message} outbound={outbound} onOpenMedia={onOpenMedia} />}

        {message.text_content && (
          <div dir="auto" className="whitespace-pre-wrap break-words text-[14px] leading-[1.45]" style={{ padding: media ? '6px 7px 0' : 0 }}>
            <RichText text={message.text_content} outbound={outbound} />
          </div>
        )}

        <div
          className={`flex items-center justify-end gap-1 text-[11px] tabular-nums ${bare ? 'absolute bottom-2 end-2 rounded-full bg-black/40 px-1.5 py-px text-white' : ''}`}
          style={bare ? undefined : { marginTop: 2, padding: media ? '0 7px 3px' : 0, color: outbound ? 'rgba(255,255,255,0.72)' : 'rgba(15,17,23,0.42)' }}
        >
          {uploading && <span className="font-medium">Uploading…</span>}
          <span>{messageTime(message.created_at)}</span>
          {outbound && !uploading && <StatusTick status={message.status} />}
        </div>

        {failed && message.error_message && (
          <div className="text-[11px] text-white/90" style={{ padding: media ? '0 7px 4px' : 0 }}>{message.error_message}</div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
