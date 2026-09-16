/**
 * B-060: the club's date. Class times are stored on the Europe/Lisbon wall
 * clock (R-023, PAD-256), so "today", "this week" and "this month" are read off
 * that clock, whatever the device's zone.
 */
export const CLUB_TIME_ZONE = "Europe/Lisbon";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Today on the club's clock as `YYYY-MM-DD`. Falls back to the UTC date when the
 * runtime has no time-zone data, the same fallback `invite-simulation` uses.
 */
export function clubTodayISO(now: Date = new Date()): string {
  const p = lisbonParts(now);
  if (p) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * The club's date anchored at UTC midnight: a calendar container for `Date.UTC`
 * arithmetic that hands back bare dates through `toISOString().slice(0, 10)`.
 */
export function clubTodayUtcDate(now: Date = new Date()): Date {
  const [y, m, d] = clubTodayISO(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** A `Date` whose LOCAL fields carry the club's wall clock. Rendering only (see `lisbonNow`). */
export type ClubWallClock = Date & { readonly __clubWallClock: true };

type WallParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

// One formatter per process: constructing an Intl.DateTimeFormat is the expensive
// part (ICU lookup), and lisbonNow()/isClubToday() run per card and per grid cell.
let lisbonFormatter: Intl.DateTimeFormat | null = null;

/** Lisbon's wall-clock digits for an instant, or null when the runtime has no zone data. */
function lisbonParts(now: Date): WallParts | null {
  try {
    lisbonFormatter ??= new Intl.DateTimeFormat("en-CA", {
      timeZone: CLUB_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = lisbonFormatter.formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const [y, m, d, h, mi, s] = ["year", "month", "day", "hour", "minute", "second"].map(get);
    if ([y, m, d, h, mi, s].every(Number.isFinite)) {
      // Some engines print midnight as "24" with hour12: false.
      return { y, m, d, h: h === 24 ? 0 : h, mi, s };
    }
  } catch {
    // no zone data on this runtime: the callers fall back to the UTC wall clock
  }
  return null;
}

/**
 * "Now" on the club's clock as a local `Date` (PAD-295, B-066) — for RENDERING
 * and for building calendar days: `format(lisbonNow(), …)`, `isSameDay`,
 * `startOfWeek`. Its `getTime()` / `toISOString()` are NOT the current instant,
 * and a device-local Date can be pushed across the device's own DST gap, so
 * never compare it with a stored time: comparisons use `lisbonNowMs()` against
 * `wallClockMs()` / `wallClockISOMs()`, which are UTC-anchored digits with no
 * gaps. Same UTC fallback as `clubTodayISO`.
 */
export function lisbonNow(now: Date = new Date()): ClubWallClock {
  const p = lisbonParts(now);
  const date = p
    ? new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s, now.getMilliseconds())
    : new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getMilliseconds()
      );
  return date as ClubWallClock;
}

/**
 * "Now" on the club's clock as UTC-anchored digits — the number every client
 * comparison with a stored class time, deadline or window uses (calendar.view
 * rule 16, attendance.confirm rules 7/9). `Date.UTC` has no DST gaps on any
 * device, so the order is always the digit order. Pairs with `wallClockMs` and
 * `wallClockISOMs`; `now` is a real instant.
 */
export function lisbonNowMs(now: Date = new Date()): number {
  const p = lisbonParts(now);
  return p
    ? Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s, now.getMilliseconds())
    : Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getMilliseconds()
      );
}

/** Stored `YYYY-MM-DD` + `HH:mm` digits as UTC-anchored ms; NaN when unreadable. */
export function wallClockMs(date: string, time: string): number {
  const [y, m, d] = (date ?? "").split("-").map(Number);
  const [hh, mm] = (time ?? "").split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(y, m - 1, d, hh, mm);
}

const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * A server ISO string as club digits, UTC-anchored: a naive string
 * (`isoformat()` of a wall-clock value: reminder `startsAt`, `cancellationDeadline`,
 * `windowOpenAt`) is read digit by digit, never through the engine's string
 * parser; a string with `Z` or an offset is a real instant and is taken through
 * Lisbon. NaN when unreadable.
 */
export function wallClockISOMs(iso: string): number {
  const m = NAIVE_ISO.exec(iso ?? "");
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), s ? Number(s) : 0);
  }
  if (HAS_OFFSET.test(iso ?? "")) {
    const instant = new Date(iso);
    return Number.isNaN(instant.getTime()) ? NaN : lisbonNowMs(instant);
  }
  return NaN;
}

/** Whether a local calendar `day` is today on the club's clock (`now` is an instant). */
export function isClubToday(day: Date, now: Date = new Date()): boolean {
  const today = lisbonNow(now);
  return (
    day.getFullYear() === today.getFullYear() &&
    day.getMonth() === today.getMonth() &&
    day.getDate() === today.getDate()
  );
}
