import { asTabPage, pageNavigation, printDocument, printMode } from './printDocument';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints } as Navigator);
const HTML = '<!DOCTYPE html><html><head><title>Contract</title></head><body><div class="preview-bar no-print"><span>Contract</span><button onclick="window.print()">Print</button></div><div class="page">A4</div></body></html>';

const setUserAgent = (value: string) => Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
const realAgent = window.navigator.userAgent;

afterEach(() => {
  setUserAgent(realAgent);
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('where a document prints', () => {
  it('opens in this tab on a phone or tablet', () => {
    expect(printMode(nav(IPHONE), window)).toBe('page');
    expect(printMode(nav(ANDROID), window)).toBe('page');
    expect(printMode(nav(MAC, 'MacIntel', 5), window)).toBe('page'); // iPadOS
  });

  it('prints from a hidden frame on a desktop', () => {
    expect(printMode(nav(MAC, 'MacIntel', 0), window)).toBe('frame');
    expect(printMode(nav(WINDOWS, 'Win32'), window)).toBe('frame');
  });

  it('opens in this tab where printing is missing', () => {
    expect(printMode(nav(WINDOWS, 'Win32'), { print: undefined } as unknown as Window)).toBe('page');
  });
});

describe('on a phone', () => {
  it('goes to the document in this tab, with no pop-up and no alert', async () => {
    setUserAgent(IPHONE);
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    const assign = jest.spyOn(pageNavigation, 'assign').mockImplementation(() => undefined);
    const createUrl = jest.fn(() => 'blob:https://admin.homestacars.com/1');
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });

    await printDocument(HTML);

    expect(assign).toHaveBeenCalledWith('blob:https://admin.homestacars.com/1');
    expect(open).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('adds a Back button and fits the page to the screen', () => {
    const page = asTabPage(HTML);
    expect(page).toContain('history.back()');
    expect(page).toContain("'scale(' + scale + ')'");
    expect(page).not.toContain('style.zoom');
    expect(page.indexOf('<style>')).toBeLessThan(page.indexOf('</head>'));
    expect(page.indexOf('<script>')).toBeLessThan(page.indexOf('</body>'));
  });
});

describe('on a desktop', () => {
  it('prints the document from a hidden frame on this page', async () => {
    setUserAgent(WINDOWS);
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);

    const printing = printDocument(HTML);
    const frame = document.getElementById('hc-print-frame') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.style.visibility).toBe('hidden');
    expect(frame.getAttribute('srcdoc')).toBe(HTML);

    jest.spyOn(frame.contentWindow as Window, 'focus').mockImplementation(() => undefined);
    const print = jest.spyOn(frame.contentWindow as Window, 'print').mockImplementation(() => undefined);
    frame.dispatchEvent(new Event('load'));
    await printing;

    expect(print).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();

    frame.contentWindow?.dispatchEvent(new Event('afterprint'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('hc-print-frame')).toBeNull();
  });

  it('replaces a frame left from the last print', async () => {
    setUserAgent(WINDOWS);
    void printDocument(HTML);
    void printDocument(HTML);
    const frames = document.querySelectorAll<HTMLIFrameElement>('#hc-print-frame');
    expect(frames).toHaveLength(1);
    frames[0].remove();
  });
});
