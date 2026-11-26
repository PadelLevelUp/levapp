import { format } from "date-fns";

import { resolveDateLocale } from "./dateLocale";

/**
 * calendar.event-detail rule 28 (UI idea 6): what the class page's header block says about when a class is — the
 * date tile's three words, the date spoken in full, and the time range — from ONE helper, so web and iOS never
 * spell them differently. (`classWhenLabel` in `class-when.ts` is another surface's string and is not this.)
 *
 * The digits are the stored ones, read as they are with no zone conversion, so a late class never moves day; only
 * the weekday and month names follow the language. What is missing is a dash, never an invented value.
 */
export interface ClassWhenHeaderParts {
  /** The tile's weekday, short: "ter" / "Tue". */
  weekday: string;
  /** The tile's day number, the largest thing in it: "24". */
  day: string;
  /** The tile's month, short: "nov" / "Nov". */
  month: string;
  /** The whole date as one spoken line: "terça-feira, 24 de novembro de 2026". */
  spokenDate: string;
  /** "10:30 – 12:00", with the spaces the sheet uses; a class ending at midnight says "00:00". */
  timeRange: string;
}

const DASH = "—";

export function classWhenHeader(
  input: { date?: string | null; startTime?: string | null; endTime?: string | null },
  language?: string
): ClassWhenHeaderParts {
  const timeRange = !input.startTime && !input.endTime ? DASH : `${input.startTime || DASH} – ${input.endTime || DASH}`;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.date ?? "");
  if (!match) return { weekday: DASH, day: DASH, month: DASH, spokenDate: DASH, timeRange };

  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // A local Date built from the stored calendar day: only its names are read, never its clock.
  const date = new Date(y, m - 1, d);
  const locale = resolveDateLocale(language);
  const portuguese = locale.code === "pt";
  return {
    weekday: format(date, "EEE", { locale }),
    day: String(d),
    month: format(date, "MMM", { locale }),
    spokenDate: format(date, portuguese ? "EEEE, d 'de' MMMM 'de' yyyy" : "EEEE, d MMMM yyyy", { locale }),
    timeRange,
  };
}
