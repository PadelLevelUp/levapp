/**
 * PAD-920 (classes.instance-enrollment rule 15): a coach's add to a new-engine class that clashes
 * with another class at the same start is refused whole, `409 {code: "busy_same_hour", clashes}`.
 * Both shells read the body through here and show one line per clash, never the generic failure
 * toast. The date and time are read off the clash's `start` as written (the class's own wall clock).
 */
import type { BusySameHourClash } from "@levelup/types";
import { classDayParts, type I18nText } from "./invite-simulation";

export const BUSY_SAME_HOUR = "busy_same_hour";

/** The clashes of an axios-style error answering `409 busy_same_hour`, else null. */
export function busySameHourClashes(err: unknown): BusySameHourClash[] | null {
  if (typeof err !== "object" || err === null) return null;
  const response = (err as { response?: { status?: unknown; data?: unknown } }).response;
  if (!response || response.status !== 409) return null;
  const data = response.data as { code?: unknown; clashes?: unknown } | null;
  if (!data || data.code !== BUSY_SAME_HOUR || !Array.isArray(data.clashes)) return null;
  return data.clashes as BusySameHourClash[];
}

export function busySameHourLines(clashes: BusySameHourClash[], language: string | undefined): I18nText[] {
  return clashes.map((c) => {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(c.start ?? "");
    const { day } = classDayParts(m?.[1] ?? "", language);
    return {
      key: "calendar.busySameHour.line",
      params: { name: c.playerName, title: c.title, date: day, time: m?.[2] ?? "" },
    };
  });
}
