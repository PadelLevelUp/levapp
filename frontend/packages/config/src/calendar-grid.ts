/**
 * Geometry for the phone calendar's time grid and day sheet —
 * calendar.mobile-views rules 3 and 13 (PAD-247).
 *
 * Shared by web and iOS so the two shells agree on the visible hour range,
 * where a block sits, how overlapping blocks share a column, and how far the
 * day sheet may be dragged. Like the rest of `@levelup/config` it takes
 * minimal structural shapes instead of `@levelup/types`.
 */

export interface GridEventLike {
  id: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface HourRange {
  /** First visible hour (inclusive). */
  startHour: number;
  /** Last visible hour (the bottom rule of the grid). */
  endHour: number;
}

export interface HourRangeOptions {
  defaultStart?: number;
  defaultEnd?: number;
  min?: number;
  max?: number;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hasTimes(event: GridEventLike): event is GridEventLike & {
  startTime: string;
  endTime: string;
} {
  return typeof event.startTime === "string" && typeof event.endTime === "string";
}

/**
 * Rule 13: from one hour before the earliest start to one hour after the
 * latest end, on whole hours, clamped to 07:00–23:00; 08:00–20:00 when the
 * range has no events.
 */
export function resolveHourRange(
  events: GridEventLike[],
  { defaultStart = 8, defaultEnd = 20, min = 7, max = 23 }: HourRangeOptions = {}
): HourRange {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const event of events) {
    if (!hasTimes(event)) continue;
    earliest = Math.min(earliest, toMinutes(event.startTime));
    latest = Math.max(latest, toMinutes(event.endTime));
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return { startHour: defaultStart, endHour: defaultEnd };
  }
  const startHour = Math.max(min, Math.floor(earliest / 60) - 1);
  const endHour = Math.min(max, Math.ceil(latest / 60) + 1);
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

export interface BlockGeometryOptions {
  startHour: number;
  /** Pixels per hour. */
  rowHeight: number;
  /** Floor so a five-minute event still has a tappable block. */
  minHeight?: number;
}

export interface BlockGeometry {
  top: number;
  height: number;
}

/** Rule 13: top and height from the event's start and end minutes. */
export function eventBlockGeometry(
  event: GridEventLike,
  { startHour, rowHeight, minHeight = 18 }: BlockGeometryOptions
): BlockGeometry | null {
  if (!hasTimes(event)) return null;
  const start = toMinutes(event.startTime) - startHour * 60;
  const end = toMinutes(event.endTime) - startHour * 60;
  const top = (start / 60) * rowHeight;
  const height = Math.max(minHeight, ((end - start) / 60) * rowHeight);
  return { top, height };
}

/**
 * Events whose [start, end) intervals intersect share a group; adjacent
 * events (one ends when the next starts) do not. Lifted from the desktop
 * `CalendarGrid`, which now imports it.
 */
export function groupOverlappingEvents<T extends GridEventLike>(events: T[]): T[][] {
  const groups: T[][] = [];
  for (const event of events) {
    if (!hasTimes(event)) {
      groups.push([event]);
      continue;
    }
    let placed = false;
    for (const group of groups) {
      if (
        group.some(
          (e) =>
            hasTimes(e) &&
            toMinutes(e.startTime) < toMinutes(event.endTime) &&
            toMinutes(event.startTime) < toMinutes(e.endTime)
        )
      ) {
        group.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([event]);
  }
  return groups;
}

export interface LaidOutEvent<T> extends BlockGeometry {
  event: T;
  /** Column index within its overlap group. */
  column: number;
  /** Number of side-by-side columns in that group. */
  columns: number;
}

/** One day column's blocks: geometry plus side-by-side placement for overlaps. */
export function layoutDayEvents<T extends GridEventLike>(
  events: T[],
  options: BlockGeometryOptions
): LaidOutEvent<T>[] {
  const sorted = [...events].sort((a, b) =>
    (a.startTime ?? "").localeCompare(b.startTime ?? "")
  );
  const laid: LaidOutEvent<T>[] = [];
  for (const group of groupOverlappingEvents(sorted)) {
    group.forEach((event, column) => {
      const geometry = eventBlockGeometry(event, options);
      if (!geometry) return;
      laid.push({ event, column, columns: group.length, ...geometry });
    });
  }
  return laid;
}

export interface SheetBounds {
  /** Highest the sheet may go: one hour row of the container's top stays visible. */
  min: number;
  /** Lowest the sheet may go: only its handle and header remain. */
  max: number;
  /** Where it opens: roughly 40 % of the day grid covered. */
  initial: number;
}

/**
 * Rules 3 and 17: the sheet's travel, measured as its top edge from the top of
 * the container it is dragged in. In Semana the container is the time grid. In
 * Mês (PAD-286) it is the month grid plus the single-day grid, and `gridTop`
 * is where the day grid starts inside it: the sheet still rests over the day
 * grid, but dragged up it stops one row below the top of the month grid, so
 * it can cover more than half of a phone screen.
 */
export function sheetTopBounds(
  containerHeight: number,
  {
    rowHeight,
    collapsedHeight,
    gridTop = 0,
  }: { rowHeight: number; collapsedHeight: number; gridTop?: number }
): SheetBounds {
  const min = rowHeight;
  const max = containerHeight - collapsedHeight;
  const initial = clampSheetTop(gridTop + Math.round((containerHeight - gridTop) * 0.6), {
    min,
    max,
  });
  return { min, max, initial };
}

export function clampSheetTop(top: number, { min, max }: { min: number; max: number }): number {
  if (max < min) return max;
  return Math.min(max, Math.max(min, top));
}

/**
 * Rule 18 (PAD-248, coordinator decision): is the sheet dragged above its
 * resting height? In Mês the shells hide the floating add buttons while this
 * is true; at rest or lower they show.
 */
export function isSheetRaised(top: number, bounds: SheetBounds): boolean {
  return top < bounds.initial;
}
