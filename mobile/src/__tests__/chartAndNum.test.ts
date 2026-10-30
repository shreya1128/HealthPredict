import { buildChart, niceLabel } from '@/utils/chart';
import { coerce, toNum } from '@/utils/num';
import { formatDate, formatTime, riskPalette } from '@/utils/health';

const PAD = { left: 10, right: 10, top: 10, bottom: 10 };

describe('buildChart', () => {
  it('maps higher values to higher positions (smaller y) within the plot area', () => {
    const g = buildChart([{ name: 's', color: 'x', values: [10, 20, 30] }], 3, 200, 100, PAD);
    const ys = g.series[0].dots.map((d) => d.y);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(PAD.top);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100 - PAD.bottom);
    expect(g.xFor(0)).toBe(PAD.left);
    expect(g.xFor(2)).toBe(200 - PAD.right);
  });

  it('breaks the line at missing values instead of interpolating or plotting zero', () => {
    const g = buildChart([{ name: 's', color: 'x', values: [1, 2, null, 4, 5] }], 5, 200, 100, PAD);
    expect(g.series[0].paths).toHaveLength(2);
    expect(g.series[0].dots).toHaveLength(4);
  });

  it('draws a lone point as a dot with no path', () => {
    const g = buildChart([{ name: 's', color: 'x', values: [null, 7, null] }], 3, 200, 100, PAD);
    expect(g.series[0].paths).toHaveLength(0);
    expect(g.series[0].dots).toHaveLength(1);
  });

  it('survives a flat series, a single x position and all-null data', () => {
    expect(() => buildChart([{ name: 's', color: 'x', values: [5, 5, 5] }], 3, 200, 100, PAD)).not.toThrow();
    const one = buildChart([{ name: 's', color: 'x', values: [5] }], 1, 200, 100, PAD);
    expect(one.xFor(0)).toBe(100);
    const none = buildChart([{ name: 's', color: 'x', values: [null, null] }], 2, 200, 100, PAD);
    expect(none.series[0].dots).toHaveLength(0);
  });

  it('shares one y-scale across multiple series (e.g. systolic and diastolic)', () => {
    const g = buildChart([{ name: 'a', color: 'x', values: [120] }, { name: 'b', color: 'y', values: [80] }], 1, 200, 100, PAD);
    expect(g.series[0].dots[0].y).toBeLessThan(g.series[1].dots[0].y);
  });

  it('formats axis labels compactly', () => {
    expect(niceLabel(120.4)).toBe('120');
    expect(niceLabel(23.456)).toBe('23.5');
  });
});

describe('number normalisation', () => {
  it('accepts numbers and numeric strings, rejects the rest', () => {
    expect(toNum(5)).toBe(5);
    expect(toNum('78.50')).toBe(78.5);
    expect(toNum(null)).toBeNull();
    expect(toNum('')).toBeNull();
    expect(toNum('abc')).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });
  it('coerces only the listed keys', () => {
    expect(coerce({ a: '1.5', b: '2', c: 'x' }, ['a'])).toEqual({ a: 1.5, b: '2', c: 'x' });
  });
});

describe('presentation helpers', () => {
  it('maps backend categories to labels and tolerates unknown ones', () => {
    expect(riskPalette('LOW').label).toBe('Low risk');
    expect(riskPalette('high').label).toBe('High risk');
    expect(riskPalette('SOMETHING_NEW').label).toBe('something new');
    expect(riskPalette(null).label).toBe('Not rated');
  });
  it('formats dates without time-zone drift and trims seconds from times', () => {
    expect(formatDate('2026-10-07')).toMatch(/7/);
    expect(formatDate('2026-10-07')).toMatch(/2026/);
    expect(formatDate(null)).toBe('');
    expect(formatTime('08:30:00')).toBe('08:30');
    expect(formatTime(null)).toBe('');
  });
});
