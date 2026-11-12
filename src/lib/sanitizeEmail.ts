import DOMPurify from 'dompurify';

/**
 * Two sanitizers, one per direction.
 *
 * Incoming `body_html` is written by whoever emailed us, so it is hostile. It is
 * cleaned here and then rendered in a sandboxed iframe that may not run scripts;
 * either layer alone would stop a script, and both together also stop forms,
 * frames and tracking-style tricks that are not scripts.
 *
 * Outgoing HTML comes from our own editor and pasted text, and goes out in mail
 * under our name, so it is held to a short list of formatting tags.
 */

const FORBIDDEN_IN = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
  'button', 'select', 'textarea', 'meta', 'link', 'base', 'svg', 'math', 'audio', 'video',
];

let hooked = false;

function ensureHooks(): void {
  if (hooked) return;
  hooked = true;
  // Links in mail open in a new tab and never hand the opener over.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/** For display. Keeps `<style>` and inline styles: newsletters are unreadable without them. */
export function sanitizeIncomingHtml(html: string): string {
  ensureHooks();
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: FORBIDDEN_IN,
    FORBID_ATTR: ['srcdoc', 'formaction', 'action', 'ping'],
    ALLOW_DATA_ATTR: false,
  });
}

const OUT_TAGS = [
  'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li',
  'blockquote', 'h1', 'h2', 'h3', 'pre', 'code', 'hr', 'img', 'table', 'thead', 'tbody', 'tr',
  'td', 'th', 'font', 'center', 'sub', 'sup',
];

/** For sending: formatting only. */
export function sanitizeOutgoingHtml(html: string): string {
  ensureHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: OUT_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'src', 'alt', 'width', 'height', 'align', 'colspan', 'rowspan', 'color', 'dir'],
    ALLOW_DATA_ATTR: false,
  });
}

/** True when an editor's HTML has no visible text and no image. */
export function isBlankHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').trim() === '';
}
