/**
 * Fonts for documents that live outside the app's stylesheet: the print windows
 * and the sandboxed mail iframe. Neither inherits @font-face rules or custom
 * properties from this page, so both are copied across from what the page
 * already loaded. That keeps a single list of fonts, always served from this
 * origin, and lets those documents write `var(--font-sans)` like the app does.
 */

const FONT_TOKENS = ['--font-sans', '--font-mono', '--font-plex-arabic'];

function collectFontFaces(): string {
  const faces: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin stylesheet can't be read, and declares none of our fonts.
      continue;
    }

    // A relative url() means nothing in a document with a different base.
    const base = sheet.href ?? document.baseURI;
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      faces.push(
        rule.cssText.replace(/url\("?([^")]+)"?\)/g, (_, url: string) => `url("${new URL(url, base).href}")`),
      );
    }
  }

  return faces.join('\n');
}

/** The CSS to place in a standalone document's <style> block. */
export function standaloneFontCss(): string {
  const root = getComputedStyle(document.documentElement);
  const tokens = FONT_TOKENS.map((name) => `${name}:${root.getPropertyValue(name).trim()};`).join('');
  return `${collectFontFaces()}\n:root{${tokens}}`;
}
