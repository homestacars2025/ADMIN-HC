/**
 * Prints a standalone HTML document (a contract, a replacement sheet) without a
 * pop-up. Browsers block window.open once an await has run, and the documents
 * need data first, so no window is opened at all:
 *
 * - On a desktop the document goes into a hidden iframe on this page, which is
 *   printed and then removed.
 * - Phones and tablets can't be trusted to print an iframe (iOS prints the page
 *   around it), so the document opens in this tab instead. Its own bar prints it,
 *   which also offers Save as PDF, and goes back to the app.
 */

import { hasBrandAssets, inlineBrandAssets } from './brand';

export type PrintMode = 'frame' | 'page';

const FRAME_ID = 'hc-print-frame';

/** Kept on an object so a test can watch the navigation. */
export const pageNavigation = {
  assign: (url: string) => window.location.assign(url),
};

export function printMode(nav: Navigator = navigator, win: Window = window): PrintMode {
  if (typeof win.print !== 'function') return 'page';
  const touchMac = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1; // iPadOS reports itself as a Mac
  return /iPhone|iPad|iPod|Android/i.test(nav.userAgent) || touchMac ? 'page' : 'frame';
}

// Added only when the document opens in this tab: a Back button in the bar, a
// bar that wraps on a phone, and A4 pages scaled down to the screen's width.
const PAGE_STYLE = `<style>
  @media screen {
    .preview-bar { position: sticky; top: 0; z-index: 10; flex-wrap: wrap; gap: 8px 12px; }
    .preview-bar .preview-actions { display: flex; gap: 8px; margin-inline-start: auto; }
    .preview-bar button { min-height: 44px; }
    .preview-bar button.back { background: rgba(255,255,255,0.14); }
  }
  html { -webkit-text-size-adjust: 100%; }
  @media print { .page[data-fit] { transform: none !important; margin: 0 !important; } }
</style>`;

const PAGE_SCRIPT = `<script>
(function () {
  var bar = document.querySelector('.preview-bar');
  var print = bar && bar.querySelector('button');
  if (print) {
    var actions = document.createElement('div');
    actions.className = 'preview-actions';
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = '\\u2190 Back';
    back.onclick = function () { history.back(); };
    print.parentNode.insertBefore(actions, print);
    actions.appendChild(back);
    actions.appendChild(print);
  }
  // A transform, not zoom: Safari holds zoomed text at its minimum font size,
  // which overflows and clips. The negative margins take back the space the
  // page still lays out at full size.
  function fit() {
    var width = document.documentElement.clientWidth;
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      page.removeAttribute('data-fit');
      page.style.transform = '';
      page.style.margin = '';
      var scale = width / page.offsetWidth;
      if (width > 0 && scale < 1) {
        page.setAttribute('data-fit', '');
        page.style.transformOrigin = '0 0';
        page.style.transform = 'scale(' + scale + ')';
        page.style.marginRight = (-(1 - scale) * page.offsetWidth) + 'px';
        page.style.marginBottom = (-(1 - scale) * page.offsetHeight) + 'px';
      }
    }
  }
  fit();
  window.addEventListener('resize', fit);
})();
</script>`;

/** The document as it opens in this tab. */
export function asTabPage(html: string): string {
  return html.replace('</head>', `${PAGE_STYLE}\n</head>`).replace('</body>', `${PAGE_SCRIPT}\n</body>`);
}

function openInThisTab(html: string): void {
  const url = URL.createObjectURL(new Blob([asTabPage(html)], { type: 'text/html' }));
  pageNavigation.assign(url);
}

function printInFrame(html: string): Promise<void> {
  document.getElementById(FRAME_ID)?.remove();

  const frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.title = 'Print preview';
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;');

  return new Promise((resolve) => {
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        resolve();
        return;
      }
      // Print only once the copied fonts are in, or the first page prints in a fallback face.
      const fonts = win.document.fonts?.ready ?? Promise.resolve();
      void fonts.catch(() => undefined).then(() => {
        win.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 0), { once: true });
        win.focus();
        win.print();
        resolve();
      });
    }, { once: true });
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

function printNow(html: string): Promise<void> {
  if (printMode() === 'page') {
    openInThisTab(html);
    return Promise.resolve();
  }
  return printInFrame(html);
}

/** The logo is embedded first, so it prints from the frame and survives Save as PDF or a blob: tab. */
export function printDocument(html: string): Promise<void> {
  return hasBrandAssets(html) ? inlineBrandAssets(html).then(printNow) : printNow(html);
}
