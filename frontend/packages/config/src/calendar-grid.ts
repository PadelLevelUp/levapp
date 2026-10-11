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
  /** Column index within its overlap cluster. */
  column: number;
  /** Number of side-by-side columns in that cluster. */
  columns: number;
}

/** A cluster's hidden events, behind one "+N" marker (B-543). */
export interface OverflowMarker<T> extends BlockGeometry {
  /** The column the marker takes — always the cluster's last. */
  column: number;
  columns: number;
  /** The hidden events, in start order. */
  events: T[];
  /** Stable key for rendering: the cluster's first hidden event id. */
  key: string;
}

export interface DayColumnLayout<T> {
  blocks: LaidOutEvent<T>[];
  overflow: OverflowMarker<T>[];
}

/** An end at or before the start (a class ending at midnight, PAD-553) ends at 24:00. */
function endMinutes(event: GridEventLike & { startTime: string; endTime: string }): number {
  const start = toMinutes(event.startTime);
  const end = toMinutes(event.endTime);
  return end <= start ? 24 * 60 : end;
}

/**
 * B-543 (calendar.mobile-views rule 13, calendar.view rule 20): one day column. Events are
 * sorted by start and packed into lanes — each takes the first lane free at its start, so a
 * cluster of overlapping events gets as many columns as run AT ONCE (a chain of 22 classes an
 * hour long, 40 minutes apart, needs two). With `maxColumns`, a cluster needing more lanes shows
 * lanes `0 … maxColumns-2` and gives the last column to one "+N" marker holding the rest.
 */
export function layoutDayColumn<T extends GridEventLike>(
  events: T[],
  options: BlockGeometryOptions & { maxColumns?: number }
): DayColumnLayout<T> {
  const maxColumns = Math.max(1, options.maxColumns ?? Infinity);
  const timed = events.filter(hasTimes).sort((a, b) => {
    const d = toMinutes(a.startTime) - toMinutes(b.startTime);
    return d !== 0 ? d : endMinutes(b) - endMinutes(a);
  });

  // Clusters: consecutive events while each starts before the cluster's latest end.
  const clusters: (typeof timed)[] = [];
  let clusterEnd = -Infinity;
  for (const event of timed) {
    if (toMinutes(event.startTime) >= clusterEnd) {
      clusters.push([event]);
      clusterEnd = endMinutes(event);
    } else {
      clusters[clusters.length - 1].push(event);
      clusterEnd = Math.max(clusterEnd, endMinutes(event));
    }
  }

  const blocks: LaidOutEvent<T>[] = [];
  const overflow: OverflowMarker<T>[] = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const lanes = cluster.map((event) => {
      const start = toMinutes(event.startTime);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = endMinutes(event);
      return lane;
    });
    const needed = laneEnds.length;
    const capped = needed > maxColumns;
    const columns = capped ? maxColumns : needed;
    const hidden: typeof cluster = [];
    cluster.forEach((event, i) => {
      const lane = lanes[i];
      if (capped && lane >= maxColumns - 1) {
        hidden.push(event);
        return;
      }
      const geometry = eventBlockGeometry(event, options);
      if (geometry) blocks.push({ event: event as T, column: lane, columns, ...geometry });
    });
    if (hidden.length) {
      const first = Math.min(...hidden.map((e) => toMinutes(e.startTime)));
      const last = Math.max(...hidden.map((e) => endMinutes(e)));
      const span = eventBlockGeometry(
        { id: "overflow", date: hidden[0].date, startTime: minutesToTime(first), endTime: minutesToTime(last) },
        options
      )!;
      overflow.push({
        column: columns - 1,
        columns,
        events: hidden as T[],
        key: String(hidden[0].id),
        ...span,
      });
    }
  }
  return { blocks, overflow };
}

function minutesToTime(m: number): string {
  const clamped = Math.min(m, 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** One day column's blocks, uncapped: geometry plus packed side-by-side placement (B-543). */
export function layoutDayEvents<T extends GridEventLike>(
  events: T[],
  options: BlockGeometryOptions
): LaidOutEvent<T>[] {
  return layoutDayColumn(events, options).blocks;
}

/** One hour row of the time grid, in px / pt, on both shells (rule 13). */
export const GRID_ROW_HEIGHT = 44;
/** The day sheet's grab-handle row (calendar.mobile-views rule 3, PAD-286). */
export const SHEET_HANDLE_HEIGHT = 28;
/** The DayHeader block: 48px circle plus its paddings (rule 3). */
export const DAY_HEADER_HEIGHT = 76;
/** Handle row plus header: what stays visible at the sheet's `max`. */
export const SHEET_COLLAPSED_HEIGHT = SHEET_HANDLE_HEIGHT + DAY_HEADER_HEIGHT;
/**
 * The Mês weekday header row (rule 16), fixed on both shells so the sheet's
 * maximum — one GRID_ROW_HEIGHT below the month grid's top (rule 17) — always
 * leaves it fully visible, whatever the font scale.
 */
export const MONTH_WEEKDAY_HEADER_HEIGHT = 30;

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
 * Mês (PAD-286) it is the month grid plus the space below it, and `gridTop` is
 * where the month grid ends: the sheet rests there, filling everything below
 * (PAD-436: the single-day grid that used to sit under it showed the selected
 * day twice), and dragged up it stops one row below the top of the month grid,
 * so it can cover more than half of a phone screen.
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
  // PAD-436 (rule 17): with a block above (Mês's month grid) the sheet rests right under it and
  // fills the rest; there is no day grid below it any more. Without one (Semana), it rests at 60%
  // of the time grid, as before.
  const rest = gridTop > 0 ? gridTop : Math.round(containerHeight * 0.6);
  const initial = clampSheetTop(rest, { min, max });
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
