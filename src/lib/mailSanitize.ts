import DOMPurify from 'dompurify';

/**
 * Email HTML is written by whoever mailed us, so it is hostile input.
 *
 * Two layers: DOMPurify strips scripts, handlers, forms and anything that can
 * run, and the reader then shows the result in a sandboxed iframe that cannot
 * run scripts either. Links open in a new tab, never in the dashboard.
 */

let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^\s*(javascript|data|vbscript):/i.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

const FORBID_TAGS = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'];

/**
 * Received mail. Inline `style` attributes stay, because most email layout lives
 * there; `<style>` blocks go, because they could restyle the page around them.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ['srcset', 'formaction', 'action', 'ping'],
    ALLOW_DATA_ATTR: false,
  });
}

/** A URL fetched from someone else's server: http(s) or protocol-relative. */
const REMOTE_URL = /^\s*(https?:)?\/\//i;
/** `url(...)` inside inline CSS that points at a remote server. */
const REMOTE_CSS_URL = /url\(\s*(['"]?)\s*(https?:)?\/\/[^)]*\)/gi;

export interface PreparedEmailHtml {
  html: string;
  /** How many remote images, backgrounds or media were held back. */
  blocked: number;
}

/**
 * Received mail, ready for the reader. With `allowRemote` off (the default for
 * mail we received), every remote image, CSS background and media source is
 * removed, as Gmail does: remote images tell the sender the mail was opened and
 * from where. The reader offers "Load images" when `blocked` is above zero.
 */
export function prepareEmailHtml(html: string | null | undefined, allowRemote: boolean): PreparedEmailHtml {
  const clean = sanitizeEmailHtml(html);
  if (!clean || allowRemote) return { html: clean, blocked: 0 };

  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
  let blocked = 0;

  doc.body.querySelectorAll<HTMLElement>('img, video, audio, source, track').forEach((node) => {
    ['src', 'poster'].forEach((attr) => {
      const value = node.getAttribute(attr);
      if (value && REMOTE_URL.test(value)) {
        node.removeAttribute(attr);
        blocked += 1;
      }
    });
  });
  doc.body.querySelectorAll<HTMLElement>('[background]').forEach((node) => {
    if (REMOTE_URL.test(node.getAttribute('background') ?? '')) {
      node.removeAttribute('background');
      blocked += 1;
    }
  });
  doc.body.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    const style = node.getAttribute('style') ?? '';
    const stripped = style.replace(REMOTE_CSS_URL, () => { blocked += 1; return 'none'; });
    if (stripped !== style) node.setAttribute('style', stripped);
  });

  return { html: doc.body.innerHTML, blocked };
}

/** What we send: the composer's own output, cleaned the same way before it leaves. */
export const sanitizeOutgoingHtml = sanitizeEmailHtml;

/** The visible text of some HTML, for a preview line or an empty-body check. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeEmailHtml(html), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
