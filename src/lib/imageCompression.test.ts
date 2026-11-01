import { canCompress, scaledSize } from './imageCompression';

describe('scaledSize', () => {
  it('shrinks the long side and keeps the shape', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });

  it('never makes a small photo bigger', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('canCompress', () => {
  const MB = 1024 * 1024;

  it('takes large photos', () => {
    expect(canCompress({ type: 'image/jpeg', size: 3 * MB })).toBe(true);
    expect(canCompress({ type: 'image/png', size: MB })).toBe(true);
  });

  it('leaves everything else alone', () => {
    expect(canCompress({ type: 'application/pdf', size: 3 * MB })).toBe(false);
    expect(canCompress({ type: 'image/gif', size: 3 * MB })).toBe(false);
    expect(canCompress({ type: 'image/jpeg', size: 100 * 1024 })).toBe(false);
  });
});
