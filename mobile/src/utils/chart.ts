export interface ChartSeries {
  name: string;
  color: string;
  values: (number | null)[];
}
export interface ChartPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface ChartGeometry {
  yMin: number;
  yMax: number;
  ticks: { value: number; y: number }[];
  xFor: (index: number) => number;
  series: { name: string; color: string; paths: string[]; dots: { x: number; y: number; value: number }[] }[];
}

/** Rounds a number for axis labels without trailing noise. */
export const niceLabel = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

/**
 * Pure chart maths (kept out of the component so it can be unit-tested).
 *  - null values break the line, so missing days are shown as gaps, never as zero or interpolated.
 *  - a lone point (no neighbours) is drawn as a dot only.
 */
export function buildChart(series: ChartSeries[], count: number, width: number, height: number, pad: ChartPadding): ChartGeometry {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const margin = (hi - lo) * 0.1;
  const yMin = lo - margin;
  const yMax = hi + margin;

  const plotW = Math.max(width - pad.left - pad.right, 1);
  const plotH = Math.max(height - pad.top - pad.bottom, 1);
  const xFor = (i: number) => (count <= 1 ? pad.left + plotW / 2 : pad.left + (i * plotW) / (count - 1));
  const yFor = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const ticks = [yMin + margin, (lo + hi) / 2, yMax - margin].map((value) => ({ value, y: yFor(value) }));

  const out = series.map((s) => {
    const paths: string[] = [];
    const dots: { x: number; y: number; value: number }[] = [];
    let run: { x: number; y: number }[] = [];
    const flush = () => {
      if (run.length >= 2) paths.push(run.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
      run = [];
    };
    s.values.forEach((v, i) => {
      if (v === null) return flush();
      const p = { x: xFor(i), y: yFor(v) };
      run.push(p);
      dots.push({ ...p, value: v });
      if (i === s.values.length - 1) return;
      if (s.values[i + 1] === null) flush();
    });
    flush();
    return { name: s.name, color: s.color, paths, dots };
  });

  return { yMin, yMax, ticks, xFor, series: out };
}
