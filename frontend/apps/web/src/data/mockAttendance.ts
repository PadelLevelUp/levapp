import type {
  AbsenceHistory,
  AbsenceSession,
  AttendanceBucket,
  AttendanceGranularity,
  AttendanceHistory,
  AttendanceSession,
} from "@/types";

/**
 * PAD-114 — demo-mode payload for the attendance page.
 *
 * `USE_MOCK_DATA` defaults to true when `VITE_USE_MOCK_DATA` is unset, so
 * without this the page would render its error card whenever the app runs
 * without a backend. It mirrors the real endpoint's contract exactly — same
 * granularity rule, same gap-filled bucket series, same `lessoninstance-<id>`
 * deep-link shape — so the mock cannot teach the UI a shape the server never
 * sends.
 */

const MOCK_TITLES = [
  "Academy Class",
  "Technique Session",
  "Match Play",
  "Drills & Conditioning",
];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseBound(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Same rule as the server: <=31d daily, <=~18mo monthly, else yearly. */
function pickGranularity(start: Date, end: Date): AttendanceGranularity {
  const spanDays = Math.round(
    (end.getTime() - start.getTime()) / (24 * 3600 * 1000)
  );
  if (spanDays <= 31) return "day";
  if (spanDays <= 550) return "month";
  return "year";
}

function bucketStart(d: Date, granularity: AttendanceGranularity): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (granularity === "day") return new Date(Date.UTC(y, m, d.getUTCDate()));
  if (granularity === "month") return new Date(Date.UTC(y, m, 1));
  return new Date(Date.UTC(y, 0, 1));
}

function nextBucket(d: Date, granularity: AttendanceGranularity): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (granularity === "day")
    return new Date(Date.UTC(y, m, d.getUTCDate() + 1));
  if (granularity === "month") return new Date(Date.UTC(y, m + 1, 1));
  return new Date(Date.UTC(y + 1, 0, 1));
}

export function buildMockAttendanceHistory(params: {
  playerId?: number | string;
  from?: string;
  to?: string;
}): AttendanceHistory {
  const now = new Date();
  const defaultStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const defaultEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  );

  const start = parseBound(params.from, defaultStart);
  const end = parseBound(params.to, defaultEnd);
  const granularity = pickGranularity(start, end);

  // A handful of attended classes spread deterministically across the window,
  // in the past only — a history page never shows classes that have not
  // happened yet.
  const spanDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000))
  );
  const horizon = Math.min(end.getTime(), now.getTime());
  const sessions: AttendanceSession[] = [];
  for (let i = 0; i < 6; i += 1) {
    const offset = Math.round((spanDays * (i + 1)) / 8);
    const day = new Date(start.getTime() + offset * 24 * 3600 * 1000);
    if (day.getTime() > horizon) continue;
    const date = toIsoDate(day);
    const id = 900 + i;
    sessions.push({
      lessonInstanceId: id,
      calendarEventId: `lessoninstance-${id}`,
      title: MOCK_TITLES[i % MOCK_TITLES.length],
      startDatetime: `${date}T11:00:00`,
      date,
      color: "#6366f1",
      href: `/calendar?classId=lessoninstance-${id}&date=${date}`,
    });
  }
  sessions.reverse(); // most recent first, like the server

  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = toIsoDate(
      bucketStart(new Date(`${session.date}T00:00:00Z`), granularity)
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: AttendanceBucket[] = [];
  let cursor = bucketStart(start, granularity);
  const last = bucketStart(end, granularity);
  while (cursor <= last && buckets.length < 2000) {
    const key = toIsoDate(cursor);
    buckets.push({ start: key, count: counts.get(key) ?? 0 });
    cursor = nextBucket(cursor, granularity);
  }

  return {
    playerId: Number(params.playerId ?? 1),
    playerName: "Demo Player",
    from: `${toIsoDate(start)}T00:00:00`,
    to: `${toIsoDate(end)}T23:59:59`,
    granularity,
    total: sessions.length,
    buckets,
    sessions,
  };
}

/**
 * PAD-141 — demo-mode payload for the "Faltas" page.
 *
 * Built from the attendance mock rather than duplicating the bucket/granularity
 * logic, for the same reason the two real endpoints share a service: a second
 * copy is how the two pages drift. Fewer sessions than the attendance mock so
 * demo mode does not imply a student misses as many classes as they attend, and
 * justifications alternate so the row labelling is visible without a backend.
 */
export function buildMockAbsenceHistory(params: {
  playerId?: number | string;
  from?: string;
  to?: string;
}): AbsenceHistory {
  const base = buildMockAttendanceHistory(params);

  const sessions: AbsenceSession[] = base.sessions
    .slice(0, 3)
    .map((session, i) => ({
      ...session,
      // Offset the ids so a mock absence can never collide with a mock
      // attendance for the same class.
      lessonInstanceId: session.lessonInstanceId + 100,
      calendarEventId: `lessoninstance-${session.lessonInstanceId + 100}`,
      href: `/calendar?classId=lessoninstance-${
        session.lessonInstanceId + 100
      }&date=${session.date}`,
      justification: i % 2 === 0 ? "justified" : "unjustified",
    }));

  const kept = new Set(sessions.map((s) => s.date));
  const buckets = base.buckets.map((bucket) => ({
    ...bucket,
    count: kept.has(bucket.start) ? 1 : 0,
  }));

  return { ...base, total: sessions.length, buckets, sessions };
}
