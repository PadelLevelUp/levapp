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
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CLUB_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // no zone data on this runtime: fall through to the UTC date
  }
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
