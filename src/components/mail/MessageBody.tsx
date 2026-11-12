import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { standaloneFontCss } from '../../lib/standaloneFonts';
import { sanitizeIncomingHtml } from '../../lib/sanitizeEmail';
import { textToHtml } from '../../lib/mailThreads';

/**
 * A received message body, rendered safely.
 *
 * Two layers: DOMPurify strips scripts, frames, forms and event handlers, and
 * the iframe's sandbox forbids scripts outright. The sandbox does allow
 * same-origin, which is what lets the frame size itself to its content; that is
 * only safe because no script can run inside it (`allow-scripts` is absent).
 * Popups are allowed so a link opens in a new tab, escaping the sandbox so the
 * page the user lands on works normally.
 */
const MessageBody: React.FC<{ html: string | null; text: string | null }> = ({ html, text }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);

  const srcDoc = useMemo(() => {
    const content = html ? sanitizeIncomingHtml(html) : textToHtml(text ?? '');
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  /* A document of its own: the parent's custom properties do not resolve here,
     so colours are literal and the fonts are copied in. */
  ${standaloneFontCss()}
  html,body{margin:0;padding:0;background:#fff}
  body{padding:2px 1px;font:14px/1.6 var(--font-sans);color:#1d1d1f;word-break:break-word;overflow-wrap:anywhere}
  img{max-width:100%;height:auto} table{max-width:100%!important}
  a{color:#4b86cf}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #dfe3e8;padding-left:1ex;color:#5f6368}
  p{margin:0 0 .75em}
</style></head><body dir="auto">${content}</body></html>`;
  }, [html, text]);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    const next = Math.min(Math.max(doc.documentElement.scrollHeight, 60), 6000);
    setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
  }, []);

  // Images load after the document does, so keep measuring as the body grows.
  const observer = useRef<ResizeObserver | null>(null);
  const onLoad = useCallback(() => {
    measure();
    const body = ref.current?.contentDocument?.body;
    if (!body || typeof ResizeObserver === 'undefined') return;
    observer.current?.disconnect();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(body);
  }, [measure]);

  useEffect(() => () => observer.current?.disconnect(), []);

  if (!html && !text?.trim()) {
    return <p className="py-3 text-[13px] italic text-black/35">This message has no body.</p>;
  }

  return (
    <iframe
      ref={ref}
      title="Message body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={onLoad}
      style={{ height }}
      className="block w-full border-0 bg-white"
    />
  );
};

export default MessageBody;
