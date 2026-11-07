import { BRAND_ALT, brandImgHtml, brandSrc, inlineBrandAssets } from './brand';

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('the official logo files', () => {
  it('are served from /brand with clean names', () => {
    expect(brandSrc('icon')).toBe('/brand/homesta-icon.png');
    expect(brandSrc('wordmarkLight')).toBe('/brand/homesta-wordmark-light.png');
    expect(brandSrc('wordmarkDark')).toBe('/brand/homesta-wordmark-dark.png');
  });

  it('print at their own ratio, with no filter or shadow', () => {
    const img = brandImgHtml('wordmarkLight', '30px');
    expect(img).toContain(`src="${brandSrc('wordmarkLight')}"`);
    expect(img).toContain(`alt="${BRAND_ALT}"`);
    expect(img).toContain('height:30px;width:auto');
    expect(img).toContain('filter:none');
    expect(img).toContain('box-shadow:none');
  });
});

describe('embedding the logo in a printed document', () => {
  it('swaps the file for a base64 PNG', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, blob: async () => png })) as unknown as typeof fetch;

    const html = await inlineBrandAssets(`<header>${brandImgHtml('icon', '18px')}</header><footer>${brandImgHtml('icon', '18px')}</footer>`);

    expect(html).not.toContain(brandSrc('icon'));
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the absolute URL when the file cannot load, and never throws', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

    const html = await inlineBrandAssets(brandImgHtml('wordmarkLight', '30px'));

    expect(html).toContain(`src="${window.location.origin}/brand/homesta-wordmark-light.png"`);
  });

  it('leaves a document without the logo as it was', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(inlineBrandAssets('<p>No logo</p>')).resolves.toBe('<p>No logo</p>');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
