import { prepareEmailHtml, sanitizeEmailHtml } from './mailSanitize';

describe('sanitizeEmailHtml', () => {
  it('strips scripts, handlers and javascript links', () => {
    const out = sanitizeEmailHtml('<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">go</a>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('prepareEmailHtml', () => {
  const mail = [
    '<p>Hello</p>',
    '<img src="https://tracker.example/open.gif" alt="pixel">',
    '<img src="//cdn.example/logo.png" alt="logo">',
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="inline">',
    '<table background="http://cdn.example/bg.jpg"><tr><td style="color:red;background-image:url(\'https://cdn.example/hero.jpg\')">x</td></tr></table>',
  ].join('');

  it('holds back every remote image, background and CSS url, and counts them', () => {
    const { html, blocked } = prepareEmailHtml(mail, false);
    expect(blocked).toBe(4);
    expect(html).not.toMatch(/https?:\/\/|\/\/cdn/);
    expect(html).toContain('data:image/png');
    expect(html).toContain('color:red');
    expect(html).toContain('alt="pixel"');
  });

  it('leaves everything in place once images are allowed', () => {
    const { html, blocked } = prepareEmailHtml(mail, true);
    expect(blocked).toBe(0);
    expect(html).toContain('https://tracker.example/open.gif');
    expect(html).toContain('https://cdn.example/hero.jpg');
  });

  it('reports nothing for mail without remote content', () => {
    expect(prepareEmailHtml('<p>Plain <b>note</b></p>', false)).toEqual({ html: '<p>Plain <b>note</b></p>', blocked: 0 });
    expect(prepareEmailHtml(null, false)).toEqual({ html: '', blocked: 0 });
  });
});
