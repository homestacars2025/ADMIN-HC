import React, { useEffect, useMemo, useRef, useState } from 'react';
import { escapeHtml } from '../../lib/mailThreads';
import { prepareEmailHtml } from '../../lib/mailSanitize';
import { standaloneFontCss } from '../../lib/standaloneFonts';
import { ImageOffIcon, TextIcon } from './mailIcons';

/**
 * A message body, safely.
 *
 * DOMPurify cleans the HTML first. It is then shown in an iframe whose sandbox
 * allows no scripts, so even something DOMPurify missed cannot run. Same-origin
 * is allowed only so the frame can be sized to its content (that is safe without
 * allow-scripts), and popups so a link can open in a new tab.
 *
 * Mail we received has its remote images held back until "Load images", as in
 * Gmail; a Content-Security-Policy in the frame backs that up. Our own sent mail
 * shows as written.
 */

/** Holds back anything remote that slipped past the DOM pass: only inline images may load. */
const BLOCK_REMOTE_CSP = '<meta http-equiv="Content-Security-Policy" content="img-src data: blob:; media-src data: blob:">';

interface MailBodyProps {
  html: string | null;
  text: string | null;
  /** Hold back remote images until asked. On for received mail. */
  blockRemote: boolean;
}

export const MailBody: React.FC<MailBodyProps> = ({ html, text, blockRemote }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const [imagesAllowed, setImagesAllowed] = useState(false);
  const hasText = Boolean(text && text.trim());
  const [plain, setPlain] = useState(false);

  const allowRemote = !blockRemote || imagesAllowed;
  const prepared = useMemo(() => prepareEmailHtml(html, allowRemote), [html, allowRemote]);
  const showPlain = plain || !prepared.html;

  const srcDoc = useMemo(() => {
    const content = showPlain
      ? `<div class="plain">${escapeHtml(text ?? '')}</div>`
      : prepared.html;
    return `<!doctype html><html><head><meta charset="utf-8">${allowRemote ? '' : BLOCK_REMOTE_CSP}<base target="_blank">
<style>
  ${standaloneFontCss()}
  html,body{margin:0;padding:0;background:#fff}
  body{padding:2px 1px;font:14px/1.65 var(--font-sans),system-ui,sans-serif;color:#1a1a1a;word-break:break-word;overflow-wrap:anywhere;overflow-x:auto;overflow-y:hidden}
  img{max-width:100%;height:auto} table{max-width:100%!important} pre{white-space:pre-wrap}
  a{color:#3f7fcf}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #d6dbe1;padding-left:1ex;color:#555}
  .plain{white-space:pre-wrap;font-size:13.5px}
</style></head><body dir="auto">${content}</body></html>`;
  }, [showPlain, text, prepared.html, allowRemote]);

  // The frame takes its content's height, so a long message is never cut off.
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(Math.max(body.scrollHeight + 8, 48));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
      // Images that arrive after load change the height.
      frame.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  if (!html && !hasText) {
    return <div className="py-4 text-[13px] text-black/35">This message has no body.</div>;
  }

  const showImageNotice = !showPlain && prepared.blocked > 0 && !imagesAllowed;
  const canTogglePlain = hasText && Boolean(html);

  return (
    <div>
      {(showImageNotice || canTogglePlain) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {showImageNotice && (
            <div className="flex min-h-[36px] flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-black/[0.035] px-3 py-1.5 text-[12.5px] text-black/60">
              <ImageOffIcon size={15} className="shrink-0 text-black/40" />
              <span className="min-w-0 flex-1">Images are hidden to protect your privacy.</span>
              <button
                type="button"
                onClick={() => setImagesAllowed(true)}
                className="h-8 rounded-lg px-2 text-[12.5px] font-semibold text-[#3f7fcf] transition-colors hover:bg-[#6ea4e7]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/50 max-sm:h-11"
              >
                Load images
              </button>
            </div>
          )}
          {canTogglePlain && (
            <button
              type="button"
              aria-pressed={plain}
              onClick={() => setPlain((v) => !v)}
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-black/50 transition-colors hover:bg-black/[0.05] hover:text-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/50 aria-pressed:bg-black/[0.06] aria-pressed:text-black/80 max-sm:h-11"
            >
              <TextIcon size={14} />
              {plain ? 'Formatted view' : 'Plain text'}
            </button>
          )}
        </div>
      )}
      <iframe
        ref={ref}
        title="Message body"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        style={{ height }}
        className="block w-full border-0 bg-white"
      />
    </div>
  );
};
