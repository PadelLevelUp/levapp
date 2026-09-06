/**
 * PAD-162 — the arithmetic behind `Chart`, kept apart from the SVG.
 *
 * Everything here is pure: numbers in, numbers out. That is the point. Mobile
 * unit tests run in plain Node with `react-native` stubbed, so a component that
 * renders cannot be asserted on — but the part of a chart that is actually
 * wrong when a chart is wrong (an axis that clips the tallest bar, a bar that
 * escapes the plot, a label row that overlaps itself) lives here and is pinned.
 *
 * The chart's own reuse story is PAD-163 (absences) and PAD-166 (Presences
 * reporting): both plot one measure over ordered periods, so both want these
 * same scales.
 */

export interface ChartPoint {
  /** Short axis tick, e.g. "Mon" or "Sep". */
  label: string;
  value: number;
  /** Long, unambiguous form for the accessibility label, e.g. "1 Sep 2026". */
  fullLabel?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The value the y-axis tops out at.
 *
 * Whole numbers only — a "1.5 classes attended" tick is meaningless — with one
 * step of headroom above the tallest bar so the peak never touches the frame,
 * and a floor so a quiet period does not render one lonely full-height bar.
 */
export function axisMax(values: number[], floor = 4): number {
  const max = values.reduce((acc, v) => Math.max(acc, v), 0);
  return Math.max(floor, Math.ceil(max) + 1);
}

/**
 * Evenly spaced integer ticks from 0 to `yMax` inclusive.
 *
 * `desired` is a target, not a promise: the step is rounded up to a whole
 * number, so a yMax that does not divide evenly yields fewer ticks rather than
 * fractional ones. The last tick is always `yMax`, so the top gridline and the
 * top of the plot are the same line.
 */
export function axisTicks(yMax: number, desired = 5): number[] {
  if (yMax <= 0) return [0];
  const step = Math.max(1, Math.ceil(yMax / Math.max(1, desired - 1)));
  const ticks: number[] = [];
  for (let v = 0; v < yMax; v += step) ticks.push(v);
  ticks.push(yMax);
  return ticks;
}

/** The y pixel for `value` in a plot `height` tall (0 at the top, SVG-style). */
export function yFor(value: number, yMax: number, height: number): number {
  if (yMax <= 0) return height;
  const clamped = Math.min(Math.max(value, 0), yMax);
  return height - (clamped / yMax) * height;
}

/**
 * One rect per value, evenly spaced across `width` and grown from the baseline.
 *
 * Bars are centred in equal-width slots, so the nth bar sits under the nth
 * axis tick regardless of how wide the bars end up. `maxBarWidth` keeps the
 * marks thin when a week only has 7 of them — without it a 7-bucket week draws
 * seven fat slabs.
 *
 * A zero value gets a zero-height rect. That is deliberate: the series is
 * gap-filled server-side, and drawing a stub for an empty period would claim
 * attendance that did not happen.
 */
export function barRects(
  values: number[],
  yMax: number,
  width: number,
  height: number,
  maxBarWidth = 40,
  gapRatio = 0.3
): Rect[] {
  if (values.length === 0 || width <= 0 || height <= 0) return [];
  const slot = width / values.length;
  const barWidth = Math.max(1, Math.min(maxBarWidth, slot * (1 - gapRatio)));
  return values.map((value, i) => {
    const y = yFor(value, yMax, height);
    return {
      x: i * slot + (slot - barWidth) / 2,
      y,
      width: barWidth,
      height: height - y,
    };
  });
}

/**
 * One point per value, at the centre of the same slots `barRects` uses, so a
 * line and bars of the same series land on the same x positions.
 *
 * A single point is centred rather than pinned to the left edge — a one-bucket
 * range should not draw its only mark against the axis.
 */
export function linePoints(
  values: number[],
  yMax: number,
  width: number,
  height: number
): Point[] {
  if (values.length === 0 || width <= 0 || height <= 0) return [];
  const slot = width / values.length;
  return values.map((value, i) => ({
    x: i * slot + slot / 2,
    y: yFor(value, yMax, height),
  }));
}

/** An SVG polyline `points` attribute for a set of points. */
export function polylinePoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * Which label indices to draw so at most `max` appear, always including the
 * first and the last.
 *
 * Recharts spells this `interval="preserveStartEnd"`; there is no such thing in
 * raw SVG, and 31 daily ticks on a phone is an unreadable smear. Thinning by a
 * whole stride keeps the kept labels evenly spaced instead of clustering.
 */
export function labelIndices(count: number, max = 7): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const stride = Math.ceil((count - 1) / Math.max(1, max - 1));
  const kept: number[] = [];
  for (let i = 0; i < count - 1; i += stride) kept.push(i);
  // The last label is always shown; drop the one before it if the stride left
  // them adjacent, so the two do not collide.
  if (kept[kept.length - 1] === count - 2 && stride > 1) kept.pop();
  kept.push(count - 1);
  return kept;
}
